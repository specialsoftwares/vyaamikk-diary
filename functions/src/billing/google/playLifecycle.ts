/**
 * Google SubscriptionPurchaseV2 lifecycle snapshot identity (VYD-32).
 *
 * `etag` is Google's current-state entity tag (always present for
 * auto-renewing subscriptions). Combined with the credential fingerprint it
 * distinguishes two genuine occurrences of the same lifecycle state on the
 * same token / period (cancel → restart → cancel) without putting the raw
 * purchase token in an idempotency key.
 */

import { createHash } from "node:crypto";

export const PLAY_LIFECYCLE_SNAPSHOT_PREFIX = "vyd-play-life-v1:";

export function playLifecycleSnapshotHash(
  credentialFp: string,
  etag: string
): string {
  return createHash("sha256")
    .update(`${PLAY_LIFECYCLE_SNAPSHOT_PREFIX}${credentialFp}:${etag}`, "utf8")
    .digest("hex");
}

export function playLifecycleIdempotencyKey(state: string, snapshotHash: string): string {
  return `android:life:${state}:${snapshotHash}`;
}
