/**
 * Server-side billing rate-limit buckets.
 *
 * purchase validation: 5 / diagnosticUid / minute
 * subscription refresh: 10 / diagnosticUid / hour
 *
 * Bucket id is bounded (op + diagnosticUid + windowKey) — no per-request docs.
 * Clock is the caller-supplied server nowMs. expireAt is set for a future TTL
 * policy; Phase B does not deploy TTL.
 */

import { BillingError } from "./errors";
import { rateLimitBucketPath } from "./paths";
import type { BillingStore } from "./store";

export const PURCHASE_VALIDATION_LIMIT = 5;
export const PURCHASE_VALIDATION_WINDOW_MS = 60_000;
export const SUBSCRIPTION_REFRESH_LIMIT = 10;
export const SUBSCRIPTION_REFRESH_WINDOW_MS = 3_600_000;

export type BillingRateLimitOp = "purchaseValidation" | "subscriptionRefresh";

export function rateLimitBucketId(
  op: BillingRateLimitOp,
  diagnosticUid: string,
  nowMs: number,
  windowMs: number
): string {
  const windowKey = Math.floor(nowMs / windowMs);
  return `${op}_${diagnosticUid}_${windowKey}`;
}

export async function consumeBillingRateLimit(
  store: BillingStore,
  opts: {
    op: BillingRateLimitOp;
    diagnosticUid: string;
    nowMs: number;
  }
): Promise<{ count: number; limit: number }> {
  const limit =
    opts.op === "purchaseValidation" ? PURCHASE_VALIDATION_LIMIT : SUBSCRIPTION_REFRESH_LIMIT;
  const windowMs =
    opts.op === "purchaseValidation"
      ? PURCHASE_VALIDATION_WINDOW_MS
      : SUBSCRIPTION_REFRESH_WINDOW_MS;
  const bucketId = rateLimitBucketId(opts.op, opts.diagnosticUid, opts.nowMs, windowMs);
  const path = rateLimitBucketPath(bucketId);
  const windowStart = Math.floor(opts.nowMs / windowMs) * windowMs;
  const expireAt = windowStart + 2 * windowMs;

  return store.runTransaction(async (tx) => {
    const snap = await tx.get(path);
    const count = snap.exists ? Number(snap.data()?.count ?? 0) : 0;
    if (count >= limit) {
      throw new BillingError({
        clientCode: "rate_limited",
        causeCode: `${opts.op}_rate_limited`,
        retryable: true,
      });
    }
    tx.set(path, {
      count: count + 1,
      updatedAt: opts.nowMs,
      expireAt,
    });
    return { count: count + 1, limit };
  });
}
