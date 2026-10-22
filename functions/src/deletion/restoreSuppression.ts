/**
 * Re-applies a completed erasure if a restored document marks the account active.
 * Runs from the existing deletion scheduler. This is source logic, not a live PITR hook.
 */

import type { Firestore } from "firebase-admin/firestore";

import { DELETION_JOBS } from "./deletionJob";
import { purgeUserSubcollectionsFully } from "./firestorePurge";

const USERS = "users";
const PAGE = 40;

export async function reapplyCompletedDeletionManifest(db: Firestore, now: number): Promise<number> {
  const snap = await db.collection(DELETION_JOBS).where("status", "==", "completed").limit(PAGE).get();
  let suppressed = 0;
  for (const job of snap.docs) {
    const userRef = db.collection(USERS).doc(job.id);
    const user = await userRef.get();
    if (!user.exists) continue;
    const status = String(user.data()?.status ?? "");
    if (status === "deleted") {
      const purged = await purgeUserSubcollectionsFully(db, job.id);
      if (!purged.exhausted) {
        await job.ref.set(
          { restoreSuppression: "incomplete", updatedAt: now },
          { merge: true }
        );
      }
      continue;
    }
    if (status === "active") {
      await userRef.set({ status: "deleted", updatedAt: now }, { merge: true });
      const purged = await purgeUserSubcollectionsFully(db, job.id);
      await job.ref.set(
        {
          restoreSuppression: purged.exhausted ? "reapplied" : "incomplete",
          updatedAt: now,
        },
        { merge: true }
      );
      suppressed += 1;
    }
  }
  return suppressed;
}
