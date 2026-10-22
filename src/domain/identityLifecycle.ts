import type { AccountStatus } from "./accountDeletion";

/** UEID registry entry lifecycle (Firestore `ueidIndex`). */
export type UeidIndexStatus = "active" | "retired";

/**
 * Legacy cancellation window for requests already stored.
 * Owner 2026-10-06: 45 days. Do not reuse this constant for new requests.
 * New requests use the version-2 schedule below. GRIN for those jobs is
 * selected by policy version, not by flipping INCLUDE_GRIN_IN_ACCOUNT_PURGE.
 */
export const DELETION_GRACE_DAYS = 45;

export const DELETION_GRACE_MS = DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000;

export function computeDeletionScheduledFor(requestedAt: number): number {
  return requestedAt + DELETION_GRACE_MS;
}

/** New requests only. Reactivation and the processing allowance both sit inside 15 days. */
export const DELETION_POLICY_VERSION_V2 = 2;
export const DELETION_V2_ERASURE_DAYS = 15;
export const DELETION_V2_PROCESSING_ALLOWANCE_DAYS = 2;
export const DELETION_V2_REACTIVATION_DAYS =
  DELETION_V2_ERASURE_DAYS - DELETION_V2_PROCESSING_ALLOWANCE_DAYS;

const DAY_MS = 24 * 60 * 60 * 1000;
export const DELETION_V2_ERASURE_MS = DELETION_V2_ERASURE_DAYS * DAY_MS;
export const DELETION_V2_PROCESSING_ALLOWANCE_MS = DELETION_V2_PROCESSING_ALLOWANCE_DAYS * DAY_MS;
export const DELETION_V2_REACTIVATION_MS = DELETION_V2_REACTIVATION_DAYS * DAY_MS;

export function newDeletionSchedule(requestedAt: number): {
  deletionPolicyVersion: 2;
  deletionRequestedAt: number;
  reactivationCutoff: number;
  erasureDeadline: number;
  deletionScheduledFor: number;
} {
  const reactivationCutoff = requestedAt + DELETION_V2_REACTIVATION_MS;
  return {
    deletionPolicyVersion: DELETION_POLICY_VERSION_V2,
    deletionRequestedAt: requestedAt,
    reactivationCutoff,
    erasureDeadline: requestedAt + DELETION_V2_ERASURE_MS,
    deletionScheduledFor: reactivationCutoff,
  };
}

/** Missing legacy deadline stays on the 45-day policy. It is not reset to 15 days. */
export function legacyErasureDeadline(input: {
  deletionPolicyVersion?: number | null;
  deletionRequestedAt?: number | null;
  deletionScheduledFor?: number | null;
  erasureDeadline?: number | null;
}): number {
  if (Number(input.deletionPolicyVersion ?? 1) >= 2 && Number(input.erasureDeadline) > 0) {
    return Number(input.erasureDeadline);
  }
  const stored = Number(input.deletionScheduledFor ?? 0);
  if (stored > 0) return stored;
  return Number(input.deletionRequestedAt ?? 0) + DELETION_GRACE_MS;
}

export function isCanonicalAccountStatus(value: unknown): value is AccountStatus {
  return value === "active" || value === "pending_deletion" || value === "deleted";
}
