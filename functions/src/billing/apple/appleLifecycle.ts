/**
 * Canonical Apple subscription-state snapshot identity (VYD-33).
 *
 * Hash of verified server fields — never raw JWS. `renewalSignedDate` is the
 * state-version signal so cancel → restart → cancel is representable, while
 * `lifecycleAlreadyMatches` suppresses a mere re-sign of the currently
 * persisted semantic state.
 */

import { createHash } from "node:crypto";

export const IOS_LIFECYCLE_SNAPSHOT_PREFIX = "vyd-ios-life-v1:";

export interface IosLifecycleSnapshot {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  status: number;
  autoRenewStatus: number;
  expiresDate: number | null;
  gracePeriodExpiresDate: number | null;
  revocationDate: number | null;
  renewalSignedDate: number | null;
}

export function iosLifecycleSnapshotHash(snapshot: IosLifecycleSnapshot): string {
  const canonical = [
    snapshot.transactionId,
    snapshot.originalTransactionId,
    snapshot.productId,
    String(snapshot.status),
    String(snapshot.autoRenewStatus),
    snapshot.expiresDate == null ? "" : String(snapshot.expiresDate),
    snapshot.gracePeriodExpiresDate == null ? "" : String(snapshot.gracePeriodExpiresDate),
    snapshot.revocationDate == null ? "" : String(snapshot.revocationDate),
    snapshot.renewalSignedDate == null ? "" : String(snapshot.renewalSignedDate),
  ].join(":");
  return createHash("sha256")
    .update(`${IOS_LIFECYCLE_SNAPSHOT_PREFIX}${canonical}`, "utf8")
    .digest("hex");
}

export function iosLifecycleIdempotencyKey(statusLabel: string, snapshotHash: string): string {
  return `ios:life:${statusLabel}:${snapshotHash}`;
}
