import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";

import { legal } from "@/config/legal";
import type { LegalConsentRecord, PendingLegalConsent } from "@/domain/legalConsent";
import type { PhoneE164, UEID, UserProfile } from "@/domain/types";
import type { ProfilePatch } from "@/services/auth/types";
import {
  CONSENT_RECONCILE_SOURCE,
  resolvePendingConsentForVerifiedProfile,
} from "@/services/consent/pendingConsentReconcile";

const PENDING_KEY = "vyd_pending_legal_consent_v1";

function appVersion(): string {
  return Constants.expoConfig?.version ?? "1.0.0";
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
    platform: Platform.OS,
    sourceScreen: input.sourceScreen,
  };
}

/** Store consent locally until UEID/profile exists (pre-auth OTP send). */
export async function savePendingConsent(phoneE164: PhoneE164, sourceScreen: string): Promise<void> {
  const pending: PendingLegalConsent = {
    phoneE164,
    record: buildConsentRecord({ sourceScreen, phoneE164 }),
  };
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(pending));
}

export async function loadPendingConsent(): Promise<PendingLegalConsent | null> {
  const raw = await AsyncStorage.getItem(PENDING_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingLegalConsent;
  } catch {
    return null;
  }
}

export async function clearPendingConsent(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_KEY);
}

/** Merge pending consent into profile patch after successful OTP / identity creation. */
export async function consentPatchForProfile(
  profile: UserProfile
): Promise<ProfilePatch | null> {
  const stored = await loadPendingConsent();
  const hasCurrentConsentVersion = (profile.legalConsents ?? []).some(
    (c) => c.consentVersion === legal.consentVersion
  );
  const pending = resolvePendingConsentForVerifiedProfile({
    pending: stored,
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

  await clearPendingConsent();
  return { legalConsents: next };
}
