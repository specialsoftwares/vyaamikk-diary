/**
 * INJECTED — GRIN cleanup lists, flag off by default, failure/retry/completion.
 * Does not change scheduledDeletionCleanup. DELETION_GRACE_MS stays 15 days.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  INCLUDE_GRIN_IN_ACCOUNT_PURGE,
  allGrinFirestoreCollectionIds,
  grinEvidenceStoragePrefix,
} from "./grinCleanupLists";
import {
  purgeGrinEvidenceIfEnabled,
  type GrinFirestoreLike,
} from "./grinCleanup";
import type { StorageBucketLike, StorageFileLike } from "./storagePurge";

const dir = dirname(fileURLToPath(import.meta.url));

assert.equal(INCLUDE_GRIN_IN_ACCOUNT_PURGE, false);
assert.ok(allGrinFirestoreCollectionIds().includes("goodsEvidenceLedgers"));
assert.equal(grinEvidenceStoragePrefix("u1"), "users/u1/grinEvidence/");

const finalPurgeSrc = readFileSync(join(dir, "finalPurge.ts"), "utf8");
assert.match(finalPurgeSrc, /DELETION_GRACE_MS = 15 \* 24 \* 60 \* 60 \* 1000/);
assert.match(finalPurgeSrc, /INCLUDE_GRIN_IN_ACCOUNT_PURGE/);
assert.doesNotMatch(finalPurgeSrc, /DELETION_GRACE_MS = 180/);

const lifecycleSrc = readFileSync(join(dir, "lifecycle.ts"), "utf8");
assert.match(lifecycleSrc, /scheduledDeletionCleanup/);
assert.doesNotMatch(lifecycleSrc, /INCLUDE_GRIN_IN_ACCOUNT_PURGE/);

function mockBucket(names: string[]): StorageBucketLike {
  let live = [...names];
  return {
    async getFiles({ prefix, maxResults }) {
      const filtered = live.filter((n) => n.startsWith(prefix));
      const slice = filtered.slice(0, maxResults);
      const files: StorageFileLike[] = slice.map((name) => ({
        name,
        delete: async () => {
          live = live.filter((n) => n !== name);
        },
      }));
      const more = filtered.length > maxResults;
      return [files, undefined, more ? { pageToken: "more" } : {}];
    },
  };
}

function mockFirestore(docs: Map<string, Set<string>>): GrinFirestoreLike {
  const store = new Map<string, Set<string>>();
  for (const [path, subs] of docs) store.set(path, new Set(subs));
  return {
    async listCollection(path) {
      const ids: { id: string; ref: { path: string } }[] = [];
      for (const key of store.keys()) {
        const prefix = `${path}/`;
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        if (!rest || rest.includes("/")) continue;
        ids.push({ id: rest, ref: { path: key } });
      }
      return ids;
    },
    async listSubcollections(docPath) {
      return [...(store.get(docPath) ?? [])];
    },
    async delete(path) {
      store.delete(path);
      for (const key of [...store.keys()]) {
        if (key.startsWith(`${path}/`)) store.delete(key);
      }
    },
  };
}

async function main(): Promise<void> {
  {
    const skipped = await purgeGrinEvidenceIfEnabled({
      uid: "u1",
      bucket: mockBucket(["users/u1/grinEvidence/obj/original"]),
      db: mockFirestore(new Map()),
    });
    assert.equal(skipped.attempted, false);
    assert.equal(skipped.detail, "grin_purge_disabled");
    assert.equal(skipped.completed, true);
  }

  {
    const files = ["users/u1/grinEvidence/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/original"];
    const bucket = mockBucket(files);
    const db = mockFirestore(
      new Map([
        ["users/u1/goodsEvidenceLedgers/led1", new Set(["receipts"])],
        ["users/u1/goodsEvidenceLedgers/led1/receipts/r1", new Set(["events"])],
        ["users/u1/goodsEvidenceLedgers/led1/receipts/r1/events/e1", new Set()],
      ])
    );
    const done = await purgeGrinEvidenceIfEnabled({
      uid: "u1",
      bucket,
      db,
      force: true,
    });
    assert.equal(done.attempted, true);
    assert.equal(done.completed, true);
    assert.equal(done.failed, false);
    assert.equal(done.detail, "grin_purge_completed");
    assert.equal(done.storageDeleted, 1);
    assert.ok(done.firestoreDeleted >= 1);
  }

  {
    const bucket: StorageBucketLike = {
      async getFiles() {
        throw new Error("timeout contacting storage");
      },
    };
    const failed = await purgeGrinEvidenceIfEnabled({
      uid: "u1",
      bucket,
      db: mockFirestore(new Map()),
      force: true,
    });
    assert.equal(failed.failed, true);
    assert.equal(failed.retryable, true);
    assert.equal(failed.completed, false);
  }

  {
    let deletes = 0;
    const db: GrinFirestoreLike = {
      async listCollection(path) {
        if (path === "users/u1/goodsEvidenceLedgers" && deletes < 1) {
          return [{ id: "led1", ref: { path: "users/u1/goodsEvidenceLedgers/led1" } }];
        }
        return [];
      },
      async listSubcollections() {
        return [];
      },
      async delete() {
        deletes += 1;
        throw new Error("unavailable firestore");
      },
    };
    const failed = await purgeGrinEvidenceIfEnabled({
      uid: "u1",
      bucket: mockBucket([]),
      db,
      force: true,
    });
    assert.equal(failed.failed, true);
    assert.equal(failed.retryable, true);
  }

  console.log("grinCleanup.unit.test.ts: ok (INJECTED)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
