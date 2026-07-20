/**
 * Recursive Firestore subcollection purge with continuation until empty.
 */

import type { Firestore } from "firebase-admin/firestore";

export const USER_SUBCOLLECTIONS = [
  "entries",
  "professionalPacks",
  "letterheadDocs",
  "customerCreditRecords",
  "purchaseOrders",
  "config",
  "counters",
  "_saveLocks",
  "trustedDevices",
] as const;

const BATCH = 400;
const MAX_LOOPS_PER_SUB = 100;

export async function purgeUserSubcollectionsFully(
  db: Firestore,
  uid: string
): Promise<{ deleted: number; exhausted: boolean }> {
  let deleted = 0;
  for (const sub of USER_SUBCOLLECTIONS) {
    let loops = 0;
    while (loops < MAX_LOOPS_PER_SUB) {
      loops += 1;
      const snap = await db
        .collection("users")
        .doc(uid)
        .collection(sub)
        .limit(BATCH)
        .get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      deleted += snap.size;
      if (snap.size < BATCH) break;
    }
  }
  for (const sub of USER_SUBCOLLECTIONS) {
    const snap = await db.collection("users").doc(uid).collection(sub).limit(1).get();
    if (!snap.empty) {
      return { deleted, exhausted: false };
    }
  }
  return { deleted, exhausted: true };
}
