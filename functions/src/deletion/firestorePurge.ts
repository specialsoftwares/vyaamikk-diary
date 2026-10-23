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
const MAX_NESTED_DEPTH = 4;

type CollectionLike = {
  limit(n: number): { get(): Promise<{ empty: boolean; size: number; docs: DocLike[] }> };
};

type DocLike = {
  ref: {
    listCollections(): Promise<CollectionLike[]>;
  };
};

type PurgeState = {
  db: Firestore;
  deleted: number;
  batches: number;
  onBatch?: () => Promise<void>;
};

async function purgeCollection(col: CollectionLike, state: PurgeState, depth: number): Promise<boolean> {
  if (depth > MAX_NESTED_DEPTH) return false;
  for (;;) {
    if (state.batches >= MAX_BATCHES_PER_ATTEMPT) return false;
    const snap = await col.limit(BATCH).get();
    if (snap.empty) return true;
    for (const row of snap.docs) {
      const nested = await row.ref.listCollections();
      for (const child of nested) {
        const complete = await purgeCollection(child, state, depth + 1);
        if (!complete) return false;
      }
    }
    if (state.batches >= MAX_BATCHES_PER_ATTEMPT) return false;
    state.batches += 1;
    const batch = state.db.batch() as unknown as { delete(ref: unknown): void; commit(): Promise<unknown> };
    snap.docs.forEach((row) => batch.delete(row.ref));
    await batch.commit();
    state.deleted += snap.size;
    if (state.onBatch) await state.onBatch();
    if (snap.size < BATCH) return true;
  }
}

export async function purgeUserSubcollectionsFully(
  db: Firestore,
  uid: string,
  options?: { onBatch?: () => Promise<void> }
): Promise<{ deleted: number; exhausted: boolean }> {
  const state: PurgeState = { db, deleted: 0, batches: 0, onBatch: options?.onBatch };
  for (const sub of USER_SUBCOLLECTIONS) {
    const complete = await purgeCollection(
      db.collection("users").doc(uid).collection(sub) as unknown as CollectionLike,
      state,
      1
    );
    if (!complete) return { deleted: state.deleted, exhausted: false };
  }
  for (const sub of USER_SUBCOLLECTIONS) {
    const snap = await db.collection("users").doc(uid).collection(sub).limit(1).get();
    if (!snap.empty) return { deleted: state.deleted, exhausted: false };
  }
  return { deleted: state.deleted, exhausted: true };
}
