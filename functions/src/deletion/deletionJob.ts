/**
 * Durable account-deletion ledger (server-owned).
 * Survives anonymisation of users/{uid} and supports Auth retry after data purge.
 *
 * Collection: deletionJobs/{uid}
 * Contains NO phone numbers, emails, OTPs, record content, or Storage download tokens.
 */

export const DELETION_JOBS = "deletionJobs";

export type DeletionJobStatus =
  | "awaiting_grace"
  | "ready"
  | "leased"
  | "completed"
  | "cancelled"
  | "needs_manual_review";

export type DeletionPhaseName = "storage" | "firestore" | "indexes" | "auth";

export type DeletionPhaseStatus = "pending" | "in_progress" | "done" | "failed";

export type DeletionErrorCategory =
  | "transient"
  | "permanent"
  | "cancelled"
  | "config"
  | null;

export interface DeletionJobPhases {
  storage: DeletionPhaseStatus;
  firestore: DeletionPhaseStatus;
  indexes: DeletionPhaseStatus;
  auth: DeletionPhaseStatus;
}

export interface DeletionJobDoc {
  uid: string;
  /** Bumped on each new deletion request / reactivation cancel. */
  generation: number;
  status: DeletionJobStatus;
  requestedAt: number;
  graceExpiresAt: number;
  leaseOwner: string | null;
  leaseUntil: number | null;
  attempts: number;
  nextAttemptAt?: number;
  lastErrorCategory: DeletionErrorCategory;
  /** Privacy-safe short code, never PII. */
  lastErrorCode: string | null;
  phases: DeletionJobPhases;
  completedAt: number | null;
  updatedAt: number;
  /** 1 = legacy 45-day window. 2 = 15-day new-request policy. Missing means legacy. */
  deletionPolicyVersion?: number;
  reactivationCutoff?: number | null;
  erasureDeadline?: number | null;
  /** Crashlytics and mail-provider tails are not per-user deletable. */
  processorDeletion?: "not_applicable" | "incomplete" | "failed";
  /** Page to reread after an interrupted Firestore purge. Not a content cursor. */
  firestoreCursor?: { parentPath: string; collectionId: string; pageToken: string } | null;
}

export const EMPTY_PHASES: DeletionJobPhases = {
  storage: "pending",
  firestore: "pending",
  indexes: "pending",
  auth: "pending",
};

export const LEASE_MS = 5 * 60 * 1000;
export const MAX_ATTEMPTS_BEFORE_MANUAL = 12;

export function initialDeletionJob(input: {
  uid: string;
  requestedAt: number;
  graceExpiresAt: number;
  generation?: number;
  now?: number;
  deletionPolicyVersion?: number;
  reactivationCutoff?: number | null;
  erasureDeadline?: number | null;
}): DeletionJobDoc {
  const now = input.now ?? Date.now();
  const version = input.deletionPolicyVersion ?? 1;
  return {
    uid: input.uid,
    generation: input.generation ?? 1,
    status: "awaiting_grace",
    requestedAt: input.requestedAt,
    graceExpiresAt: input.graceExpiresAt,
    leaseOwner: null,
    leaseUntil: null,
    attempts: 0,
    lastErrorCategory: null,
    lastErrorCode: null,
    phases: { ...EMPTY_PHASES },
    completedAt: null,
    updatedAt: now,
    deletionPolicyVersion: version,
    reactivationCutoff: input.reactivationCutoff ?? input.graceExpiresAt,
    erasureDeadline: input.erasureDeadline ?? null,
    processorDeletion: version >= 2 ? "incomplete" : "not_applicable",
  };
}

/** Promote awaiting_grace → ready when grace has elapsed. */
export function shouldPromoteToReady(job: DeletionJobDoc, now: number): boolean {
  return job.status === "awaiting_grace" && job.graceExpiresAt <= now;
}

export function isLeaseActive(job: DeletionJobDoc, now: number): boolean {
  return Boolean(job.leaseUntil && job.leaseUntil > now && job.status === "leased");
}

/** Soft-delete recovery may cancel only before grace ends and before purge work starts. */
export function automaticRestorationAllowed(job: DeletionJobDoc, now: number): boolean {
  if (job.graceExpiresAt <= now) return false;
  if (
    job.status === "completed" ||
    job.status === "needs_manual_review" ||
    job.status === "ready" ||
    job.status === "leased"
  ) {
    return false;
  }
  if (isLeaseActive(job, now)) return false;
  for (const phase of Object.values(job.phases)) {
    if (phase !== "pending") return false;
  }
  return job.status === "awaiting_grace" || job.status === "cancelled";
}

export function canAcquireLease(job: DeletionJobDoc, now: number): boolean {
  if (job.graceExpiresAt > now) return false;
  if (typeof job.nextAttemptAt === "number" && job.nextAttemptAt > now) return false;
  if (job.status === "completed" || job.status === "cancelled") return false;
  if (job.status === "needs_manual_review") return false;
  if (job.status === "awaiting_grace" && job.graceExpiresAt > now) return false;
  if (isLeaseActive(job, now)) return false;
  return (
    job.status === "ready" ||
    job.status === "awaiting_grace" ||
    job.status === "leased" // expired lease falls through isLeaseActive
  );
}

export function nextBackoffMs(attempts: number): number {
  const base = 60_000;
  const capped = Math.min(attempts, 8);
  return Math.min(base * 2 ** Math.max(0, capped - 1), 60 * 60 * 1000);
}

export function classifyProviderError(err: unknown): {
  category: Exclude<DeletionErrorCategory, null>;
  code: string;
} {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (
    lower.includes("firestore_depth_exceeded") ||
    lower.includes("firestore_unknown_collection") ||
    lower.includes("storage_path_not_owned") ||
    lower.includes("permanent") ||
    lower.includes("invalid-argument") ||
    (lower.includes("permission-denied") && lower.includes("config"))
  ) {
    return { category: "permanent", code: "permanent_provider" };
  }
  if (lower.includes("cancelled") || lower.includes("reactivated")) {
    return { category: "cancelled", code: "cancelled" };
  }
  if (lower.includes("not found") || lower.includes("user-not-found")) {
    return { category: "transient", code: "not_found_idempotent" };
  }
  return { category: "transient", code: "transient_provider" };
}

export function allPhasesDone(phases: DeletionJobPhases): boolean {
  return (
    phases.storage === "done" &&
    phases.firestore === "done" &&
    phases.indexes === "done" &&
    phases.auth === "done"
  );
}

/**
 * Job may be marked completed only when diary phases are done AND, when the
 * GRIN account-purge flag is on, GRIN purge itself reported completed.
 * Flag-false production must not wait for GRIN trees (they are omitted).
 * Never treat diary-storage-done as GRIN-done.
 */
export function accountPurgeMayComplete(input: {
  phases: DeletionJobPhases;
  includeGrinInAccountPurge: boolean;
  grinCompleted: boolean;
}): boolean {
  if (!allPhasesDone(input.phases)) return false;
  if (input.includeGrinInAccountPurge && !input.grinCompleted) return false;
  return true;
}
