/**
 * UEID — Unified Ecosystem ID for SPECIAL SOFTWARES.
 *
 * Format: VYD-YYYY-XXXXXX
 *   - "VYD" is the product prefix.
 *   - YYYY is the year of issue (or derived year in dev — see below).
 *   - XXXXXX is a 6-character alphabet drawn from an unambiguous set
 *     (no 0/O, no 1/I/L) so the ID is easy to read out loud and type.
 *
 * Two generation strategies coexist in this codebase:
 *
 *   1. `generateUEID()` — random allocation. Used by the production
 *      Firebase adapter, which then reserves the chosen UEID in a
 *      Firestore transaction (see services/auth/firebase.ts). Two calls
 *      may return different values; the server is the authority.
 *
 *   2. `deriveUEIDFromPhone()` — deterministic derivation from the
 *      normalized phone number. Used by the development mock backend so
 *      the *same phone produces the same UEID on every device, every
 *      install, every time*, with no shared backend required.
 *
 * The deterministic strategy is intentionally NOT used in production
 * because it would let anyone reverse a UEID back to a phone number using
 * the same hash. Production must keep the random-allocation + server
 * mapping scheme.
 */

const UEID_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // 31 chars
export const UEID_PREFIX = "VYD";

/**
 * 32-bit FNV-1a hash. Pure JS, no crypto/dep — and crucially the same
 * bit-for-bit on every JS engine (Hermes/JSC/V8) because it only uses
 * Math.imul which is required to wrap at 32 bits across engines.
 */
export function fnv1a(input: string, seed = 0x811c9dc5): number {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Random UEID — used in production where Firestore enforces uniqueness. */
export function generateUEID(year = new Date().getFullYear()): string {
  let suffix = "";
  for (let i = 0; i < 6; i += 1) {
    const idx = Math.floor(Math.random() * UEID_ALPHABET.length);
    suffix += UEID_ALPHABET[idx];
  }
  return `${UEID_PREFIX}-${year}-${suffix}`;
}

/**
 * Deterministic UEID derivation for the dev mock backend.
 *
 * Both year and 6-char suffix are derived from a hash of the normalized
 * phone number. The year is constrained to 2024..2029 so it still looks
 * like a plausible "year of issue" while remaining stable for any given
 * phone forever.
 *
 * Guarantees:
 *   - Same phone (in E.164) → exactly the same UEID, every time.
 *   - Identical output on iOS, Android, web, and Node (Math.imul + BigInt
 *     are spec-defined on every JS engine).
 *   - No device storage involved — the UEID *is* the hash, not a lookup.
 */
export function deriveUEIDFromPhone(phoneE164: string): string {
  const h1 = fnv1a(phoneE164, 0x811c9dc5);
  const h2 = fnv1a(phoneE164, 0xdeadbeef);
  const year = 2024 + (h1 % 6); // stable 2024..2029
  let acc = (BigInt(h1) << 32n) | BigInt(h2);
  const base = BigInt(UEID_ALPHABET.length);
  let suffix = "";
  for (let i = 0; i < 6; i += 1) {
    suffix += UEID_ALPHABET[Number(acc % base)];
    acc /= base;
  }
  return `${UEID_PREFIX}-${year}-${suffix}`;
}

/**
 * Deterministic mock auth uid derived from the phone number.
 *
 * In production this would be the Firebase Auth uid; in dev we synthesise
 * one that is stable across devices so per-user storage keys (diary
 * entries, etc.) line up properly.
 */
export function deriveMockUidFromPhone(phoneE164: string): string {
  const h1 = fnv1a(phoneE164, 0x12345678).toString(16).padStart(8, "0");
  const h2 = fnv1a(phoneE164, 0x9abcdef0).toString(16).padStart(8, "0");
  return `mock_${h1}${h2}`;
}

const UEID_RE = /^VYD-\d{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;
export function isValidUEID(value: string): boolean {
  return UEID_RE.test(value);
}

export function formatUEIDForShare(ueid: string): string {
  return ueid;
}
