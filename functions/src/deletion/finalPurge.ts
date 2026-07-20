/**
 * Final account purge orchestrator.
 *
 * Cleanup order (recoverable):
 * 1. Acquire lease on deletionJobs/{uid} (generation check)
 * 2. Abort if user reactivated (status active) or job cancelled
 * 3. Storage purge + verify empty
 * 4. Firestore subcollections until empty
 * 5. Index retirement + mark user deleted (minimal stub retained)
 * 6. Firebase Auth deleteUser (last — cron can retry via ledger if this fails)
 *
 * Never marks job completed unless all phases done.
 * Grace period users are never finally deleted.
 */

import { FieldValue } from "firebase-admin/firestore";

import { getAdminAuth, getAdminBucket, getAdminDb } from "../admin";
import { normalizePhoneE164 } from "../identity/shared";
import { deleteAuthUserIdempotent } from "./authDelete";
import {
  DELETION_JOBS,
  MAX_ATTEMPTS_BEFORE_MANUAL,
  allPhasesDone,
  canAcquireLease,
  classifyProviderError,
  initialDeletionJob,
  type DeletionJobDoc,
} from "./deletionJob";
import { purgeUserSubcollectionsFully } from "./firestorePurge";
import { purgeAllUserOwnedStorage } from "./storagePurge";

const USERS = "users";
const PHONE_INDEX = "phoneIndex";
const UEID_INDEX = "ueidIndex";
const EMAIL_INDEX = "emailIndex";
const RETIRED_PHONES = "retiredPhones";

export const DELETION_GRACE_MS = 15 * 24 * 60 * 60 * 1000;

