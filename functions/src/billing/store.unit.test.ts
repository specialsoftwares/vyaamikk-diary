/**
 * MemoryBillingStore must be Firestore-strict (never more permissive).
 * Run: npm run test:billing-store
 */

import assert from "node:assert/strict";

import { AlreadyExistsError, MemoryBillingStore, ReadAfterWriteError } from "./store";

async function main() {
  // get() after any staged write throws (reads must precede writes).
  {
    const store = new MemoryBillingStore();
    await assert.rejects(
      store.runTransaction(async (tx) => {
        tx.set("a/1", { v: 1 });
        await tx.get("b/1");
      }),
      ReadAfterWriteError
    );
    assert.equal(store.docs.size, 0); // failed txn leaves zero writes
  }
  {
    const store = new MemoryBillingStore();
    await assert.rejects(
      store.runTransaction(async (tx) => {
        tx.create("a/1", { v: 1 });
        await tx.get("a/1");
      }),
      ReadAfterWriteError
    );
    assert.equal(store.docs.size, 0);
  }

  // create collision is validated before ANY queued mutation is applied.
  {
    const store = new MemoryBillingStore();
    store.docs.set("dup/1", { original: true });
    await assert.rejects(
      store.runTransaction(async (tx) => {
        tx.set("other/1", { v: 1 });
        tx.create("dup/1", { forged: true });
      }),
      AlreadyExistsError
    );
    assert.equal(store.docs.get("dup/1")?.original, true);
    assert.equal(store.docs.has("other/1"), false); // atomic: nothing applied
  }

  // duplicate pending creates to the same path fail atomically.
  {
    const store = new MemoryBillingStore();
    await assert.rejects(
      store.runTransaction(async (tx) => {
        tx.create("x/1", { a: 1 });
        tx.create("x/1", { b: 2 });
      }),
      AlreadyExistsError
    );
    assert.equal(store.docs.size, 0);
  }

  // fn throwing mid-transaction leaves zero writes.
  {
    const store = new MemoryBillingStore();
    await assert.rejects(
      store.runTransaction(async (tx) => {
        tx.set("y/1", { v: 1 });
        tx.create("y/2", { v: 2 });
        throw new Error("boom");
      }),
      /boom/
    );
    assert.equal(store.docs.size, 0);
  }

  // happy path: reads then writes commit together.
  {
    const store = new MemoryBillingStore();
    store.docs.set("r/1", { n: 1 });
    await store.runTransaction(async (tx) => {
      const snap = await tx.get("r/1");
      const n = Number(snap.data()?.n ?? 0);
      tx.set("r/1", { n: n + 1 });
      tx.create("r/2", { n });
    });
    assert.equal(store.docs.get("r/1")?.n, 2);
    assert.equal(store.docs.get("r/2")?.n, 1);
  }

  console.log("store.unit.test.ts: ok");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
