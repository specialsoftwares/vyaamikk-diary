import { hasAuthoritativeVerifiedEmail } from "@/auth/identityRouteState";
import { legal } from "@/config/legal";
import { AppError } from "@/domain/errors";
import type { LegalConsentRecord, PendingLegalConsent } from "@/domain/legalConsent";
import { resolveSignedInOnboardingContinuation } from "@/domain/ageEligibility";
import type { PhoneE164, UEID, UserProfile } from "@/domain/types";
import type { ProfilePatch } from "@/services/auth/types";
import { readNativeSecureRandom } from "@/services/accountDeletion/nativeSecureRandom";
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
  operationId: string | null;
  pending: PendingLegalConsent;
};

/** A receipt is bound to the exact choice and its owner, not a reusable counter. */
export type PendingConsentAcknowledgement = Readonly<{
  operationId: string;
  phoneE164: string;
  choice: string;
}>;

let consentKv: ConsentKv | null = null;
let pendingSaveQueue: Promise<void> = Promise.resolve();

function serializePendingOperation<T>(work: () => Promise<T>): Promise<T> {
  const run = pendingSaveQueue.then(work);
  pendingSaveQueue = run.then(() => undefined, () => undefined);
  return run;
}

function newOperationId(): string {
  const bytes = readNativeSecureRandom(16);
  if (!bytes) throw new AppError("save_failed", "Consent choice could not be stored.");
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function acknowledgementFor(envelope: PendingConsentEnvelope): PendingConsentAcknowledgement {
  if (!envelope.operationId) throw new Error("consent_operation_missing");
  return Object.freeze({
    operationId: envelope.operationId,
    phoneE164: envelope.pending.phoneE164,
    choice: JSON.stringify(envelope.pending),
  });
}

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
      return {
        generation: parsed.generation,
        operationId: typeof parsed.operationId === "string" && /^[a-f0-9]{32}$/.test(parsed.operationId)
          ? parsed.operationId : null,
        pending: parsed.pending,
      };
    }
    if (parsed && typeof parsed.phoneE164 === "string" && parsed.record) {
      return {
        generation: 1,
        operationId: null,
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
 * Write the next pending choice and return its unique acknowledgement token.
 * The numeric generation remains readable for older envelopes, but is never
 * sufficient authority to clear a choice after an acknowledgement or reset.
 */
export function serializePendingConsentSave(
  phoneE164: PhoneE164,
  sourceScreen: string
): Promise<PendingConsentAcknowledgement> {
  return serializePendingOperation(async () => {
    const current = await readEnvelope();
    const generation = (current?.generation ?? 0) + 1;
    const pending: PendingLegalConsent = {
      phoneE164,
      record: buildConsentRecord({ sourceScreen, phoneE164 }),
    };
    const envelope: PendingConsentEnvelope = { generation, operationId: newOperationId(), pending };
    await activeConsentKv().setItem(PENDING_KEY, JSON.stringify(envelope));
    return acknowledgementFor(envelope);
  });
}

export async function loadPendingConsent(): Promise<PendingLegalConsent | null> {
  const envelope = await readEnvelope();
  return envelope?.pending ?? null;
}

export async function loadPendingConsentGeneration(): Promise<number | null> {
  const envelope = await readEnvelope();
  return envelope?.generation ?? null;
}

/** Explicit local wipe shares the same queue as saves and acknowledgements. */
export async function clearPendingConsent(): Promise<void> {
  await serializePendingOperation(() => activeConsentKv().removeItem(PENDING_KEY));
}

/**
 * Drop only the exact owner/choice acknowledged by the successful profile write.
 * A copied/stale numeric generation or an older receipt can never clear a choice.
 */
export function acknowledgePendingConsentPersisted(
  acknowledgement: PendingConsentAcknowledgement | null,
  isCurrent: () => boolean = () => true
): Promise<boolean> {
  if (!acknowledgement) return Promise.resolve(false);
  return serializePendingOperation(async () => {
    if (!isCurrent()) return false;
    const current = await readEnvelope();
    if (!current || current.operationId !== acknowledgement.operationId ||
        current.pending.phoneE164 !== acknowledgement.phoneE164 ||
        JSON.stringify(current.pending) !== acknowledgement.choice) return false;
    if (!isCurrent()) return false;
    await activeConsentKv().removeItem(PENDING_KEY);
    return true;
  });
}

export type ConsentProfilePatch = {
  patch: ProfilePatch;
  acknowledgement: PendingConsentAcknowledgement | null;
};

/** Merge pending consent into a profile patch. Does not clear the retry copy. */
export async function consentPatchForProfile(
  profile: UserProfile
): Promise<ConsentProfilePatch | null> {
  const envelope = await serializePendingOperation(async () => {
    const stored = await readEnvelope();
    // Give legacy persisted choices an identity before returning a receipt.
    // This runs in the mutation queue so two readers cannot mint different IDs.
    if (stored && !stored.operationId) {
      stored.operationId = newOperationId();
      await activeConsentKv().setItem(PENDING_KEY, JSON.stringify(stored));
    }
    return stored;
  });
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
    acknowledgement: usedStored ? acknowledgementFor(envelope) : null,
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
  isCurrent?: () => boolean;
  writeProfile: (patch: ProfilePatch) => Promise<UserProfile>;
  startOtp?: () => Promise<unknown>;
}): Promise<PhoneConsentContinuation> {
  const assertCurrent = () => {
    assertContinuationUid(input.initiatingUid, input.readCurrentUid());
    if (input.profile.uid !== input.initiatingUid || input.isCurrent?.() === false) {
      throw new AppError("permission_denied", "session_changed");
    }
  };
  assertCurrent();
  const prepared = await consentPatchForProfile(input.profile);
  assertCurrent();
  let profile = input.profile;
  if (prepared) {
    assertCurrent();
    profile = await input.writeProfile(prepared.patch);
    assertCurrent();
    assertContinuationUid(input.initiatingUid, profile.uid);
    await acknowledgePendingConsentPersisted(prepared.acknowledgement, () => {
      try { assertCurrent(); return true; } catch { return false; }
    });
    assertCurrent();
  }
  assertCurrent();
  return {
    profile,
    destination: resolveSignedInOnboardingContinuation({
      hasVerifiedEmail: hasAuthoritativeVerifiedEmail(profile),
      profileCompletedAt: profile.profileCompletedAt,
      ageEligibility: profile.ageEligibility,
    }),
  };
}
