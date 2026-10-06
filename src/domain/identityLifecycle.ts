import type { AccountStatus } from "./accountDeletion";

/** UEID registry entry lifecycle (Firestore `ueidIndex`). */
export type UeidIndexStatus = "active" | "retired";

/**
 * Cancellation window after a confirmed account-deletion request.
 * Owner 2026-10-06: 45 days (SUPERSEDES 15; not 180). Distinct from
 * subscription expiry 90+30 and from optional archive. After this window
 * the existing purge path still deletes non-GRIN account data (Play: freeze
 * ≠ delete). GRIN stays omitted until INCLUDE_GRIN_IN_ACCOUNT_PURGE.
 */
export const DELETION_GRACE_DAYS = 45;

export const DELETION_GRACE_MS = DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000;

export function computeDeletionScheduledFor(requestedAt: number): number {
  return requestedAt + DELETION_GRACE_MS;
}

export function isCanonicalAccountStatus(value: unknown): value is AccountStatus {
  return value === "active" || value === "pending_deletion" || value === "deleted";
}
