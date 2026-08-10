/**
 * Authoritative India-first mobile field rules for Auth v2.
 * Manual typing, paste, Gboard suggestion, and Android Autofill share this path.
 */

import { DEFAULT_COUNTRY_CODE, normalizeIndianMobile } from "@/utils/phone";
import { AppError } from "@/domain/errors";

/** True when the string is exactly 10 ASCII digits starting with 6–9. */
export function isValidIndianLocalMobile(local: string): boolean {
  return /^[6-9]\d{9}$/.test(local);
}

/** CTA enables immediately on a valid number — consent is a separate send gate. */
export function isPhoneContinueEnabled(input: {
  valid: boolean;
  online: boolean;
  loading: boolean;
}): boolean {
  return input.valid && input.online && !input.loading;
}

/** Hindi / fullwidth numerals etc. — always invalid for this product. */
export function containsNonAsciiDigits(text: string): boolean {
  return /[^\u0000-\u007f]/.test(text) || /[०-९]/.test(text);
}

export type IndianMobileIngestResult =
  | { status: "empty"; localDigits: "" }
  | { status: "partial"; localDigits: string }
  | { status: "complete"; localDigits: string; e164: string }
  | { status: "rejected"; reason: string };

/**
 * Extract a national 10-digit candidate (possibly partial) from digit-only input.
 * Returns null only when the digit string cannot represent an India mobile draft.
 */
export function extractIndianLocalDigits(digits: string): string | null {
  if (!digits) return "";
  // Full international: 91XXXXXXXXXX
  if (digits.length >= 12 && digits.startsWith("91")) {
    return digits.slice(2, 12);
  }
  // 091XXXXXXXXXX
  if (digits.length >= 13 && digits.startsWith("091")) {
    return digits.slice(3, 13);
  }
  // Trunk 0 + 10 digits
  if (digits.length === 11 && digits.startsWith("0")) {
    return digits.slice(1);
  }
  // Partial while autofill streams country code first
  if (digits.startsWith("91") && digits.length < 12) {
    return digits.slice(2);
  }
  if (digits.startsWith("091") && digits.length < 13) {
    return digits.slice(3);
  }
  if (digits.length <= 10) {
    return digits;
  }
  const trailing = digits.match(/[6-9]\d{9}$/);
  if (trailing) return trailing[0];
  return null;
}

/**
 * Ingest raw TextInput / autofill text into 0–10 local digits for the +91 UI.
 * Never silently ignore a valid Indian mobile because Android formatted it.
 */
export function ingestIndianMobileFieldInput(raw: string): IndianMobileIngestResult {
  if (raw == null || String(raw).length === 0) {
    return { status: "empty", localDigits: "" };
  }
  const text = String(raw);
  if (containsNonAsciiDigits(text)) {
    return {
      status: "rejected",
      reason: "Use English digits (0–9). Other numeral scripts are not accepted.",
    };
  }
  // Allow phone punctuation Android commonly inserts; reject letters/other symbols.
  if (/[^\d\s+\-().]/.test(text)) {
    return {
      status: "rejected",
      reason: "Enter a valid Indian mobile number.",
    };
  }

  const digits = text.replace(/\D/g, "");
  if (digits.length === 0) {
    return { status: "empty", localDigits: "" };
  }

  const extracted = extractIndianLocalDigits(digits);
  if (extracted == null) {
    return {
      status: "rejected",
      reason: "Enter a valid 10-digit Indian mobile number.",
    };
  }
  const local = extracted.slice(0, 10);

  if (isValidIndianLocalMobile(local)) {
    return {
      status: "complete",
      localDigits: local,
      e164: `${DEFAULT_COUNTRY_CODE}${local}`,
    };
  }
  return { status: "partial", localDigits: local };
}

/**
 * Controlled TextInput accept path.
 * Returns local digits (0–10), "" to clear, or null when the update must be rejected
 * (caller keeps previous value and may show reason via ingest).
 */
export function acceptLocalMobileInput(text: string): string | null {
  const ingested = ingestIndianMobileFieldInput(text);
  if (ingested.status === "rejected") return null;
  if (ingested.status === "empty") return "";
  return ingested.localDigits;
}

/** @deprecated Prefer acceptLocalMobileInput / ingestIndianMobileFieldInput. */
export function sanitizeLocalMobileInput(text: string): string {
  const accepted = acceptLocalMobileInput(text);
  if (accepted != null) return accepted;
  return text.replace(/\D/g, "").slice(0, 10);
}

export function toE164FromDraft(countryCode: string, local: string): string {
  if (!isValidIndianLocalMobile(local)) {
    throw new AppError("invalid_phone", "Please enter a valid 10-digit mobile number.");
  }
  if (countryCode === DEFAULT_COUNTRY_CODE || countryCode === "91" || countryCode === "+91") {
    return normalizeIndianMobile(local);
  }
  return `${countryCode}${local}`;
}
