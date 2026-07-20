import assert from "node:assert/strict";

import {
  canAcquireLease,
  classifyProviderError,
  initialDeletionJob,
  shouldPromoteToReady,
  allPhasesDone,
  EMPTY_PHASES,
} from "./deletionJob";
import {
  deleteOwnedFile,
  purgePrefixPaged,
  type StorageBucketLike,
  type StorageFileLike,
} from "./storagePurge";
import { deleteAuthUserIdempotent } from "./authDelete";
import { isObjectOwnedByUser } from "./userOwnedStoragePaths";

function testJobLease() {
  const now = 1_000_000;
  const job = initialDeletionJob({
    uid: "u1",
    requestedAt: now - 20 * 24 * 60 * 60 * 1000,
    graceExpiresAt: now - 1000,
    now,
  });
  assert.equal(shouldPromoteToReady(job, now), true);
  const ready = { ...job, status: "ready" as const };
  assert.equal(canAcquireLease(ready, now), true);
  const leased = {
    ...ready,
    status: "leased" as const,
    leaseUntil: now + 10_000,
    leaseOwner: "w1",
  };
  assert.equal(canAcquireLease(leased, now), false);
  const expired = { ...leased, leaseUntil: now - 1 };
  assert.equal(canAcquireLease(expired, now), true);
  assert.equal(canAcquireLease({ ...ready, status: "cancelled" }, now), false);
  assert.equal(canAcquireLease({ ...ready, status: "completed" }, now), false);
}

function testPhases() {
  assert.equal(allPhasesDone(EMPTY_PHASES), false);
  assert.equal(
    allPhasesDone({
      storage: "done",
      firestore: "done",
      indexes: "done",
      auth: "done",
    }),
    true
  );
}

function testClassify() {
  assert.equal(classifyProviderError(new Error("reactivated")).category, "cancelled");
  assert.equal(
    classifyProviderError(new Error("storage_path_not_owned_by_user")).category,
    "permanent"
  );
  assert.equal(classifyProviderError(new Error("timeout")).category, "transient");
}

function mockBucket(initialNames: string[]): StorageBucketLike {
  let names = [...initialNames];
  return {
    async getFiles({ prefix, maxResults }) {
      const filtered = names.filter((n) => n.startsWith(prefix));
      const slice = filtered.slice(0, maxResults);
      const files: StorageFileLike[] = slice.map((name) => ({
        name,
        delete: async () => {
          names = names.filter((n) => n !== name);
        },
      }));
      const more = filtered.length > maxResults;
      return [files, undefined, more ? { pageToken: "more" } : {}];
    },
  };
}

async function testStoragePurgePagination() {
  const uid = "u1";
  const names = Array.from({ length: 5 }, (_, i) => `users/u1/letterhead/f${i}.png`);
  const bucket = mockBucket(names);
  const result = await purgePrefixPaged(bucket, uid, "users/u1/letterhead/", {
    pageSize: 2,
    maxPages: 10,
  });
  assert.equal(result.exhausted, true);
  assert.ok(result.pages >= 3);
  assert.equal(result.deleted, 5);
}

async function testAlreadyMissing() {
  const file: StorageFileLike = {
    name: "users/u1/letterhead/gone.png",
    delete: async () => {
      const e = new Error("No such object: gone.png");
      throw e;
    },
  };
  assert.equal(await deleteOwnedFile("u1", file), "missing");
}

async function testCrossUserBlocked() {
  const file: StorageFileLike = {
    name: "users/other/letterhead/x.png",
    delete: async () => {
      throw new Error("should not delete");
    },
  };
  const outcome = await deleteOwnedFile("u1", file);
  assert.equal(outcome, "skipped_unowned");
  assert.equal(isObjectOwnedByUser("u1", file.name), false);
}

async function testAuthIdempotent() {
  const missing = {
    deleteUser: async () => {
      const e = new Error("There is no user record");
      (e as { code?: string }).code = "auth/user-not-found";
      throw e;
    },
  };
  assert.equal(await deleteAuthUserIdempotent(missing, "u1"), "already_absent");

  let deleted = false;
  const ok = {
    deleteUser: async () => {
      deleted = true;
    },
  };
  assert.equal(await deleteAuthUserIdempotent(ok, "u1"), "deleted");
  assert.equal(deleted, true);
}

async function main() {
  testJobLease();
  testPhases();
  testClassify();
  await testStoragePurgePagination();
  await testAlreadyMissing();
  await testCrossUserBlocked();
  await testAuthIdempotent();
  console.log("deletion.unit.test.ts: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
