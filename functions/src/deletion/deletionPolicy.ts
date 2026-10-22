/**
 * Policy version 2 applies to new deletion requests.
 * DELETION_GRACE_MS in finalPurge.ts remains the legacy 45-day window.
 */

export const DELETION_POLICY_VERSION_V2 = 2;
export const DELETION_V2_ERASURE_DAYS = 15;
export const DELETION_V2_PROCESSING_ALLOWANCE_DAYS = 2;
export const DELETION_V2_REACTIVATION_DAYS =
  DELETION_V2_ERASURE_DAYS - DELETION_V2_PROCESSING_ALLOWANCE_DAYS;

const DAY_MS = 24 * 60 * 60 * 1000;
export const DELETION_V2_ERASURE_MS = DELETION_V2_ERASURE_DAYS * DAY_MS;
export const DELETION_V2_PROCESSING_ALLOWANCE_MS = DELETION_V2_PROCESSING_ALLOWANCE_DAYS * DAY_MS;
export const DELETION_V2_REACTIVATION_MS = DELETION_V2_REACTIVATION_DAYS * DAY_MS;

/** Legacy missing deadline. This is the 45-day policy then in force, not 15 days and not "now". */
export const LEGACY_MISSING_DEADLINE_MS = 45 * DAY_MS;

export function newDeletionSchedule(requestedAt: number): {
  deletionPolicyVersion: 2;
  deletionRequestedAt: number;
  reactivationCutoff: number;
  erasureDeadline: number;
  deletionScheduledFor: number;
} {
  const reactivationCutoff = requestedAt + DELETION_V2_REACTIVATION_MS;
  const erasureDeadline = requestedAt + DELETION_V2_ERASURE_MS;
  return {
    deletionPolicyVersion: DELETION_POLICY_VERSION_V2,
    deletionRequestedAt: requestedAt,
    reactivationCutoff,
    erasureDeadline,
    deletionScheduledFor: reactivationCutoff,
  };
}

export function legacyErasureDeadline(input: {
  deletionPolicyVersion?: number | null;
  deletionRequestedAt?: number | null;
  deletionScheduledFor?: number | null;
  erasureDeadline?: number | null;
}): number {
  const version = Number(input.deletionPolicyVersion ?? 1);
  if (version >= DELETION_POLICY_VERSION_V2 && Number(input.erasureDeadline) > 0) {
    return Number(input.erasureDeadline);
  }
  const stored = Number(input.deletionScheduledFor ?? 0);
  if (stored > 0) return stored;
  return Number(input.deletionRequestedAt ?? 0) + LEGACY_MISSING_DEADLINE_MS;
}

export function preservedGraceExpiresAt(
  existingVersion: number | null | undefined,
  existingGrace: number,
  incomingGrace: number
): number {
  if (Number(existingVersion ?? 1) >= DELETION_POLICY_VERSION_V2) return existingGrace;
  return Math.max(existingGrace, incomingGrace);
}

export function delayedWriteMayRecreate(
  accountStatus: string | null | undefined,
  jobStatus: string | null | undefined
): boolean {
  if (jobStatus === "completed" || jobStatus === "needs_manual_review") return false;
  if (accountStatus === "deleted" || accountStatus === "pending_deletion") return false;
  return true;
}

export function claimsFullErasure(job: {
  status?: string;
  processorDeletion?: string | null;
}): boolean {
  return job.status === "completed" && job.processorDeletion !== "incomplete" && job.processorDeletion !== "failed";
}

export type ErasureManifestEntry = { uid: string; generation: number };

/** A restored snapshot for an erased generation must not come back as a live account. */
export function restoredSnapshotMustBeSuppressed(
  restoredUid: string | null,
  manifest: ErasureManifestEntry | null
): boolean {
  if (!manifest || !restoredUid) return false;
  return restoredUid === manifest.uid;
}
