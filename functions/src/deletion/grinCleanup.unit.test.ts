/**
 * INJECTED — GRIN cleanup lists, flag off by default, behavioral purge when force:true.
 * Not an operational deletion service. Does not change scheduledDeletionCleanup.
 * DELETION_GRACE_MS is 45 days (SUPERSEDES 15; not 180). INCLUDE_GRIN_IN_ACCOUNT_PURGE stays false.
 * P8 public deletion remains FAIL.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  INCLUDE_GRIN_IN_ACCOUNT_PURGE,
  GRIN_FIRESTORE_USER_COLLECTIONS,
  GRIN_KNOWN_NESTED_COLLECTION_IDS,
  allGrinFirestoreCollectionIds,
  describeGrinDeletionInventory,
  grinEvidenceStoragePrefix,
} from "./grinCleanupLists";
import {
  countGrinFirestoreDocs,
  purgeGrinEvidenceIfEnabled,
  type GrinFirestoreLike,
} from "./grinCleanup";
import type { StorageBucketLike, StorageFileLike } from "./storagePurge";
import { USER_SUBCOLLECTIONS } from "./firestorePurge";
import { USER_STORAGE_CATEGORIES } from "./userOwnedStoragePaths";

const dir = dirname(fileURLToPath(import.meta.url));

assert.equal(INCLUDE_GRIN_IN_ACCOUNT_PURGE, false);
assert.deepEqual([...GRIN_FIRESTORE_USER_COLLECTIONS], [
  "goodsEvidenceLedgers",
  "goodsEvidenceAdmission",
  "goodsEvidenceUploadControl",
  "grinEvidenceObjectKeys",
  "grinEvidenceDerivativeKeys",
  "goodsEvidenceStorage",
]);
assert.deepEqual([...GRIN_KNOWN_NESTED_COLLECTION_IDS], [
  "receipts",
  "commands",
  "serials",
  "evidenceObjects",
  "events",
  "evidenceLinks",
  "evidenceControl",
]);
assert.ok(allGrinFirestoreCollectionIds().includes("goodsEvidenceLedgers"));
assert.ok(allGrinFirestoreCollectionIds().includes("goodsEvidenceStorage"));
assert.equal(grinEvidenceStoragePrefix("u1"), "users/u1/grinEvidence/");
for (const col of GRIN_FIRESTORE_USER_COLLECTIONS) {
  assert.equal((USER_SUBCOLLECTIONS as readonly string[]).includes(col), false);
}
assert.equal((USER_STORAGE_CATEGORIES as readonly string[]).includes("grinEvidence"), false);

const inventory = describeGrinDeletionInventory("u1");
assert.ok(inventory.some((e) => e.path.includes("grinEvidence/") && e.kind === "storage_prefix"));
assert.ok(inventory.some((e) => e.path.includes("evidenceObjects")));
assert.ok(inventory.some((e) => e.notes.includes("reservations")));
assert.ok(inventory.some((e) => e.path.includes("goodsEvidenceStorage/accounting")));
assert.ok(inventory.some((e) => e.path.includes("grinEvidenceObjectKeys")));
assert.ok(inventory.some((e) => e.path.includes("grinEvidenceDerivativeKeys")));
assert.ok(inventory.some((e) => e.path.includes("goodsEvidenceUploadControl")));
assert.ok(inventory.some((e) => e.notes.includes("derivatives")));

const finalPurgeSrc = readFileSync(join(dir, "finalPurge.ts"), "utf8");
assert.match(finalPurgeSrc, /DELETION_GRACE_MS = 45 \* 24 \* 60 \* 60 \* 1000/);
assert.match(finalPurgeSrc, /INCLUDE_GRIN_IN_ACCOUNT_PURGE/);
assert.doesNotMatch(finalPurgeSrc, /DELETION_GRACE_MS = 180/);
assert.match(finalPurgeSrc, /if \(INCLUDE_GRIN_IN_ACCOUNT_PURGE\)/);
assert.match(finalPurgeSrc, /purgeAllUserOwnedStorage/);
assert.match(finalPurgeSrc, /purgeUserSubcollectionsFully/);
assert.match(finalPurgeSrc, /deleteAuthUserIdempotent/);

const identitySrc = readFileSync(join(dir, "../../../src/domain/identityLifecycle.ts"), "utf8");
assert.match(identitySrc, /DELETION_GRACE_DAYS = 45/);
assert.doesNotMatch(identitySrc, /DELETION_GRACE_DAYS = 180/);
assert.doesNotMatch(identitySrc, /DELETION_GRACE_DAYS = 15/);

const phoneSrc = readFileSync(join(dir, "../identity/resolveOrCreateUserByPhone.ts"), "utf8");
assert.match(phoneSrc, /DELETION_GRACE_MS = 45 \* 24 \* 60 \* 60 \* 1000/);
assert.doesNotMatch(phoneSrc, /DELETION_GRACE_MS = 180/);

assert.ok((USER_SUBCOLLECTIONS as readonly string[]).includes("entries"));
assert.ok((USER_STORAGE_CATEGORIES as readonly string[]).includes("letterhead"));

const lifecycleSrc = readFileSync(join(dir, "lifecycle.ts"), "utf8");
assert.match(lifecycleSrc, /scheduledDeletionCleanup/);
assert.doesNotMatch(lifecycleSrc, /INCLUDE_GRIN_IN_ACCOUNT_PURGE/);

function mockBucket(names: string[]): StorageBucketLike & { names: () => string[] } {
  let live = [...names];
  return {
    names: () => [...live],
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

type FsStore = {
  docs: Map<string, Set<string>>;
  listCollection: GrinFirestoreLike["listCollection"];
  listSubcollections: GrinFirestoreLike["listSubcollections"];
  delete: GrinFirestoreLike["delete"];
  paths: () => string[];
};

function mockFirestore(docs: Map<string, Set<string>>): FsStore {
  const store = new Map<string, Set<string>>();
  for (const [path, subs] of docs) store.set(path, new Set(subs));
  return {
    docs: store,
    paths: () => [...store.keys()].sort(),
    async listCollection(path) {
      const ids: { id: string; ref: { path: string } }[] = [];
      const prefix = `${path}/`;
      for (const key of store.keys()) {
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
    },
  };
}

function seedOwnerGrinTree(uid: string): Map<string, Set<string>> {
  const ledger = `users/${uid}/goodsEvidenceLedgers/led1`;
  const receipt = `${ledger}/receipts/r1`;
  return new Map<string, Set<string>>([
    [ledger, new Set(["receipts", "commands", "serials", "evidenceObjects"])],
    [`${ledger}/commands/cmd1`, new Set()],
    [`${ledger}/serials/fy26`, new Set()],
    [`${ledger}/evidenceObjects/ev1`, new Set()],
    [`${ledger}/evidenceObjects/ev_reserved`, new Set()],
    [receipt, new Set(["events", "evidenceLinks", "evidenceControl"])],
    [`${receipt}/events/e1`, new Set()],
    [`${receipt}/evidenceLinks/ev1`, new Set()],
    [`${receipt}/evidenceControl/runtime`, new Set()],
    [`users/${uid}/goodsEvidenceAdmission/runtime`, new Set()],
    [`users/${uid}/goodsEvidenceUploadControl/runtime`, new Set()],
    [`users/${uid}/grinEvidenceObjectKeys/objA`, new Set()],
    [`users/${uid}/grinEvidenceDerivativeKeys/derA`, new Set()],
    [`users/${uid}/goodsEvidenceStorage/accounting`, new Set()],
  ]);
}

function seedOwnerStorage(uid: string): string[] {
  return [
    `users/${uid}/grinEvidence/objA/original`,
    `users/${uid}/grinEvidence/objA/derivatives/derA`,
    `users/${uid}/grinEvidence/objReserved/original`,
  ];
}

async function main(): Promise<void> {
  {
    const files = [...seedOwnerStorage("u1"), ...seedOwnerStorage("u2")];
    const bucket = mockBucket(files);
    const db = mockFirestore(
      new Map([...seedOwnerGrinTree("u1"), ...seedOwnerGrinTree("u2")])
    );
    const skipped = await purgeGrinEvidenceIfEnabled({
      uid: "u1",
      bucket,
      db,
    });
    assert.equal(skipped.attempted, false);
    assert.equal(skipped.detail, "grin_purge_disabled");
    assert.equal(skipped.completed, true);
    assert.deepEqual(bucket.names().sort(), files.sort());
    assert.ok(db.paths().includes("users/u1/goodsEvidenceLedgers/led1"));
    assert.ok(db.paths().includes("users/u1/goodsEvidenceLedgers/led1/receipts/r1/events/e1"));
  }

  {
    const bucket = mockBucket([...seedOwnerStorage("u1"), ...seedOwnerStorage("u2")]);
    const db = mockFirestore(
      new Map([...seedOwnerGrinTree("u1"), ...seedOwnerGrinTree("u2")])
    );
    const beforeOther = db.paths().filter((p) => p.startsWith("users/u2/"));
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
    assert.equal(done.storageDeleted, 3);
    assert.equal(done.firestoreDeleted, seedOwnerGrinTree("u1").size);
    assert.equal(await countGrinFirestoreDocs(db, "u1"), 0);
    assert.deepEqual(
      bucket.names().sort(),
      seedOwnerStorage("u2").sort(),
      "other owner storage must remain"
    );
    assert.deepEqual(db.paths().filter((p) => p.startsWith("users/u2/")), beforeOther);
    assert.equal(
      db.paths().some((p) => p.startsWith("users/u1/goodsEvidence") || p.startsWith("users/u1/grinEvidence")),
      false,
      "u1 GRIN trees including nested children must be gone"
    );
  }

  {
    const bucket = mockBucket(seedOwnerStorage("u1"));
    const db = mockFirestore(seedOwnerGrinTree("u1"));
    const again = await purgeGrinEvidenceIfEnabled({
      uid: "u1",
      bucket,
      db,
      force: true,
    });
    assert.equal(again.completed, true);
    const idempotent = await purgeGrinEvidenceIfEnabled({
      uid: "u1",
      bucket,
      db,
      force: true,
    });
    assert.equal(idempotent.completed, true);
    assert.equal(idempotent.failed, false);
    assert.equal(idempotent.storageDeleted, 0);
    assert.equal(idempotent.firestoreDeleted, 0);
    assert.equal(await countGrinFirestoreDocs(db, "u1"), 0);
  }

  {
    const files = seedOwnerStorage("u1");
    let deletes = 0;
    const bucket: StorageBucketLike = {
      async getFiles({ prefix, maxResults }) {
        const filtered = files.filter((n) => n.startsWith(prefix));
        const slice = filtered.slice(0, maxResults);
        return [
          slice.map((name) => ({
            name,
            delete: async () => {
              deletes += 1;
              if (deletes === 1) throw new Error("timeout contacting storage");
              const idx = files.indexOf(name);
              if (idx >= 0) files.splice(idx, 1);
            },
          })),
          undefined,
          {},
        ];
      },
    };
    const db = mockFirestore(seedOwnerGrinTree("u1"));
    const failed = await purgeGrinEvidenceIfEnabled({
      uid: "u1",
      bucket,
      db,
      force: true,
    });
    assert.equal(failed.failed, true);
    assert.equal(failed.retryable, true);
    assert.equal(failed.completed, false);
    assert.ok(db.paths().includes("users/u1/goodsEvidenceLedgers/led1/receipts/r1/events/e1"));
    const retried = await purgeGrinEvidenceIfEnabled({
      uid: "u1",
      bucket,
      db,
      force: true,
    });
    assert.equal(retried.completed, true);
    assert.equal(retried.failed, false);
    assert.equal(await countGrinFirestoreDocs(db, "u1"), 0);
    assert.equal(files.length, 0);
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

  {
    const order: string[] = [];
    const seeded = seedOwnerGrinTree("u1");
    const db = mockFirestore(seeded);
    const wrapped: GrinFirestoreLike = {
      listCollection: (path) => db.listCollection(path),
      listSubcollections: (path) => db.listSubcollections(path),
      async delete(path) {
        order.push(path);
        await db.delete(path);
      },
    };
    await purgeGrinEvidenceIfEnabled({
      uid: "u1",
      bucket: mockBucket([]),
      db: wrapped,
      force: true,
    });
    const eventIdx = order.indexOf("users/u1/goodsEvidenceLedgers/led1/receipts/r1/events/e1");
    const receiptIdx = order.indexOf("users/u1/goodsEvidenceLedgers/led1/receipts/r1");
    const ledgerIdx = order.indexOf("users/u1/goodsEvidenceLedgers/led1");
    assert.ok(eventIdx >= 0 && receiptIdx >= 0 && ledgerIdx >= 0);
    assert.ok(eventIdx < receiptIdx, "event child must be deleted before receipt parent");
    assert.ok(receiptIdx < ledgerIdx, "receipt must be deleted before ledger parent");
    assert.equal(db.paths().some((p) => p.startsWith("users/u1/")), false);
  }

  console.log("grinCleanup.unit.test.ts: ok (INJECTED)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
