import { fnv1a } from "@/utils/ueid";

/** Normalize E.164 for canonical mobile index keys (India + generic). */
export function normalizePhoneE164(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return trimmed;
}

/** Stable hash for mobile index / audit (not reversible to phone without brute force). */
export function hashMobileE164(phoneE164: string): string {
  const normalized = normalizePhoneE164(phoneE164);
  return fnv1a(normalized).toString(16).padStart(8, "0");
}
