import type { AccountStatus } from "./accountDeletion";

/** UEID registry entry lifecycle (Firestore `ueidIndex`). */
export type UeidIndexStatus = "active" | "retired";

/** Grace period before pending deletion becomes final. */
export const DELETION_GRACE_DAYS = 15;

export const DELETION_GRACE_MS = DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000;

export function computeDeletionScheduledFor(requestedAt: number): number {
  return requestedAt + DELETION_GRACE_MS;
}

export function isCanonicalAccountStatus(value: unknown): value is AccountStatus {
  return value === "active" || value === "pending_deletion" || value === "deleted";
}
