import { hasAuthoritativeVerifiedEmail } from "@/auth/identityRouteState";
import { legal } from "@/config/legal";
import { AppError } from "@/domain/errors";
import type { LegalConsentRecord, PendingLegalConsent } from "@/domain/legalConsent";
import { resolveSignedInOnboardingContinuation } from "@/domain/ageEligibility";
import type { PhoneE164, UEID, UserProfile } from "@/domain/types";
import type { ProfilePatch } from "@/services/auth/types";
import {
  CONSENT_RECONCILE_SOURCE,
  resolvePendingConsentForVerifiedProfile,
} from "@/services/consent/pendingConsentReconcile";

const PENDING_KEY = "vyd_pending_legal_consent_v1";

type ConsentKv = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

type PendingConsentEnvelope = {
  generation: number;
  pending: PendingLegalConsent;
};

let consentKv: ConsentKv | null = null;
let pendingSaveQueue: Promise<void> = Promise.resolve();

function activeConsentKv(): ConsentKv {
  if (!consentKv) consentKv = defaultConsentStorage();
  return consentKv;
}

/** Test hook. Pass null to restore AsyncStorage. */
export function __setLegalConsentStorageForTests(next: ConsentKv | null): void {
  consentKv = next;
  pendingSaveQueue = Promise.resolve();
}

function parseEnvelope(raw: string | null): PendingConsentEnvelope | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingConsentEnvelope> & Partial<PendingLegalConsent>;
    if (
      parsed &&
      typeof parsed.generation === "number" &&
      parsed.pending &&
      typeof parsed.pending.phoneE164 === "string" &&
      parsed.pending.record
    ) {
      return { generation: parsed.generation, pending: parsed.pending };
    }
    if (parsed && typeof parsed.phoneE164 === "string" && parsed.record) {
      return {
        generation: 1,
        pending: { phoneE164: parsed.phoneE164, record: parsed.record },
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function readEnvelope(): Promise<PendingConsentEnvelope | null> {
  return parseEnvelope(await activeConsentKv().getItem(PENDING_KEY));
}

function assertContinuationUid(initiatingUid: string, currentUid: string | null): void {
  if (!currentUid || currentUid !== initiatingUid) {
    throw new AppError("permission_denied", "session_changed");
  }
}

function appVersion(): string {
  try {
    const constants = require("expo-constants").default as { expoConfig?: { version?: string } };
    return constants.expoConfig?.version ?? "1.0.0";
  } catch {
    return "1.0.0";
  }
}

function platformOs(): string {
  try {
    const { Platform } = require("react-native") as { Platform: { OS: string } };
    return Platform.OS || "unknown";
  } catch {
    return "unknown";
  }
}

function defaultConsentStorage(): ConsentKv {
  const storage = require("@react-native-async-storage/async-storage").default as ConsentKv;
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key),
  };
}

export function buildConsentRecord(input: {
  sourceScreen: string;
  phoneE164?: PhoneE164;
  userId?: string;
  ueid?: UEID;
}): LegalConsentRecord {
  return {
    consentVersion: legal.consentVersion,
    termsVersion: legal.termsVersion,
    privacyVersion: legal.privacyVersion,
    effectiveDate: legal.effectiveDate,
    acceptedAt: Date.now(),
    userId: input.userId,
    ueid: input.ueid,
    phoneE164: input.phoneE164,
    appVersion: appVersion(),
    platform: platformOs(),
    sourceScreen: input.sourceScreen,
  };
}

/** Store consent locally until UEID/profile exists (pre-auth OTP send). */
export async function savePendingConsent(phoneE164: PhoneE164, sourceScreen: string): Promise<void> {
  await serializePendingConsentSave(phoneE164, sourceScreen);
}

/**
 * Write the next pending choice and return its generation. Saves are queued
 * so a later choice cannot share a generation with an earlier one.
 */
