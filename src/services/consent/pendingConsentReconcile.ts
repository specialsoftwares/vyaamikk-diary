import type { LegalConsentRecord, PendingLegalConsent } from "@/domain/legalConsent";

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
