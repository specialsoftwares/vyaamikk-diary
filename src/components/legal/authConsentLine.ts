/** Compact auth consent: one logical sentence, two independent legal links. */
export const AUTH_CONSENT_JOINER = " & ";

export function authConsentShouldStaySingleLine(fontScale: number): boolean {
  return fontScale <= 1.2;
}

export function isAuthLegalConsentReady(
  termsAccepted: boolean,
  privacyAccepted: boolean
): boolean {
  return termsAccepted && privacyAccepted;
}

export function authConsentSentencePreview(input: {
  prefix: string;
  termsLabel: string;
  privacyLabel: string;
}): string {
  return `${input.prefix} ${input.termsLabel}${AUTH_CONSENT_JOINER}${input.privacyLabel}`;
}
