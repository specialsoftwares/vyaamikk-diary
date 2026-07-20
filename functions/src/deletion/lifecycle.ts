import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

import { getAdminDb } from "../admin";
import {
  DELETION_JOBS,
  type DeletionJobDoc,
} from "./deletionJob";
import {
  DELETION_GRACE_MS,
  cancelDeletionJob,
  ensureDeletionJobDoc,
  runFinalAccountPurge,
} from "./finalPurge";

const USERS = "users";

/**
 * Ensure durable deletionJobs/{uid} after client marks pending_deletion.
 * Auth required; uid must match.
 */
export const ensureAccountDeletionJob = onCall(
  { region: "asia-south1" },
  async (request) => {
    const authUid = request.auth?.uid;
    if (!authUid) throw new HttpsError("unauthenticated", "Sign in first.");

    const db = getAdminDb();
    const userSnap = await db.collection(USERS).doc(authUid).get();
    if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");
    const user = userSnap.data() as Record<string, unknown>;
    if (String(user.status) !== "pending_deletion") {
      throw new HttpsError("failed-precondition", "Account is not pending deletion.");
    }
    const requestedAt = Number(user.deletionRequestedAt ?? Date.now());
    const graceExpiresAt =
      Number(user.deletionScheduledFor ?? 0) || requestedAt + DELETION_GRACE_MS;

    const job = await ensureDeletionJobDoc({
      uid: authUid,
      requestedAt,
      graceExpiresAt,
    });

    return {
      ok: true as const,
      generation: job.generation,
      graceExpiresAt: job.graceExpiresAt,
      status: job.status,
    };
  }
);

/**
 * Retire identity — Admin-only final purge (same pipeline as complete).
 * Kept for compatibility; requires pending/deleted eligibility via job bootstrap.
 */
export const retireIdentity = onCall({ region: "asia-south1" }, async (request) => {
  const authUid = request.auth?.uid;
  if (!authUid) throw new HttpsError("unauthenticated", "Sign in first.");

  const db = getAdminDb();
  const userSnap = await db.collection(USERS).doc(authUid).get();
  if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

  const result = await runFinalAccountPurge(authUid);
  if (!result.ok && result.detail === "grace_not_elapsed") {
    throw new HttpsError("failed-precondition", "Deletion grace period has not elapsed.");
  }
  if (!result.ok && result.detail === "cancelled") {
    throw new HttpsError("aborted", "Deletion was cancelled.");
  }
  return { ok: result.ok, detail: result.detail };
});

/** Final account deletion after grace — callable from app or after job ensure. */
export const completeAccountDeletion = onCall(
  { region: "asia-south1" },
  async (request) => {
    const authUid = request.auth?.uid;
    if (!authUid) throw new HttpsError("unauthenticated", "Sign in first.");

    const db = getAdminDb();
    const userRef = db.collection(USERS).doc(authUid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      // May still need Auth/Storage cleanup via ledger.
      const result = await runFinalAccountPurge(authUid);
      return { ok: result.ok, detail: result.detail || "already_gone" };
    }

    const user = userSnap.data() as Record<string, unknown>;
    const status = String(user.status ?? "active");
    if (status === "pending_deletion") {
      const scheduled =
        Number(user.deletionScheduledFor ?? 0) ||
        Number(user.deletionRequestedAt ?? 0) + DELETION_GRACE_MS;
      if (scheduled > Date.now()) {
        throw new HttpsError("failed-precondition", "Deletion grace period has not elapsed.");
      }
      await ensureDeletionJobDoc({
        uid: authUid,
        requestedAt: Number(user.deletionRequestedAt ?? Date.now()),
        graceExpiresAt: scheduled,
      });
    } else if (status !== "deleted") {
      throw new HttpsError("failed-precondition", "Account is not pending deletion.");
    }

    const result = await runFinalAccountPurge(authUid);
    if (!result.ok && result.detail === "grace_not_elapsed") {
      throw new HttpsError("failed-precondition", "Deletion grace period has not elapsed.");
    }
    return { ok: result.ok, detail: result.detail };
  }
);

const SCHEDULER_PAGE = 40;
const SCHEDULER_MAX_PAGES = 25;

/**
 * Periodic sweep:
 * 1) Promote awaiting_grace jobs whose grace elapsed → ready
 * 2) Run purge for ready / expired-lease jobs (paginated; no permanent starvation)
 */
export const scheduledDeletionCleanup = onSchedule(
  { schedule: "every 24 hours", region: "asia-south1" },
  async () => {
    const db = getAdminDb();
    const now = Date.now();

    // Promote grace-elapsed jobs (paged).
    for (let page = 0; page < SCHEDULER_MAX_PAGES; page += 1) {
      const snap = await db
        .collection(DELETION_JOBS)
        .where("status", "==", "awaiting_grace")
        .where("graceExpiresAt", "<=", now)
        .limit(SCHEDULER_PAGE)
        .get();
      if (snap.empty) break;
      for (const doc of snap.docs) {
        await doc.ref.set({ status: "ready", updatedAt: now }, { merge: true });
      }
      if (snap.size < SCHEDULER_PAGE) break;
    }

    // Also bootstrap jobs from users still pending without a job (legacy).
    for (let page = 0; page < SCHEDULER_MAX_PAGES; page += 1) {
      const snap = await db
        .collection(USERS)
        .where("status", "==", "pending_deletion")
        .limit(SCHEDULER_PAGE)
        .get();
      if (snap.empty) break;
      for (const doc of snap.docs) {
        const data = doc.data();
        const scheduled =
          Number(data.deletionScheduledFor ?? 0) ||
          Number(data.deletionRequestedAt ?? 0) + DELETION_GRACE_MS;
        if (scheduled > now) continue;
        await ensureDeletionJobDoc({
          uid: doc.id,
          requestedAt: Number(data.deletionRequestedAt ?? now),
          graceExpiresAt: scheduled,
        });
        await runFinalAccountPurge(doc.id);
      }
      if (snap.size < SCHEDULER_PAGE) break;
    }

    // Process ready jobs.
    for (let page = 0; page < SCHEDULER_MAX_PAGES; page += 1) {
      const snap = await db
        .collection(DELETION_JOBS)
        .where("status", "==", "ready")
        .limit(SCHEDULER_PAGE)
        .get();
      if (snap.empty) break;
      for (const doc of snap.docs) {
        await runFinalAccountPurge(doc.id);
      }
      if (snap.size < SCHEDULER_PAGE) break;
    }

    // Reclaim expired leases.
    const leased = await db
      .collection(DELETION_JOBS)
      .where("status", "==", "leased")
      .limit(SCHEDULER_PAGE)
      .get();
    for (const doc of leased.docs) {
      const job = doc.data() as DeletionJobDoc;
      if (job.leaseUntil && job.leaseUntil <= now) {
        await doc.ref.set(
          { status: "ready", leaseOwner: null, leaseUntil: null, updatedAt: now },
          { merge: true }
        );
        await runFinalAccountPurge(doc.id);
      }
    }
  }
);

export { cancelDeletionJob, DELETION_GRACE_MS };
