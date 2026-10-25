import type { LegalConsentRecord, PendingLegalConsent } from "@/domain/legalConsent";
import type { ProfilePatch } from "@/services/auth/types";

/** Keep the newer grant for each version. An older pending grant does not replace it. */
export function mergeLegalConsentGrants(
  existing: readonly LegalConsentRecord[] | undefined,
  incoming: readonly LegalConsentRecord[]
): LegalConsentRecord[] {
  const byVersion = new Map<string, LegalConsentRecord>();
  for (const record of existing ?? []) byVersion.set(record.consentVersion, record);
  for (const record of incoming) {
    const current = byVersion.get(record.consentVersion);
    if (!current || record.acceptedAt >= current.acceptedAt) {
      byVersion.set(record.consentVersion, record);
    }
  }
  return [...byVersion.values()];
}

/** Build the consent patch. Does not read or delete stored consent. */
export function consentPatchFromPending(
  profile: {
    uid: string;
    ueid?: LegalConsentRecord["ueid"];
    phoneE164: string;
    legalConsents?: LegalConsentRecord[];
  },
  stored: PendingLegalConsent | null,
  currentConsentVersion: string,
  rebuildRecord: LegalConsentRecord
): ProfilePatch | null {
  const hasCurrentConsentVersion = (profile.legalConsents ?? []).some(
    (consent) => consent.consentVersion === currentConsentVersion
  );
  const pending = resolvePendingConsentForVerifiedProfile({
    pending: stored,
    verifiedPhoneE164: profile.phoneE164,
    hasCurrentConsentVersion,
    rebuildRecord,
  });
  if (!pending) return null;
  if (pending.record.userId && pending.record.userId !== profile.uid) return null;

  const record: LegalConsentRecord = {
    ...pending.record,
    userId: profile.uid,
    ueid: profile.ueid,
    acceptedAt: pending.record.acceptedAt,
  };
  const existing = profile.legalConsents ?? [];
  const current = existing.find((consent) => consent.consentVersion === record.consentVersion);
  if (current && current.acceptedAt > record.acceptedAt) return null;
  const next = [...existing.filter((consent) => consent.consentVersion !== record.consentVersion), record];
  return { legalConsents: next };
}

export function pendingConsentChoicesEqual(
  left: PendingLegalConsent | null,
  right: PendingLegalConsent | null
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.phoneE164 === right.phoneE164 &&
    left.record.consentVersion === right.record.consentVersion &&
    left.record.termsVersion === right.record.termsVersion &&
    left.record.privacyVersion === right.record.privacyVersion &&
    left.record.acceptedAt === right.record.acceptedAt &&
    left.record.sourceScreen === right.record.sourceScreen &&
    (left.record.userId ?? "") === (right.record.userId ?? "")
  );
}

export const CONSENT_RECONCILE_SOURCE = "auth_v2_phone_confirm_reconcile";

/**
 * Off-critical-path `savePendingConsent` may miss disk. After Firebase identity
 * exists, rebuild from the verified phone so the required consent record is not
 * permanently lost. Existing current-version consents are left unchanged.
 */
export function resolvePendingConsentForVerifiedProfile(input: {
  pending: PendingLegalConsent | null;
  verifiedPhoneE164: string;
  hasCurrentConsentVersion: boolean;
  rebuildRecord: LegalConsentRecord;
}): PendingLegalConsent | null {
  if (input.pending && input.pending.phoneE164 === input.verifiedPhoneE164) {
    return input.pending;
  }
  if (input.hasCurrentConsentVersion) return null;
  return {
    phoneE164: input.verifiedPhoneE164,
    record: input.rebuildRecord,
  };
}
