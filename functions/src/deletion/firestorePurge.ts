/**
 * Bounded purge of explicitly owned subcollections. Nested data is never silently orphaned.
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
  "partyLedgerProjections",
  "partyLedgerBuckets",
  "partyLedgerCommands",
  "partyLedgerCheckpoints",
  "processingPurposes",
  "processingPurposeEvents",
] as const;

const BATCH = 400;
const MAX_BATCHES_PER_ATTEMPT = 10;

export async function purgeUserSubcollectionsFully(
  db: Firestore,
  uid: string
): Promise<{ deleted: number; exhausted: boolean }> {
  let deleted = 0;
  let batches = 0;
  for (const sub of USER_SUBCOLLECTIONS) {
    while (batches < MAX_BATCHES_PER_ATTEMPT) {
      const snap = await db
        .collection("users")
        .doc(uid)
        .collection(sub)
        .limit(BATCH)
        .get();
      if (snap.empty) break;
      // Parent deletion is not recursive. Refuse completion for unexpected
      // nested data until its retention scope has been explicitly inventoried.
      for (const row of snap.docs) {
        if ((await row.ref.listCollections()).length > 0) {
          throw new Error("unmapped_nested_user_data");
        }
      }
      batches += 1;
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
