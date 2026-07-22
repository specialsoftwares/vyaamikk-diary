/**
 * Strict Indian local-mobile input rules for Auth v2.
 * Formatted pastes are rejected (not auto-cleaned).
 */

import { DEFAULT_COUNTRY_CODE, normalizeIndianMobile } from "@/utils/phone";
import { AppError } from "@/domain/errors";

/** True when the string is exactly 10 ASCII digits starting with 6–9. */
export function isValidIndianLocalMobile(local: string): boolean {
  return /^[6-9]\d{9}$/.test(local);
}

/**
 * Accept only pure digit keystrokes/autofill values that are already digit-only.
 * Reject (return null) any formatted paste: spaces, hyphens, +91, leading 0, Hindi digits, etc.
 */
export function acceptLocalMobileInput(text: string): string | null {
  if (text.length === 0) return "";
  // Reject anything that is not ASCII digits 0–9 (no auto-strip).
  if (!/^[0-9]*$/.test(text)) return null;
  if (text.length > 10) return null;
  return text;
}

/** @deprecated Prefer acceptLocalMobileInput — kept for callers that already digit-strip. */
export function sanitizeLocalMobileInput(text: string): string {
  const accepted = acceptLocalMobileInput(text);
  if (accepted != null) return accepted;
  // Legacy path: strip non-digits only when used by non-UI helpers.
  return text.replace(/\D/g, "").slice(0, 10);
}

export function toE164FromDraft(countryCode: string, local: string): string {
  if (!isValidIndianLocalMobile(local)) {
    throw new AppError("invalid_phone", "Please enter a valid 10-digit mobile number.");
  }
  if (countryCode === DEFAULT_COUNTRY_CODE) {
    return normalizeIndianMobile(local);
  }
  return `${countryCode}${local}`;
}

/** Hindi / fullwidth numerals etc. — always invalid for this product. */
export function containsNonAsciiDigits(text: string): boolean {
  return /[^\u0000-\u007f]/.test(text) || /[०-९]/.test(text);
}
