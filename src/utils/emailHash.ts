import { fnv1a } from "@/utils/ueid";

/** Canonical email form for storage and uniqueness checks. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Stable hash for email index keys — store hash, not plain email, in shared indexes. */
export function hashEmail(normalizedEmail: string): string {
  return fnv1a(normalizedEmail).toString(16).padStart(8, "0");
}

/** Mask email for UI display (settings summaries, support-facing hints). */
export function maskEmail(email: string): string {
  const v = email.trim();
  const at = v.indexOf("@");
  if (at <= 0) return "***";
  const local = v.slice(0, at);
  const domain = v.slice(at + 1);
  const maskedLocal = local.length <= 2 ? `${local[0] ?? "*"}***` : `${local.slice(0, 2)}***`;
  const dot = domain.indexOf(".");
  const maskedDomain =
    dot > 0 ? `${domain.slice(0, 1)}***${domain.slice(dot)}` : `${domain.slice(0, 2)}***`;
  return `${maskedLocal}@${maskedDomain}`;
}
