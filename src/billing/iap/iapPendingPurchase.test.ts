/**
 * Pending cache uid isolation, secret rejection, generation races.
 */
import assert from "node:assert/strict";

import {
  PENDING_PURCHASE_CACHE_KEY,
  clearPendingPurchaseIfUid,
  parsePendingPurchaseEnvelope,
  readPendingPurchase,
  writePendingPurchase,
} from "./iapPendingPurchase";
import type { IapKeyValueStore, PendingPurchaseEnvelope } from "./iapTypes";

function memoryStore(seed: Record<string, string> = {}): IapKeyValueStore & {
  data: Record<string, string>;
} {
  const data = { ...seed };
  return {
    data,
    async getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    async setItem(key, value) {
      data[key] = value;
    },
    async removeItem(key) {
      delete data[key];
    },
  };
}

function envelope(uid: string, extra: Partial<PendingPurchaseEnvelope> = {}): PendingPurchaseEnvelope {
  return {
    version: 1,
    uid,
    platform: "android",
    canonicalSku: "vyd_professional_yearly",
    productId: "vyd_professional",
    androidBasePlanId: "yearly",
    stage: "intent_created",
    initiatedAt: 1,
    updatedAt: 1,
    ...extra,
  };
}

function testExactKey() {
  assert.equal(PENDING_PURCHASE_CACHE_KEY, "vyd_pending_purchase_v1");
}

function testRejectsSecrets() {
  const raw = {
    ...envelope("uid-a"),
    purchaseToken: "secret-token",
  };
  assert.equal(parsePendingPurchaseEnvelope(raw), null);
  assert.equal(
    parsePendingPurchaseEnvelope({ ...envelope("uid-a"), signedTransactionInfo: "jws" }),
    null
  );
  assert.equal(
    parsePendingPurchaseEnvelope({ ...envelope("uid-a"), appAccountToken: "uuid" }),
    null
  );
  assert.equal(
    parsePendingPurchaseEnvelope({ ...envelope("uid-a"), obfuscatedAccountId: "obf" }),
    null
  );
}

function testUidADoesNotSurfaceToB() {
  return (async () => {
    const store = memoryStore();
    let gen = 1;
    const ok = await writePendingPurchase({
      store,
      envelope: envelope("uid-a"),
      expectedUid: "uid-a",
      generation: 1,
      currentGeneration: () => gen,
    });
    assert.equal(ok, true);
    const forB = await readPendingPurchase({ store, uid: "uid-b" });
    assert.equal(forB, null);
    const forA = await readPendingPurchase({ store, uid: "uid-a" });
    assert.equal(forA?.uid, "uid-a");
  })();
}

function testLogoutClearsOwnUidOnly() {
  return (async () => {
    const store = memoryStore();
    let gen = 1;
    await writePendingPurchase({
      store,
      envelope: envelope("uid-a"),
      expectedUid: "uid-a",
      generation: 1,
      currentGeneration: () => gen,
    });
    await clearPendingPurchaseIfUid(store, "uid-b");
    assert.ok(await readPendingPurchase({ store, uid: "uid-a" }));
    await clearPendingPurchaseIfUid(store, "uid-a");
    assert.equal(await readPendingPurchase({ store, uid: "uid-a" }), null);
  })();
}

function testLateAWriteCannotOverwriteB() {
  return (async () => {
    const store = memoryStore();
    let gen = 1;
    await writePendingPurchase({
      store,
      envelope: envelope("uid-b", { canonicalSku: "vyd_starter_monthly", productId: "vyd_starter" }),
      expectedUid: "uid-b",
      generation: 1,
      currentGeneration: () => gen,
    });
    gen = 2;
    const late = await writePendingPurchase({
      store,
      envelope: envelope("uid-a"),
      expectedUid: "uid-a",
      generation: 1,
      currentGeneration: () => gen,
    });
    assert.equal(late, false);
    const current = await readPendingPurchase({ store, uid: "uid-b" });
    assert.equal(current?.uid, "uid-b");
    assert.equal(current?.canonicalSku, "vyd_starter_monthly");
  })();
}

async function main() {
  testExactKey();
  testRejectsSecrets();
  await testUidADoesNotSurfaceToB();
  await testLogoutClearsOwnUidOnly();
  await testLateAWriteCannotOverwriteB();
  console.log("iapPendingPurchase.test.ts: ok");
}

main();
