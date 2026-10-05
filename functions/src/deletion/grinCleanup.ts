/**
 * Flag-gated GRIN Storage + Firestore cleanup. Injected stores for tests.
 * Default INCLUDE_GRIN_IN_ACCOUNT_PURGE = false — live customer GRIN is not
 * purged by scheduledDeletionCleanup / runFinalAccountPurge until flipped.
 */

import {
  INCLUDE_GRIN_IN_ACCOUNT_PURGE,
  allGrinFirestoreCollectionIds,
  allGrinStoragePrefixes,
} from "./grinCleanupLists";
import {
  countOwnedFilesUnderPrefix,
  purgePrefixPaged,
  type StorageBucketLike,
} from "./storagePurge";

export { INCLUDE_GRIN_IN_ACCOUNT_PURGE };

export type GrinCleanupReport = {
  attempted: boolean;
  completed: boolean;
  retryable: boolean;
  failed: boolean;
  detail: string;
  storageDeleted: number;
  storageExhausted: boolean;
  firestoreDeleted: number;
  firestoreExhausted: boolean;
};

export type GrinDocSnapLike = {
  id: string;
  ref: { path: string };
};

export type GrinFirestoreLike = {
  listCollection(path: string): Promise<GrinDocSnapLike[]>;
  listSubcollections(docPath: string): Promise<string[]>;
  delete(path: string): Promise<void>;
};

const idle = (detail: string): GrinCleanupReport => ({
  attempted: false,
  completed: true,
  retryable: false,
  failed: false,
  detail,
  storageDeleted: 0,
  storageExhausted: true,
  firestoreDeleted: 0,
  firestoreExhausted: true,
});

function isRetryableError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /unavailable|deadline|timeout|aborted|resource-exhausted|retry/i.test(msg);
}

export async function purgeGrinStoragePrefix(
  bucket: StorageBucketLike,
  uid: string
): Promise<{ deleted: number; exhausted: boolean }> {
  let deleted = 0;
  let exhausted = true;
  for (const prefix of allGrinStoragePrefixes(uid)) {
    for (;;) {
      const page = await purgePrefixPaged(bucket, uid, prefix);
      deleted += page.deleted;
      if (page.exhausted) break;
    }
    const remaining = await countOwnedFilesUnderPrefix(bucket, uid, prefix);
    if (remaining > 0) exhausted = false;
  }
  return { deleted, exhausted };
}

export async function purgeGrinFirestoreTrees(
  db: GrinFirestoreLike,
  uid: string
): Promise<{ deleted: number; exhausted: boolean }> {
  let deleted = 0;
  const roots = allGrinFirestoreCollectionIds().map((col) => `users/${uid}/${col}`);
  for (const root of roots) {
    deleted += await deleteCollectionRecursive(db, root);
  }
  for (const root of roots) {
    const leftover = await db.listCollection(root);
    if (leftover.length > 0) return { deleted, exhausted: false };
  }
  return { deleted, exhausted: true };
}

async function deleteCollectionRecursive(db: GrinFirestoreLike, collectionPath: string): Promise<number> {
  let deleted = 0;
  const docs = await db.listCollection(collectionPath);
  for (const doc of docs) {
    const subs = await db.listSubcollections(doc.ref.path);
    for (const sub of subs) {
      deleted += await deleteCollectionRecursive(db, `${doc.ref.path}/${sub}`);
    }
    await db.delete(doc.ref.path);
    deleted += 1;
  }
  return deleted;
}

/**
 * Run GRIN cleanup when the flag is on, or when `force` is set (unit tests).
 * Failure is reported; the caller retries. Completion requires both trees empty.
 */
export async function purgeGrinEvidenceIfEnabled(params: {
  uid: string;
  bucket: StorageBucketLike;
  db: GrinFirestoreLike;
  force?: boolean;
}): Promise<GrinCleanupReport> {
  if (!INCLUDE_GRIN_IN_ACCOUNT_PURGE && params.force !== true) {
    return idle("grin_purge_disabled");
  }
  let storageDeleted = 0;
  let storageExhausted = false;
  let firestoreDeleted = 0;
  let firestoreExhausted = false;
  try {
    const storage = await purgeGrinStoragePrefix(params.bucket, params.uid);
    storageDeleted = storage.deleted;
    storageExhausted = storage.exhausted;
    if (!storage.exhausted) {
      return {
        attempted: true,
        completed: false,
        retryable: true,
        failed: true,
        detail: "grin_storage_incomplete",
        storageDeleted,
        storageExhausted,
        firestoreDeleted: 0,
        firestoreExhausted: false,
      };
    }
    const fs = await purgeGrinFirestoreTrees(params.db, params.uid);
    firestoreDeleted = fs.deleted;
    firestoreExhausted = fs.exhausted;
    if (!fs.exhausted) {
      return {
        attempted: true,
        completed: false,
        retryable: true,
        failed: true,
        detail: "grin_firestore_incomplete",
        storageDeleted,
        storageExhausted,
        firestoreDeleted,
        firestoreExhausted,
      };
    }
    return {
      attempted: true,
      completed: true,
      retryable: false,
      failed: false,
      detail: "grin_purge_completed",
      storageDeleted,
      storageExhausted,
      firestoreDeleted,
      firestoreExhausted,
    };
  } catch (error) {
    const retryable = isRetryableError(error);
    return {
      attempted: true,
      completed: false,
      retryable,
      failed: true,
      detail: error instanceof Error ? error.message : "grin_purge_failed",
      storageDeleted,
      storageExhausted,
      firestoreDeleted,
      firestoreExhausted,
    };
  }
}
