/**
 * Client mirror of server mobile quarantine contract (no secrets).
 *
 * Server source of truth: functions/src/identity/mobileQuarantine.ts
 * Client messaging helper: src/auth/mobileQuarantinePolicy.ts
 *
 * Enforcement is server-side only. Local-mock / client write paths must not
 * be treated as authoritative for quarantine.
 */

/** Firestore collections — doc IDs are mobileHash (SHA-256 hex), never raw E.164. */
export const MOBILE_QUARANTINE_COLLECTIONS = {
  bindings: "mobileBindings",
  quarantines: "mobileQuarantines",
  securityEvents: "mobileSecurityEvents",
} as const;

/**
 * Hash requirement: SHA-256 hex of normalizePhoneE164(phone).
 * Never use the raw mobile string as a document ID for these collections.
 */
export const MOBILE_QUARANTINE_HASH_ALGORITHM = "sha256-hex-normalized-e164" as const;

/** Duplicate of server/client policy message — keep strings in sync manually. */
export const MOBILE_QUARANTINE_SERVER_USER_MESSAGE =
  "This mobile number is temporarily unavailable. Please try again later.";

export const MOBILE_QUARANTINE_DURATION_DAYS = 21;

export const MOBILE_QUARANTINE_CALLABLES = {
  check: "checkMobileQuarantine",
  rebind: "rebindQuarantinedMobileCallable",
} as const;