function workerId(): string {
  return `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function ensureDeletionJobDoc(input: {
  uid: string;
  requestedAt: number;
  graceExpiresAt: number;
}): Promise<DeletionJobDoc> {
  const db = getAdminDb();
  const ref = db.collection(DELETION_JOBS).doc(input.uid);
  const now = Date.now();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      const job = initialDeletionJob({ ...input, now });
      tx.set(ref, job);
      return job;
    }
    const existing = snap.data() as DeletionJobDoc;
    if (existing.status === "completed") {
      // New deletion request after prior completion — new generation.
      const job = initialDeletionJob({
        ...input,
        generation: existing.generation + 1,
        now,
      });
      tx.set(ref, job);
      return job;
    }
    if (existing.status === "cancelled") {
      const job = initialDeletionJob({
        ...input,
        generation: existing.generation + 1,
        now,
      });
      tx.set(ref, job);
      return job;
    }
    // Refresh grace timestamps if still awaiting / ready.
    const merged: DeletionJobDoc = {
      ...existing,
      requestedAt: input.requestedAt,
      graceExpiresAt: input.graceExpiresAt,
      status:
        existing.status === "leased" || existing.status === "needs_manual_review"
          ? existing.status
          : input.graceExpiresAt <= now
            ? "ready"
            : "awaiting_grace",
      updatedAt: now,
    };
    tx.set(ref, merged, { merge: true });
    return merged;
  });
}

export async function cancelDeletionJob(uid: string, reason = "reactivated"): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection(DELETION_JOBS).doc(uid);
  const now = Date.now();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const job = snap.data() as DeletionJobDoc;
    if (job.status === "completed") return;
    tx.update(ref, {
      status: "cancelled",
      generation: FieldValue.increment(1),
      leaseOwner: null,
      leaseUntil: null,
      lastErrorCategory: "cancelled",
      lastErrorCode: reason,
      updatedAt: now,
    });
  });
}

type AcquireResult =
  | { ok: true; job: DeletionJobDoc; leaseOwner: string; generation: number }
  | { ok: false; reason: string };

async function acquireLease(uid: string, now: number): Promise<AcquireResult> {
  const db = getAdminDb();
  const ref = db.collection(DELETION_JOBS).doc(uid);
  const leaseOwner = workerId();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      return { ok: false, reason: "no_job" };
    }
    let job = snap.data() as DeletionJobDoc;
    if (job.status === "cancelled") return { ok: false, reason: "cancelled" };
    if (job.status === "completed") return { ok: false, reason: "already_completed" };
    if (job.status === "awaiting_grace" && job.graceExpiresAt <= now) {
      job = { ...job, status: "ready" };
    }
    if (!canAcquireLease(job, now)) {
      return { ok: false, reason: "lease_held_or_not_ready" };
    }
    const leaseUntil = now + 5 * 60 * 1000;
    const next: DeletionJobDoc = {
      ...job,
      status: "leased",
      leaseOwner,
      leaseUntil,
      attempts: job.attempts + 1,
      updatedAt: now,
    };
    tx.set(ref, next);
    return { ok: true, job: next, leaseOwner, generation: next.generation };
  });
}

async function assertStillPendingOrDeletedStub(
  uid: string,
  generation: number
): Promise<{ phone: string; ueid: string; emailHash: string | null }> {
  const db = getAdminDb();
  const userSnap = await db.collection(USERS).doc(uid).get();
  const jobSnap = await db.collection(DELETION_JOBS).doc(uid).get();
  const job = jobSnap.data() as DeletionJobDoc | undefined;
  if (!job || job.generation !== generation) {
    throw new Error("cancelled_generation_mismatch");
  }
  if (job.status === "cancelled") {
    throw new Error("cancelled");
  }

  if (!userSnap.exists) {
    // User doc already gone — continue Auth/Storage from ledger only.
    return { phone: "", ueid: "", emailHash: null };
  }
  const user = userSnap.data() as Record<string, unknown>;
  const status = String(user.status ?? "active");
  if (status === "active") {
    throw new Error("reactivated");
  }
  if (status === "pending_deletion") {
    const scheduled =
      Number(user.deletionScheduledFor ?? 0) ||
      Number(user.deletionRequestedAt ?? 0) + DELETION_GRACE_MS;
    if (scheduled > Date.now()) {
      throw new Error("grace_not_elapsed");
    }
  } else if (status !== "deleted") {
    throw new Error("invalid_status");
  }

  return {
    phone: normalizePhoneE164(String(user.phoneE164 ?? "")),
    ueid: String(user.ueid ?? ""),
    emailHash: typeof user.emailHash === "string" ? user.emailHash : null,
  };
}

async function retireIndexesAndMarkDeleted(
  uid: string,
  phone: string,
  ueid: string,
  emailHash: string | null
): Promise<void> {
  const db = getAdminDb();
  const userRef = db.collection(USERS).doc(uid);
  const now = Date.now();

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    if (userSnap.exists) {
      const user = userSnap.data() as Record<string, unknown>;
      if (String(user.status) === "active") {
        throw new Error("reactivated");
      }
      tx.update(userRef, {
        status: "deleted",
        deletedAt: now,
        deletionCompletedAt: now,
        retiredUeid: true,
        displayName: null,
        businessName: null,
        businessEmail: null,
        normalizedEmail: null,
        emailHash: null,
        profileLogo: null,
        updatedAt: now,
      });
      const p = phone || normalizePhoneE164(String(user.phoneE164 ?? ""));
      const u = ueid || String(user.ueid ?? "");
      const eh =
        emailHash ?? (typeof user.emailHash === "string" ? user.emailHash : null);
      if (p) {
        tx.delete(db.collection(PHONE_INDEX).doc(p));
        tx.set(db.collection(RETIRED_PHONES).doc(p), {
          phoneE164: p,
          retiredUeid: u,
          uid,
          deletedAt: now,
          status: "deleted",
        });
      }
      if (u) {
        tx.set(
          db.collection(UEID_INDEX).doc(u),
          { uid, status: "retired", retired: true, retiredAt: now },
          { merge: true }
        );
      }
      if (eh) {
        tx.set(
          db.collection(EMAIL_INDEX).doc(eh),
          { status: "deleted", emailStatus: "unverified", verifiedAt: null },
          { merge: true }
        );
      }
    } else if (phone) {
      tx.set(db.collection(RETIRED_PHONES).doc(phone), {
        phoneE164: phone,
        retiredUeid: ueid,
        uid,
        deletedAt: now,
        status: "deleted",
      });
      tx.delete(db.collection(PHONE_INDEX).doc(phone));
    }
  });
}

async function patchJob(uid: string, patch: Record<string, unknown>): Promise<void> {
  await getAdminDb()
    .collection(DELETION_JOBS)
    .doc(uid)
    .set({ ...patch, updatedAt: Date.now() }, { merge: true });
}

export type FinalPurgeResult = {
  ok: boolean;
  detail: string;
  phases?: DeletionJobDoc["phases"];
};

/**
 * Run one purge attempt for uid. Idempotent when already completed.
 */
export async function runFinalAccountPurge(uid: string): Promise<FinalPurgeResult> {
  const now = Date.now();
  const acquired = await acquireLease(uid, now);
  if (!acquired.ok) {
    if (acquired.reason === "already_completed") {
      return { ok: true, detail: "already_completed" };
    }
    if (acquired.reason === "cancelled") {
      return { ok: false, detail: "cancelled" };
    }
    // Try bootstrap job from user doc if missing.
    if (acquired.reason === "no_job") {
      const userSnap = await getAdminDb().collection(USERS).doc(uid).get();
      if (!userSnap.exists) return { ok: false, detail: "no_job_no_user" };
      const user = userSnap.data() as Record<string, unknown>;
      if (String(user.status) !== "pending_deletion" && String(user.status) !== "deleted") {
        return { ok: false, detail: "no_job_wrong_status" };
      }
      const requestedAt = Number(user.deletionRequestedAt ?? now);
      const graceExpiresAt =
        Number(user.deletionScheduledFor ?? 0) || requestedAt + DELETION_GRACE_MS;
      await ensureDeletionJobDoc({ uid, requestedAt, graceExpiresAt });
      return runFinalAccountPurge(uid);
    }
    return { ok: false, detail: acquired.reason };
  }

  const { generation, job } = acquired;
  const phases = { ...job.phases };

  try {
    const identity = await assertStillPendingOrDeletedStub(uid, generation);

    // Phase: Storage
    if (phases.storage !== "done") {
      phases.storage = "in_progress";
      await patchJob(uid, { phases });
      await assertStillPendingOrDeletedStub(uid, generation);
      const storageResult = await purgeAllUserOwnedStorage(
        getAdminBucket() as unknown as import("./storagePurge").StorageBucketLike,
        uid
      );
      if (!storageResult.verifiedEmpty) {
        throw new Error("storage_verify_not_empty");
      }
      phases.storage = "done";
      await patchJob(uid, { phases });
    }

    // Phase: Firestore subcollections
    if (phases.firestore !== "done") {
      phases.firestore = "in_progress";
      await patchJob(uid, { phases });
      await assertStillPendingOrDeletedStub(uid, generation);
      const fs = await purgeUserSubcollectionsFully(getAdminDb(), uid);
      if (!fs.exhausted) {
        throw new Error("firestore_purge_incomplete");
      }
      phases.firestore = "done";
      await patchJob(uid, { phases });
    }

    // Phase: indexes + mark deleted
    if (phases.indexes !== "done") {
      phases.indexes = "in_progress";
      await patchJob(uid, { phases });
      await assertStillPendingOrDeletedStub(uid, generation);
      await retireIndexesAndMarkDeleted(
        uid,
        identity.phone,
        identity.ueid,
        identity.emailHash
      );
      phases.indexes = "done";
      await patchJob(uid, { phases });
    }

    // Phase: Auth (last)
    if (phases.auth !== "done") {
      phases.auth = "in_progress";
      await patchJob(uid, { phases });
      // Generation check only — user may already be deleted stub.
      const jobSnap = await getAdminDb().collection(DELETION_JOBS).doc(uid).get();
      const latest = jobSnap.data() as DeletionJobDoc;
      if (latest.generation !== generation || latest.status === "cancelled") {
        throw new Error("cancelled_generation_mismatch");
      }
      await deleteAuthUserIdempotent(getAdminAuth(), uid);
      phases.auth = "done";
      await patchJob(uid, { phases });
    }

    if (!allPhasesDone(phases)) {
      throw new Error("phases_incomplete");
    }

    await patchJob(uid, {
      status: "completed",
      phases,
      leaseOwner: null,
      leaseUntil: null,
      completedAt: Date.now(),
      lastErrorCategory: null,
      lastErrorCode: null,
    });

    return { ok: true, detail: "completed", phases };
  } catch (e) {
    const { category, code } = classifyProviderError(e);
    const attempts = job.attempts;
    const status =
      category === "cancelled"
        ? "cancelled"
        : category === "permanent" || attempts >= MAX_ATTEMPTS_BEFORE_MANUAL
          ? "needs_manual_review"
          : "ready";

    await patchJob(uid, {
      status,
      phases,
      leaseOwner: null,
      leaseUntil: null,
      lastErrorCategory: category,
      lastErrorCode: code,
    });

    return { ok: false, detail: code, phases };
  }
}
