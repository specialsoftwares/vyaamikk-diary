import { AppError } from "@/domain/errors";

/**
 * V1 supports India numbers only. The form constrains to 10 digits and
 * country code +91 is fixed. This normalizer is intentionally strict.
 */

export const DEFAULT_COUNTRY_CODE = "+91";

export function normalizeIndianMobile(input: string): string {
  const digits = input.replace(/\D/g, "");
  // Accept "9876543210", "919876543210", "+919876543210" forms.
  let local: string;
  if (digits.length === 10) {
    local = digits;
  } else if (digits.length === 12 && digits.startsWith("91")) {
    local = digits.slice(2);
  } else if (digits.length === 13 && digits.startsWith("091")) {
    local = digits.slice(3);
  } else {
    throw new AppError("invalid_phone", "Invalid Indian mobile number.");
  }
  if (!/^[6-9]\d{9}$/.test(local)) {
    throw new AppError(
      "invalid_phone",
      "Indian mobile numbers must start with 6, 7, 8, or 9."
    );
  }
  return `${DEFAULT_COUNTRY_CODE}${local}`;
}

export function maskMobile(e164: string): string {
  // +919876543210 -> +91 98••••3210
  const m = e164.match(/^\+(\d{1,3})(\d{2})(\d+)(\d{4})$/);
  if (!m) return e164;
  const [, cc, head, mid, tail] = m;
  return `+${cc} ${head}${"•".repeat(Math.max(4, mid.length))}${tail}`;
}

/** Human-readable mobile for cards and share text (+91 98765 43210). */
export function formatDisplayPhone(e164: string): string {
  const trimmed = e164.trim();
  const india = trimmed.match(/^\+91(\d{10})$/);
  if (india) {
    const local = india[1];
    return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
  }
  return trimmed;
}
