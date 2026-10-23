import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldPath, type Query, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { walkDeletionPages } from "./deletionSafety";
import { onSchedule } from "firebase-functions/v2/scheduler";

import { getAdminDb } from "../admin";
import {
  DELETION_JOBS,
  type DeletionJobDoc,
} from "./deletionJob";
import { assertAdmittedCallableUser } from "../identity/admitCallableUser";
import {
  DELETION_GRACE_MS,
  cancelDeletionJob,
  ensureDeletionJobDoc,
  runFinalAccountPurge,
} from "./finalPurge";
import { deletionJobInputFromUser, deletionStampFromJobInput } from "./deletionPolicy";
import { reapplyCompletedDeletionManifest } from "./restoreSuppression";

const USERS = "users";

/**
 * Ensure durable deletionJobs/{uid} after client marks pending_deletion.
 * Auth required; uid must match.
 */
export const ensureAccountDeletionJob = onCall(
  { region: "asia-south1" },
  async (request) => {
    await assertAdmittedCallableUser(request);
    const authUid = request.auth?.uid;
    if (!authUid) throw new HttpsError("unauthenticated", "Sign in first.");

    const db = getAdminDb();
    const userSnap = await db.collection(USERS).doc(authUid).get();
    if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");
    const user = userSnap.data() as Record<string, unknown>;
    if (String(user.status) !== "pending_deletion") {
      throw new HttpsError("failed-precondition", "Account is not pending deletion.");
    }
    const accepted = deletionJobInputFromUser(user, Date.now());
    if (accepted.stamp) {
      await userSnap.ref.set(deletionStampFromJobInput(accepted, Date.now()), { merge: true });
    }
    const job = await ensureDeletionJobDoc({
      uid: authUid,
      requestedAt: accepted.requestedAt,
      graceExpiresAt: accepted.graceExpiresAt,
      deletionPolicyVersion: accepted.deletionPolicyVersion,
      reactivationCutoff: accepted.reactivationCutoff,
      erasureDeadline: accepted.erasureDeadline,
    });

    return {
      ok: true as const,
      generation: job.generation,
      graceExpiresAt: job.graceExpiresAt,
      status: job.status,
      deletionRequestedAt: accepted.requestedAt,
      deletionPolicyVersion: job.deletionPolicyVersion ?? accepted.deletionPolicyVersion,
      reactivationCutoff: job.reactivationCutoff ?? accepted.reactivationCutoff,
      erasureDeadline: job.erasureDeadline ?? accepted.erasureDeadline,
    };
  }
);

/**
 * Retire identity — Admin-only final purge (same pipeline as complete).
 * Kept for compatibility; requires pending/deleted eligibility via job bootstrap.
 */
export const retireIdentity = onCall({ region: "asia-south1" }, async (request) => {
  await assertAdmittedCallableUser(request);
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
    await assertAdmittedCallableUser(request);
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
      const accepted = deletionJobInputFromUser(user, Date.now());
      if (accepted.graceExpiresAt > Date.now()) {
        throw new HttpsError("failed-precondition", "Deletion grace period has not elapsed.");
      }
      if (accepted.stamp) {
        await userRef.set(deletionStampFromJobInput(accepted, Date.now()), { merge: true });
      }
      await ensureDeletionJobDoc({
        uid: authUid,
        requestedAt: accepted.requestedAt,
        graceExpiresAt: accepted.graceExpiresAt,
        deletionPolicyVersion: accepted.deletionPolicyVersion,
        reactivationCutoff: accepted.reactivationCutoff,
        erasureDeadline: accepted.erasureDeadline,
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
 *
 * GRIN cleanup rides runFinalAccountPurge and the account-purge flag (default
 * false). Do not add a second GRIN cron. Flag-false: this job must not purge
 * customer GRIN. Flag-true remains an UNAPPROVED live grant.
 */
export const scheduledDeletionCleanup = onSchedule(
  { schedule: "every 24 hours", region: "asia-south1" },
  async () => {
    const db = getAdminDb();
    const now = Date.now();

    async function sweep(name: string, query: Query, visit: (row: QueryDocumentSnapshot) => Promise<void>) {
      const checkpoint = db.collection("deletionMaintenance").doc(name);
      const cursor = (await checkpoint.get()).data()?.cursor;
      await walkDeletionPages({
        cursor: typeof cursor === "string" ? cursor : null,
        pageSize: SCHEDULER_PAGE, maxPages: SCHEDULER_MAX_PAGES,
        async list(after, limit) {
          let q = query.orderBy(FieldPath.documentId()).limit(limit);
          if (after) q = q.startAfter(after);
          return (await q.get()).docs;
        },
        visit,
        checkpoint: async cursor => { await checkpoint.set({ cursor, updatedAt: now }); },
      });
    }
    await sweep("promote", db.collection(DELETION_JOBS).where("status", "==", "awaiting_grace"), async row => {
      await db.runTransaction(async tx => {
        const fresh = await tx.get(row.ref);
        const job = fresh.data() as DeletionJobDoc;
        if (job?.status === "awaiting_grace" && job.graceExpiresAt <= now) {
          tx.update(row.ref, { status: "ready", updatedAt: now });
        }
      });
    });
    await sweep("bootstrap", db.collection(USERS).where("status", "==", "pending_deletion"), async row => {
      const accepted = await db.runTransaction(async tx => {
        const fresh = await tx.get(row.ref);
        if (fresh.data()?.status !== "pending_deletion") return null;
        const input = deletionJobInputFromUser(fresh.data()!, now);
        if (input.stamp) tx.set(row.ref, deletionStampFromJobInput(input, now), { merge: true });
        return input;
      });
      if (!accepted) return;
      await ensureDeletionJobDoc({ uid: row.id, ...accepted });
      if (accepted.graceExpiresAt <= now) await runFinalAccountPurge(row.id);
    });
    await sweep("ready", db.collection(DELETION_JOBS).where("status", "==", "ready"), async row => {
      await runFinalAccountPurge(row.id);
    });
    await sweep("expiredLeases", db.collection(DELETION_JOBS).where("status", "==", "leased"), async row => {
      // acquireLease owns the transactional compare-and-swap; never clear a lease
      // from an old query snapshot while its owner may have renewed it.
      if (Number(row.data().leaseUntil) <= now) await runFinalAccountPurge(row.id);
    });

    await reapplyCompletedDeletionManifest(db, now);
  }
);

export { cancelDeletionJob, DELETION_GRACE_MS };
