/**
 * PAN (Permanent Account Number) helpers.
 *
 * Format (10 chars): 5 letters + 4 digits + 1 letter, e.g. ABCDE1234F.
 * The 4th character encodes holder type (P/C/H/F/A/T/B/L/J/G). We validate the
 * structural pattern only — never a government lookup.
 */

export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** Uppercase + strip whitespace; cap to 10 chars. */
export function normalizePan(raw: string): string {
  return raw.replace(/\s/g, "").toUpperCase().slice(0, 10);
}

/** Structural validity (10-char PAN pattern). */
export function isValidPan(raw: string): boolean {
  return PAN_REGEX.test(normalizePan(raw));
}
