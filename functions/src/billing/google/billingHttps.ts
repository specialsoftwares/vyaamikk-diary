/**
 * Map BillingError → HttpsError without echoing tokens or cause codes.
 */

import { HttpsError } from "firebase-functions/v2/https";

import { BILLING_CLIENT_MESSAGES, BillingError } from "../errors";

export function throwHttpsFromBilling(err: unknown): never {
  if (err instanceof HttpsError) throw err;
  if (err instanceof BillingError) {
    const status =
      err.clientCode === "rate_limited"
        ? "resource-exhausted"
        : err.clientCode === "temporary_unavailable"
          ? "unavailable"
          : err.clientCode === "not_entitled"
            ? "permission-denied"
            : err.clientCode === "invalid_purchase" || err.clientCode === "verification_failed"
              ? "failed-precondition"
              : err.clientCode === "already_processed"
                ? "already-exists"
                : "internal";
    throw new HttpsError(status, BILLING_CLIENT_MESSAGES[err.clientCode]);
  }
  throw new HttpsError("internal", BILLING_CLIENT_MESSAGES.internal_error);
}

export function rtdnHttpStatusForError(err: unknown): number {
  if (err instanceof BillingError) {
    if (err.causeCode === "rtdn_unauthenticated" || err.causeCode === "rtdn_oidc_invalid") {
      return 401;
    }
    if (
      err.causeCode === "rtdn_malformed" ||
      err.causeCode === "rtdn_invalid_base64" ||
      err.causeCode === "rtdn_wrong_package" ||
      err.causeCode === "missing_rtdn_event_time" ||
      err.causeCode === "invalid_event_time_millis"
    ) {
      return 400;
    }
    if (err.retryable) return 503;
    return 200;
  }
  return 503;
}

/**
 * Apple retries ASSN until HTTP 200. Retryable Apple API/network failures
 * return 503 so Apple redelivers. Verification/poison payloads return 200
 * after no mutation so they do not retry forever.
 */
export function assnHttpStatusForError(err: unknown): number {
  if (err instanceof BillingError) {
    if (err.retryable) return 503;
    return 200;
  }
  return 503;
}
