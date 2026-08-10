/** Pure OTP cell model — one logical string, N visual cells. */

export function normalizeOtpDigits(raw: string, length: number): string {
  return String(raw ?? "")
    .replace(/\D/g, "")
    .slice(0, length);
}

export function otpCellsFromValue(value: string, length: number): string[] {
  const digits = normalizeOtpDigits(value, length);
  return Array.from({ length }, (_, i) => digits[i] ?? "");
}

export function isOtpComplete(value: string, length: number): boolean {
  return normalizeOtpDigits(value, length).length === length;
}

export function shouldAutoVerifyOtp(input: {
  digits: string;
  length: number;
  lastSubmitted: string | null;
  inFlight: boolean;
  disabled: boolean;
}): boolean {
  if (input.disabled || input.inFlight) return false;
  if (!isOtpComplete(input.digits, input.length)) return false;
  if (input.lastSubmitted === input.digits) return false;
  return true;
}
