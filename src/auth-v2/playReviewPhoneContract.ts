/**
 * Play-review phone contract for Vyaamikk Diary.
 *
 * The shipped Auth UI accepts India (+91) numbers only (10 digits, start 6–9).
 * Firebase Console fictional test numbers used for Google Play must therefore be
 * valid Indian E.164 values — not US-style sample numbers from Firebase docs.
 *
 * Never hardcode a real review number or OTP here.
 */

import { normalizeIndianMobile } from "@/utils/phone";
import { normalizePhoneE164 } from "@/utils/mobileHash";
import {
  isValidIndianLocalMobile,
  toE164FromDraft,
} from "@/auth-v2/phoneValidation";
import { DEFAULT_AUTH_V2_COUNTRY_CODE } from "@/auth-v2/types";

/** True when a candidate review phone can be entered and sent through Auth v2 UI. */
export function isPlayReviewCompatiblePhoneE164(phone: string): boolean {
  try {
    const compact = phone.trim().replace(/[\s-]/g, "");
    const normalized = normalizePhoneE164(compact);
    if (!/^\+91[6-9]\d{9}$/.test(normalized)) return false;
    const local = normalized.slice(3);
    return isValidIndianLocalMobile(local);
  } catch {
    return false;
  }
}

/** Canonical form used by Auth UI + server phoneIndex after UI entry. */
export function canonicalReviewPhoneFromLocalDigits(local10: string): string {
  return toE164FromDraft(DEFAULT_AUTH_V2_COUNTRY_CODE, local10);
}

export function assertSameCanonicalAsNormalizeIndian(local10: string): string {
  const fromDraft = canonicalReviewPhoneFromLocalDigits(local10);
  const fromStrict = normalizeIndianMobile(local10);
  if (fromDraft !== fromStrict) {
    throw new Error("phone_normalization_mismatch");
  }
  return fromDraft;
}
