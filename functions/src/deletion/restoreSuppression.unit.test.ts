import assert from "node:assert/strict";

import { suppressCompletedRestorations } from "./restoreSuppression";

function jobs(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `user-${String(index).padStart(3, "0")}`,
    policyVersion: index % 2 === 0 ? 2 : 1,
    status: "active",
  }));
}

async function run(pageSize: number, maxPages: number, count = 41) {
  const rows = jobs(count);
  const state = new Map(rows.map((row) => [row.id, row.status]));
  let cursor: string | null = null;
  const storage: string[] = [];
  const grin: string[] = [];
  const firestore: string[] = [];
  const result = await suppressCompletedRestorations({
    now: 10,
    pageSize,
    maxPages,
    readCursor: async () => cursor,
    writeCursor: async (next) => {
      cursor = next;
    },
    listCompleted: async (after, limit) => {
      const start = after ? rows.findIndex((row) => row.id === after) + 1 : 0;
      return rows.slice(start, start + limit).map((row) => ({
        id: row.id,
        policyVersion: row.policyVersion,
      }));
    },
    readUserStatus: async (uid) => state.get(uid) ?? null,
    markDeleted: async (uid) => {
      state.set(uid, "deleted");
    },
    purgeFirestore: async (uid) => {
      firestore.push(uid);
      return { exhausted: true };
    },
    purgeStorage: async (uid) => {
      storage.push(uid);
      return { verifiedEmpty: true };
    },
    purgeGrin: async (uid) => {
      grin.push(uid);
      return { completed: true };
    },
    noteIncomplete: async () => undefined,
  });
  return { result, cursor, storage, grin, firestore, state };
}

async function main() {
let orphanPurges = 0;
await suppressCompletedRestorations({ now: 1, pageSize: 40, maxPages: 1,
  readCursor: async () => null, writeCursor: async () => {},
  listCompleted: async () => [{ id: "orphan", policyVersion: 2 }],
  readUserStatus: async () => null, markDeleted: async () => {},
  purgeFirestore: async () => { orphanPurges++; return { exhausted: true }; },
  purgeStorage: async () => { orphanPurges++; return { verifiedEmpty: true }; },
  purgeGrin: async (_uid, policy) => { assert.equal(policy, 2); orphanPurges++; return { completed: true }; },
  noteIncomplete: async () => { throw new Error("unexpected"); },
});
assert.equal(orphanPurges, 3, "missing parent still requires all owned-data purges");
const first = await run(40, 1);
assert.equal(first.result.processed, 40);
assert.equal(first.storage.length, 40);
assert.equal(first.grin.length, 40);
assert.equal(first.firestore.length, 40);
assert.equal(first.cursor, "user-039");
assert.equal(first.state.get("user-040"), "active");

const second = await run(40, 2);
assert.equal(second.result.processed, 41);
assert.equal(second.storage.length, 41);
assert.equal(second.grin.includes("user-040"), true);
assert.equal(second.state.get("user-040"), "deleted");
assert.equal(second.cursor, null);

const interrupted = await suppressCompletedRestorations({
  now: 10,
  pageSize: 40,
  maxPages: 1,
  readCursor: async () => "user-039",
  writeCursor: async () => undefined,
  listCompleted: async (after, limit) => {
    const rows = jobs(41);
    const start = after ? rows.findIndex((row) => row.id === after) + 1 : 0;
    return rows.slice(start, start + limit);
  },
  readUserStatus: async () => "deleted",
  markDeleted: async () => {
    throw new Error("reactivated account was purged");
  },
  purgeFirestore: async () => ({ exhausted: false }),
  purgeStorage: async () => ({ verifiedEmpty: false }),
  purgeGrin: async () => ({ completed: false }),
  noteIncomplete: async (uid) => {
    assert.equal(uid, "user-040");
  },
});
assert.equal(interrupted.processed, 1);
assert.equal(interrupted.incomplete, 1);
assert.equal(interrupted.suppressed, 0);

console.log("restoreSuppression.unit.test.ts: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
