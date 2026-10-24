/**
 * Re-applies a completed erasure if a restored document marks the account active.
 * A Firestore status flip is not complete suppression: owned storage and GRIN
 * are part of the same pass. The cursor resumes after an interrupted page.
 */

import { FieldPath, type Firestore } from "firebase-admin/firestore";

import { DELETION_JOBS } from "./deletionJob";
import { purgeUserSubcollectionsFully } from "./firestorePurge";
import { deletedProfileStub } from "./deletionSafety";

const USERS = "users";
const CHECKPOINT = "deletionMaintenance";
const CHECKPOINT_ID = "restoreSuppression";
const PAGE = 40;
const MAX_PAGES = 25;

export type CompletedJobRow = { id: string; policyVersion: number };

export async function suppressCompletedRestorations(input: {
  now: number;
  pageSize: number;
  maxPages: number;
  readCursor: () => Promise<string | null>;
  writeCursor: (cursor: string | null) => Promise<void>;
  listCompleted: (afterId: string | null, limit: number) => Promise<CompletedJobRow[]>;
  readUserStatus: (uid: string) => Promise<string | null>;
  markDeleted: (uid: string) => Promise<void>;
  purgeFirestore: (uid: string) => Promise<{ exhausted: boolean }>;
  purgeStorage: (uid: string) => Promise<{ verifiedEmpty: boolean }>;
  purgeGrin: (uid: string, policyVersion: number) => Promise<{ completed: boolean }>;
  noteIncomplete: (uid: string) => Promise<void>;
}): Promise<{ suppressed: number; processed: number; incomplete: number }> {
  let cursor = await input.readCursor();
  let suppressed = 0;
  let processed = 0;
  let incomplete = 0;
  for (let page = 0; page < input.maxPages; page += 1) {
    const rows = await input.listCompleted(cursor, input.pageSize);
    if (rows.length === 0) {
      await input.writeCursor(null);
      break;
    }
    for (const row of rows) {
      processed += 1;
      cursor = row.id;
      const status = await input.readUserStatus(row.id);
      if (status !== "deleted") {
        await input.markDeleted(row.id);
        suppressed += 1;
      }
      const [firestore, storage, grin] = await Promise.all([
        input.purgeFirestore(row.id),
        input.purgeStorage(row.id),
        input.purgeGrin(row.id, row.policyVersion),
      ]);
      const complete = firestore.exhausted && storage.verifiedEmpty && grin.completed;
      if (!complete) {
        incomplete += 1;
        await input.noteIncomplete(row.id);
      }
    }
    await input.writeCursor(cursor);
    if (rows.length < input.pageSize) {
      await input.writeCursor(null);
      break;
    }
  }
  return { suppressed, processed, incomplete };
}

export async function reapplyCompletedDeletionManifest(db: Firestore, now: number, source = "erasureManifests"): Promise<number> {
  const { getAdminBucket } = await import("../admin");
  const { purgeAllUserOwnedStorage } = await import("./storagePurge");
  const { purgeGrinEvidenceIfEnabled } = await import("./grinCleanup");
  const bucket = getAdminBucket();
  const checkpoint = db.collection(CHECKPOINT).doc(`${CHECKPOINT_ID}_${source}`);
  const result = await suppressCompletedRestorations({
    now,
    pageSize: PAGE,
    maxPages: MAX_PAGES,
    async readCursor() {
      const snap = await checkpoint.get();
      const cursor = snap.data()?.cursor;
      return typeof cursor === "string" && cursor ? cursor : null;
    },
    async writeCursor(cursor) {
      await checkpoint.set({ cursor, updatedAt: now }, { merge: true });
    },
    async listCompleted(afterId, limit) {
      let query = source === DELETION_JOBS
        ? db.collection(DELETION_JOBS).where("status", "==", "completed").orderBy(FieldPath.documentId()).limit(limit)
        : db.collection(source).orderBy(FieldPath.documentId()).limit(limit);
      if (afterId) query = query.startAfter(afterId);
      const snap = await query.get();
      return snap.docs.map((job) => ({
        id: job.id,
        policyVersion: Number(job.data().deletionPolicyVersion ?? 1),
      }));
    },
    async readUserStatus(uid) {
      const user = await db.collection(USERS).doc(uid).get();
      if (!user.exists) return null;
      return String(user.data()?.status ?? "");
    },
    async markDeleted(uid) {
      await db.collection(USERS).doc(uid).set(deletedProfileStub(uid, now));
    },
    async purgeFirestore(uid) {
      return purgeUserSubcollectionsFully(db, uid);
    },
    async purgeStorage(uid) {
      const purged = await purgeAllUserOwnedStorage(bucket, uid);
      return { verifiedEmpty: purged.verifiedEmpty };
    },
    async purgeGrin(uid, policyVersion) {
      const { adminGrinFirestoreAdapter } = await import("./finalPurge");
      const purged = await purgeGrinEvidenceIfEnabled({
        uid,
        bucket,
        db: adminGrinFirestoreAdapter(),
        force: policyVersion >= 2,
      });
      return { completed: purged.completed };
    },
    async noteIncomplete(uid) {
      await db.collection(DELETION_JOBS).doc(uid).set(
        { restoreSuppression: "incomplete", updatedAt: now },
        { merge: true }
      );
    },
  });
  return result.suppressed + (source === DELETION_JOBS ? 0 : await reapplyCompletedDeletionManifest(db, now, DELETION_JOBS));
}
