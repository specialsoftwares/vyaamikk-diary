/**
 * Privacy-safe diagnostic account identifier (Phase B).
 *
 *   diagnosticUid = HMAC-SHA256(BILLING_DIAG_UID_SECRET, uid).slice(0, 16)
 *
 * Truncation: 16 lowercase hex characters = 64 bits. Birthday-bound 50%
 * collision risk is ~2^32 identifiers; Vyaamikk user cardinality is orders of
 * magnitude below that, so 16 hex is enough to correlate logs/audit without
 * storing or logging the raw Firebase uid. Full 64-hex HMAC is never written
 * (minimizes the keyed material sitting in logs).
 *
 * NOT used: uid.slice(...), plain SHA-256(uid), or SHA-256(publicSalt + uid).
 * The secret is never committed; callers inject it (Secret Manager in later
 * deployed functions). Fail-closed on a missing/short secret.
 */

import { createHmac } from "node:crypto";

export const BILLING_DIAG_UID_SECRET_MIN_LENGTH = 32;
/** Documented truncation length (hex chars). */
export const DIAGNOSTIC_UID_HEX_LENGTH = 16;

export function diagnosticUidHmac(billingDiagUidSecret: string, uid: string): string {
  if (
    typeof billingDiagUidSecret !== "string" ||
    billingDiagUidSecret.length < BILLING_DIAG_UID_SECRET_MIN_LENGTH
  ) {
    throw new Error(
      `BILLING_DIAG_UID_SECRET must be at least ${BILLING_DIAG_UID_SECRET_MIN_LENGTH} characters`
    );
  }
  if (typeof uid !== "string" || uid.length === 0) {
    throw new Error("uid must be a non-empty string");
  }
  return createHmac("sha256", billingDiagUidSecret)
    .update(uid, "utf8")
    .digest("hex")
    .slice(0, DIAGNOSTIC_UID_HEX_LENGTH);
}
