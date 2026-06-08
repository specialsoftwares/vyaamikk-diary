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
}

export interface PendingLegalConsent {
  record: LegalConsentRecord;
  phoneE164: string;
}
