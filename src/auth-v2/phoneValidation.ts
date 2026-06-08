import { DEFAULT_COUNTRY_CODE, normalizeIndianMobile } from "@/utils/phone";

/** Local digits only (no country code) — India 10-digit rules. */
export function isValidIndianLocalMobile(local: string): boolean {
  const digits = local.replace(/\D/g, "");
  return /^[6-9]\d{9}$/.test(digits);
}

export function sanitizeLocalMobileInput(text: string): string {
  return text.replace(/\D/g, "").slice(0, 10);
}

export function toE164FromDraft(countryCode: string, local: string): string {
  if (countryCode === DEFAULT_COUNTRY_CODE) {
    return normalizeIndianMobile(local);
  }
  const digits = local.replace(/\D/g, "");
  return `${countryCode}${digits}`;
}
