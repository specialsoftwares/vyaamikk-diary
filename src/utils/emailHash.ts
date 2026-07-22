import { fnv1a } from "@/utils/ueid";
import { sha256Hex } from "@/utils/sha256Hex";

const EMAIL_MAX_LEN = 254;
const EMAIL_LOCAL_MAX = 64;

/**
 * Normalize for uniqueness: lowercase ASCII (entire address).
 * Does NOT strip Gmail dots or plus aliases.
 * Leading/trailing spaces are NOT auto-trimmed here for input validation —
 * use `emailHasIllegalWhitespace` / require the user to correct spaces first.
 * Server uniqueness still lowercases after the user provides a clean address.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Reject leading/trailing/embedded illegal whitespace without auto-fixing. */
export function emailHasIllegalWhitespace(raw: string): boolean {
  if (raw !== raw.trim()) return true;
  if (/\s/.test(raw)) return true;
  return false;
}

/** Syntax + length gate used before OTP send. */
export function isValidEmailSyntax(raw: string): boolean {
  if (emailHasIllegalWhitespace(raw)) return false;
  const normalized = raw.toLowerCase();
  if (!normalized || normalized.length > EMAIL_MAX_LEN) return false;
  const at = normalized.indexOf("@");
  if (at <= 0 || at !== normalized.lastIndexOf("@")) return false;
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (!local || local.length > EMAIL_LOCAL_MAX) return false;
  if (!domain || !domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) {
    return false;
  }
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(
    normalized
  );
}

/** Authoritative binding key — SHA-256 of normalized email. */
export function hashEmail(normalizedEmail: string): string {
  return sha256Hex(normalizeEmail(normalizedEmail));
}

/** Legacy FNV-1a key (pre-SHA-256 indexes) — read-only remediation lookups. */
export function legacyHashEmailFnv(normalizedEmail: string): string {
  return fnv1a(normalizeEmail(normalizedEmail)).toString(16).padStart(8, "0");
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
