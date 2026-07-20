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
  lastErrorCategory: DeletionErrorCategory;
  /** Privacy-safe short code, never PII. */
  lastErrorCode: string | null;
  phases: DeletionJobPhases;
  completedAt: number | null;
  updatedAt: number;
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
}): DeletionJobDoc {
  const now = input.now ?? Date.now();
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
  };
}

/** Promote awaiting_grace → ready when grace has elapsed. */
export function shouldPromoteToReady(job: DeletionJobDoc, now: number): boolean {
  return job.status === "awaiting_grace" && job.graceExpiresAt <= now;
}

export function isLeaseActive(job: DeletionJobDoc, now: number): boolean {
  return Boolean(job.leaseUntil && job.leaseUntil > now && job.status === "leased");
}

export function canAcquireLease(job: DeletionJobDoc, now: number): boolean {
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
