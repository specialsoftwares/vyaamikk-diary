/** Indian PIN: six digits, first digit 1–9 (no leading zero). */
export const INDIAN_PIN_REGEX = /^[1-9]\d{5}$/;

/** Trim spaces; keep digits only for validation. */
export function normalizeIndianPinInput(raw: string): string {
  return raw.replace(/\s/g, "").replace(/\D/g, "").slice(0, 6);
}

/** Format check after normalizing — does not prove the PIN exists. */
export function isValidIndianPincode(pinCode: string): boolean {
  const pin = normalizeIndianPinInput(pinCode);
  return INDIAN_PIN_REGEX.test(pin);
}
