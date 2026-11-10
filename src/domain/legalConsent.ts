/** Logged when user affirmatively accepts Terms and Privacy at registration. */
export interface LegalConsentRecord {
  consentVersion: string;
  termsVersion: string;
  privacyVersion: string;
  effectiveDate: string;
  acceptedAt: number;
  userId?: string;
  ueid?: string;
  phoneE164?: string;
  appVersion: string;
  platform: string;
  sourceScreen: string;
  /** Optional purpose receipt. Required service processing is not a checkbox. */
  purposeId?: "service_operation" | "crash_diagnostics";
  required?: boolean;
}

export interface PendingLegalConsent {
  /** Device-only identity of this particular affirmative choice; never a server grant. */
  choiceRevision?: string;
  record: LegalConsentRecord;
  phoneE164: string;
}