export function serializePendingConsentSave(
  phoneE164: PhoneE164,
  sourceScreen: string
): Promise<number> {
  const run = pendingSaveQueue.then(async () => {
    const current = await readEnvelope();
    const generation = (current?.generation ?? 0) + 1;
    const pending: PendingLegalConsent = {
      phoneE164,
      record: buildConsentRecord({ sourceScreen, phoneE164 }),
    };
    const envelope: PendingConsentEnvelope = { generation, pending };
    await activeConsentKv().setItem(PENDING_KEY, JSON.stringify(envelope));
    return generation;
  });
  pendingSaveQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export async function loadPendingConsent(): Promise<PendingLegalConsent | null> {
  const envelope = await readEnvelope();
  return envelope?.pending ?? null;
}

export async function loadPendingConsentGeneration(): Promise<number | null> {
  const envelope = await readEnvelope();
  return envelope?.generation ?? null;
}

/** Explicit local wipe. Profile-save acknowledgement must use the generation token. */
export async function clearPendingConsent(): Promise<void> {
  await activeConsentKv().removeItem(PENDING_KEY);
}

/**
 * Drop the pending copy only when `generation` is still the latest choice.
 * An older acknowledgement leaves a newer pending consent in place.
 */
export function acknowledgePendingConsentPersisted(generation: number): Promise<boolean> {
  const run = pendingSaveQueue.then(async () => {
    const current = await readEnvelope();
    if (!current || current.generation !== generation) return false;
    await activeConsentKv().removeItem(PENDING_KEY);
    return true;
  });
  pendingSaveQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export type ConsentProfilePatch = {
  patch: ProfilePatch;
  generation: number;
};

/** Merge pending consent into a profile patch. Does not clear the retry copy. */
export async function consentPatchForProfile(
  profile: UserProfile
): Promise<ConsentProfilePatch | null> {
  const envelope = await readEnvelope();
  const hasCurrentConsentVersion = (profile.legalConsents ?? []).some(
    (c) => c.consentVersion === legal.consentVersion
  );
  const pending = resolvePendingConsentForVerifiedProfile({
    pending: envelope?.pending ?? null,
    verifiedPhoneE164: profile.phoneE164,
    hasCurrentConsentVersion,
    rebuildRecord: buildConsentRecord({
      sourceScreen: CONSENT_RECONCILE_SOURCE,
      phoneE164: profile.phoneE164,
    }),
  });
  if (!pending) return null;

  const record: LegalConsentRecord = {
    ...pending.record,
    userId: profile.uid,
    ueid: profile.ueid,
    acceptedAt: pending.record.acceptedAt,
  };

  const existing = profile.legalConsents ?? [];
  const next = [...existing.filter((c) => c.consentVersion !== record.consentVersion), record];
  const usedStored = envelope != null && pending === envelope.pending;

  return {
    patch: { legalConsents: next },
    generation: usedStored ? envelope.generation : 0,
  };
}

export type PhoneConsentContinuation = {
  profile: UserProfile;
  destination: "email" | "profile" | "dashboard";
};

/**
 * Persist consent after phone verification, then choose email, profile, or
 * dashboard. A failed write keeps the pending copy. Retry calls this again
 * and must not send another SMS (`startOtp` is never invoked).
 */
export async function applyConsentPatchAfterPhoneVerify(input: {
  profile: UserProfile;
  initiatingUid: string;
  readCurrentUid: () => string | null;
  writeProfile: (patch: ProfilePatch) => Promise<UserProfile>;
  startOtp?: () => Promise<unknown>;
}): Promise<PhoneConsentContinuation> {
  assertContinuationUid(input.initiatingUid, input.readCurrentUid());
  const prepared = await consentPatchForProfile(input.profile);
  let profile = input.profile;
  if (prepared) {
    assertContinuationUid(input.initiatingUid, input.readCurrentUid());
    profile = await input.writeProfile(prepared.patch);
    assertContinuationUid(input.initiatingUid, input.readCurrentUid());
    await acknowledgePendingConsentPersisted(prepared.generation);
  }
  assertContinuationUid(input.initiatingUid, input.readCurrentUid());
  return {
    profile,
    destination: resolveSignedInOnboardingContinuation({
      hasVerifiedEmail: hasAuthoritativeVerifiedEmail(profile),
      profileCompletedAt: profile.profileCompletedAt,
      ageEligibility: profile.ageEligibility,
    }),
  };
}
