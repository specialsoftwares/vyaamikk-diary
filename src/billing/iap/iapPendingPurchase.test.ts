/**
 * Pending cache uid isolation, secret rejection, generation races,
 * serialized mutations, and exact canonical SKU schema.
 */
import assert from "node:assert/strict";

import {
  PENDING_PURCHASE_CACHE_KEY,
  authStillOwnsAttempt,
  clearPendingPurchaseIfEnvelope,
  clearPendingPurchaseIfUid,
  parsePendingPurchaseEnvelope,
  readPendingPurchase,
  reconcilePendingPurchaseForUid,
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

function authFor(
  uid: string,
  generation: number,
  live: { uid: string | null; gen: number }
) {
  return {
    expectedUid: uid,
    generation,
    currentGeneration: () => live.gen,
    currentUid: () => live.uid,
  };
}

function createDeferredStore(opts: {
  blockSet?: boolean;
  blockRemove?: boolean;
  blockSetIf?: (value: string) => boolean;
} = {}): IapKeyValueStore & {
  data: Record<string, string>;
  setItemStarts: number;
  removeItemStarts: number;
  waitForSetItem: () => Promise<void>;
  waitForRemoveItem: () => Promise<void>;
  releaseSetItem: () => void;
  releaseRemoveItem: () => void;
} {
  const blockSet = opts.blockSet === true;
  const blockRemove = opts.blockRemove === true;
  const blockSetIf = opts.blockSetIf;
  const data: Record<string, string> = {};
  let setStarted: () => void = () => {};
  let removeStarted: () => void = () => {};
  const setStartedP = new Promise<void>((resolve) => {
    setStarted = resolve;
  });
  const removeStartedP = new Promise<void>((resolve) => {
    removeStarted = resolve;
  });
  let releaseSet: () => void = () => {};
  let releaseRemove: () => void = () => {};
  const setGate = new Promise<void>((resolve) => {
    releaseSet = resolve;
  });
  const removeGate = new Promise<void>((resolve) => {
    releaseRemove = resolve;
  });
  let firstSet = true;
  let firstRemove = true;
  let blockedSetIf = false;
  return {
    data,
    setItemStarts: 0,
    removeItemStarts: 0,
    waitForSetItem: () => setStartedP,
    waitForRemoveItem: () => removeStartedP,
    releaseSetItem: () => releaseSet(),
    releaseRemoveItem: () => releaseRemove(),
    async getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    async setItem(key, value) {
      this.setItemStarts += 1;
      const matchSetIf = Boolean(blockSetIf && !blockedSetIf && blockSetIf(value));
      if ((blockSet && firstSet) || matchSetIf) {
        firstSet = false;
        if (matchSetIf) blockedSetIf = true;
        setStarted();
        await setGate;
      }
      data[key] = value;
    },
    async removeItem(key) {
      this.removeItemStarts += 1;
      if (blockRemove && firstRemove) {
        firstRemove = false;
        removeStarted();
        await removeGate;
      }
      delete data[key];
    },
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

function testRejectsMalformedCanonicalSku() {
  assert.equal(
    parsePendingPurchaseEnvelope({
      ...envelope("uid-a"),
      canonicalSku: "vyd_fake_monthly",
    }),
    null
  );
  assert.equal(
    parsePendingPurchaseEnvelope({
      ...envelope("uid-a"),
      canonicalSku: "vyd_professional_yearly",
      productId: "vyd_starter",
    }),
    null
  );
  assert.equal(
    parsePendingPurchaseEnvelope({
      ...envelope("uid-a"),
      canonicalSku: "vyd_professional_yearly",
      productId: "vyd_professional",
      androidBasePlanId: "monthly",
    }),
    null
  );
  assert.equal(
    parsePendingPurchaseEnvelope({
      version: 1,
      uid: "uid-a",
      platform: "ios",
      canonicalSku: "vyd_professional_yearly",
      productId: "com.specialsoftwares.vyaamikkdiary.professional.yearly",
      androidBasePlanId: "yearly",
      stage: "intent_created",
      initiatedAt: 1,
      updatedAt: 1,
    }),
    null
  );
  assert.equal(
    parsePendingPurchaseEnvelope({
      version: 1,
      uid: "uid-a",
      platform: "android",
      canonicalSku: "vyd_professional_yearly",
      productId: "com.specialsoftwares.vyaamikkdiary.professional.yearly",
      androidBasePlanId: "yearly",
      stage: "intent_created",
      initiatedAt: 1,
      updatedAt: 1,
    }),
    null
  );
}

function testUidADoesNotSurfaceToB() {
  return (async () => {
    const store = memoryStore();
    const live = { uid: "uid-a" as string | null, gen: 1 };
    const ok = await writePendingPurchase({
      store,
      envelope: envelope("uid-a"),
      ...authFor("uid-a", 1, live),
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
    const live = { uid: "uid-a" as string | null, gen: 1 };
    await writePendingPurchase({
      store,
      envelope: envelope("uid-a"),
      ...authFor("uid-a", 1, live),
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
    const live = { uid: "uid-b" as string | null, gen: 1 };
    await writePendingPurchase({
      store,
      envelope: envelope("uid-b", {
        canonicalSku: "vyd_starter_monthly",
        productId: "vyd_starter",
        androidBasePlanId: "monthly",
      }),
      ...authFor("uid-b", 1, live),
    });
    live.gen = 2;
    const late = await writePendingPurchase({
      store,
      envelope: envelope("uid-a"),
      expectedUid: "uid-a",
      generation: 1,
      currentGeneration: () => live.gen,
      currentUid: () => live.uid,
    });
    assert.equal(late, false);
    const current = await readPendingPurchase({ store, uid: "uid-b" });
    assert.equal(current?.uid, "uid-b");
    assert.equal(current?.canonicalSku, "vyd_starter_monthly");
  })();
}

async function testDeferredAWriteCannotOverwriteB() {
  const store = createDeferredStore({ blockSet: true });
  const live = { uid: "uid-a" as string | null, gen: 1 };
  const writeA = writePendingPurchase({
    store,
    envelope: envelope("uid-a"),
    ...authFor("uid-a", 1, live),
  });
  await store.waitForSetItem();
  live.uid = "uid-b";
  live.gen = 2;
  const wroteB = await writePendingPurchase({
    store,
    envelope: envelope("uid-b", {
      canonicalSku: "vyd_starter_monthly",
      productId: "vyd_starter",
      androidBasePlanId: "monthly",
    }),
    ...authFor("uid-b", 2, live),
  });
  assert.equal(wroteB, true);
  store.releaseSetItem();
  const lateA = await writeA;
  assert.equal(lateA, false);
  const forB = await readPendingPurchase({ store, uid: "uid-b" });
  assert.equal(forB?.uid, "uid-b");
  assert.equal(forB?.canonicalSku, "vyd_starter_monthly");
  assert.equal(await readPendingPurchase({ store, uid: "uid-a" }), null);
}

async function testLateAClearCannotDeleteB() {
  const store = createDeferredStore({ blockRemove: true });
  const live = { uid: "uid-a" as string | null, gen: 1 };
  store.data[PENDING_PURCHASE_CACHE_KEY] = JSON.stringify(envelope("uid-a"));
  const clearA = clearPendingPurchaseIfUid(store, "uid-a", authFor("uid-a", 1, live));
  await store.waitForRemoveItem();
  live.uid = "uid-b";
  live.gen = 2;
  const wroteB = await writePendingPurchase({
    store,
    envelope: envelope("uid-b", {
      canonicalSku: "vyd_starter_monthly",
      productId: "vyd_starter",
      androidBasePlanId: "monthly",
    }),
    ...authFor("uid-b", 2, live),
  });
  assert.equal(wroteB, true);
  store.releaseRemoveItem();
  await clearA;
  const forB = await readPendingPurchase({ store, uid: "uid-b" });
  assert.equal(forB?.uid, "uid-b");
}

async function testReconcileClearsOrphanedDifferentUid() {
  const store = memoryStore();
  store.data[PENDING_PURCHASE_CACHE_KEY] = JSON.stringify(envelope("uid-a"));
  const live = { uid: "uid-b" as string | null, gen: 1 };
  const forB = await reconcilePendingPurchaseForUid({
    store,
    ...authFor("uid-b", 1, live),
  });
  assert.equal(forB, null);
  assert.equal(await readPendingPurchase({ store, uid: "uid-a" }), null);
  const wrote = await writePendingPurchase({
    store,
    envelope: envelope("uid-b", {
      canonicalSku: "vyd_starter_monthly",
      productId: "vyd_starter",
      androidBasePlanId: "monthly",
    }),
    ...authFor("uid-b", 1, live),
  });
  assert.equal(wrote, true);
}

async function testSameSessionRetiredWriteDoesNotOverwriteNewerEnvelope() {
  const store = memoryStore();
  const live = { uid: "uid-a" as string | null, gen: 1, attempt: 1 as number | null };
  const wroteA = await writePendingPurchase({
    store,
    envelope: envelope("uid-a", { initiatedAt: 101, updatedAt: 101 }),
    ...authFor("uid-a", 1, live),
    expectedAttempt: 1,
    currentAttempt: () => live.attempt,
  });
  assert.equal(wroteA, true);
  live.attempt = 2;
  const wroteB = await writePendingPurchase({
    store,
    envelope: envelope("uid-a", {
      canonicalSku: "vyd_professional_monthly",
      androidBasePlanId: "monthly",
      initiatedAt: 101,
      updatedAt: 101,
    }),
    ...authFor("uid-a", 1, live),
    expectedAttempt: 2,
    currentAttempt: () => live.attempt,
  });
  assert.equal(wroteB, true);
  const lateA = await writePendingPurchase({
    store,
    envelope: envelope("uid-a", {
      stage: "verifying",
      initiatedAt: 101,
      updatedAt: 199,
    }),
    ...authFor("uid-a", 1, live),
    expectedAttempt: 1,
    currentAttempt: () => live.attempt,
  });
  assert.equal(lateA, false);
  const current = await readPendingPurchase({ store, uid: "uid-a" });
  assert.equal(current?.canonicalSku, "vyd_professional_monthly");
  assert.equal(current?.stage, "intent_created");
}

async function testRetiredEnvelopeClearDoesNotDeleteNewerIntent() {
  const store = memoryStore();
  const live = { uid: "uid-a" as string | null, gen: 1, attempt: 1 as number | null };
  const envA = envelope("uid-a", { initiatedAt: 101, updatedAt: 101 });
  await writePendingPurchase({
    store,
    envelope: envA,
    ...authFor("uid-a", 1, live),
    expectedAttempt: 1,
    currentAttempt: () => live.attempt,
  });
  live.attempt = 2;
  const envB = envelope("uid-a", {
    canonicalSku: "vyd_professional_monthly",
    androidBasePlanId: "monthly",
    initiatedAt: 104,
    updatedAt: 104,
  });
  await writePendingPurchase({
    store,
    envelope: envB,
    ...authFor("uid-a", 1, live),
    expectedAttempt: 2,
    currentAttempt: () => live.attempt,
  });
  await clearPendingPurchaseIfEnvelope({
    store,
    envelope: envA,
    onlyNonDurable: true,
    ...authFor("uid-a", 1, live),
    expectedAttempt: 1,
    currentAttempt: () => live.attempt,
  });
  const current = await readPendingPurchase({ store, uid: "uid-a" });
  assert.equal(current?.canonicalSku, "vyd_professional_monthly");
  assert.equal(current?.initiatedAt, 104);
}

async function testDurableEnvelopeSurvivesRetiredClear() {
  const store = memoryStore();
  const live = { uid: "uid-a" as string | null, gen: 1, attempt: null as number | null };
  const unfinished: PendingPurchaseEnvelope = {
    version: 1,
    uid: "uid-a",
    platform: "ios",
    canonicalSku: "vyd_professional_yearly",
    productId: "com.specialsoftwares.vyaamikkdiary.professional.yearly",
    stage: "verified_unfinished_ios",
    initiatedAt: 10,
    updatedAt: 20,
  };
  await writePendingPurchase({
    store,
    envelope: unfinished,
    ...authFor("uid-a", 1, live),
  });
  live.attempt = 2;
  await clearPendingPurchaseIfEnvelope({
    store,
    envelope: unfinished,
    onlyNonDurable: true,
    ...authFor("uid-a", 1, live),
    expectedAttempt: 1,
    currentAttempt: () => live.attempt,
  });
  const current = await readPendingPurchase({ store, uid: "uid-a" });
  assert.equal(current?.stage, "verified_unfinished_ios");
}

async function testDeferredSameSessionWriteDoesNotOverwriteNewerIntent() {
  const store = createDeferredStore({ blockSet: true });
  const live = { uid: "uid-a" as string | null, gen: 1, attempt: 1 as number | null };
  const writeA = writePendingPurchase({
    store,
    envelope: envelope("uid-a", { initiatedAt: 101, updatedAt: 101 }),
    ...authFor("uid-a", 1, live),
    expectedAttempt: 1,
    currentAttempt: () => live.attempt,
  });
  await store.waitForSetItem();
  live.attempt = 2;
  const wroteB = await writePendingPurchase({
    store,
    envelope: envelope("uid-a", {
      canonicalSku: "vyd_professional_monthly",
      androidBasePlanId: "monthly",
      initiatedAt: 104,
      updatedAt: 104,
    }),
    ...authFor("uid-a", 1, live),
    expectedAttempt: 2,
    currentAttempt: () => live.attempt,
  });
  assert.equal(wroteB, true);
  store.releaseSetItem();
  const lateA = await writeA;
  assert.equal(lateA, false);
  const current = await readPendingPurchase({ store, uid: "uid-a" });
  assert.equal(current?.canonicalSku, "vyd_professional_monthly");
  assert.equal(current?.initiatedAt, 104);
}

async function testDeferredSameSessionClearDoesNotDeleteNewerIntent() {
  const store = createDeferredStore({ blockRemove: true });
  const live = { uid: "uid-a" as string | null, gen: 1, attempt: 1 as number | null };
  const envA = envelope("uid-a", { initiatedAt: 101, updatedAt: 101 });
  store.data[PENDING_PURCHASE_CACHE_KEY] = JSON.stringify(envA);
  const clearA = clearPendingPurchaseIfEnvelope({
    store,
    envelope: envA,
    onlyNonDurable: true,
    ...authFor("uid-a", 1, live),
    expectedAttempt: 1,
    currentAttempt: () => live.attempt,
  });
  await store.waitForRemoveItem();
  live.attempt = 2;
  const wroteB = await writePendingPurchase({
    store,
    envelope: envelope("uid-a", {
      canonicalSku: "vyd_professional_monthly",
      androidBasePlanId: "monthly",
      initiatedAt: 104,
      updatedAt: 104,
    }),
    ...authFor("uid-a", 1, live),
    expectedAttempt: 2,
    currentAttempt: () => live.attempt,
  });
  assert.equal(wroteB, true);
  store.releaseRemoveItem();
  await clearA;
  const current = await readPendingPurchase({ store, uid: "uid-a" });
  assert.equal(current?.canonicalSku, "vyd_professional_monthly");
  assert.equal(current?.initiatedAt, 104);
}

function monthlyEnvelope(initiatedAt: number, extra: Partial<PendingPurchaseEnvelope> = {}) {
  return envelope("uid-a", {
    canonicalSku: "vyd_professional_monthly",
    androidBasePlanId: "monthly",
    initiatedAt,
    updatedAt: initiatedAt,
    ...extra,
  });
}

async function testThreeOpDeferredVerifyingWriteRetiredCompensationKeepsB() {
  // Reproduced: delayed A verifying write, B accepted write, retired A
  // compensation, then A’s write completes. Disk must keep B.
  const store = createDeferredStore({
    blockSetIf: (value) => JSON.parse(value).stage === "verifying",
  });
  const live = { uid: "uid-a" as string | null, gen: 1, attempt: 1 as number | null };
  const envA = envelope("uid-a", { initiatedAt: 101, updatedAt: 101 });
  await writePendingPurchase({
    store,
    envelope: envA,
    ...authFor("uid-a", 1, live),
    expectedAttempt: 1,
    currentAttempt: () => live.attempt,
  });
  const writeVerifyingA = writePendingPurchase({
    store,
    envelope: envelope("uid-a", { stage: "verifying", initiatedAt: 101, updatedAt: 199 }),
    ...authFor("uid-a", 1, live),
    expectedAttempt: 1,
    currentAttempt: () => live.attempt,
  });
  await store.waitForSetItem();
  await clearPendingPurchaseIfEnvelope({
    store,
    envelope: envA,
    onlyNonDurable: true,
    ...authFor("uid-a", 1, live),
    expectedAttempt: 1,
    currentAttempt: () => live.attempt,
  });
  live.attempt = 2;
  const wroteB = await writePendingPurchase({
    store,
    envelope: monthlyEnvelope(104),
    ...authFor("uid-a", 1, live),
    expectedAttempt: 2,
    currentAttempt: () => live.attempt,
  });
  assert.equal(wroteB, true);
  await clearPendingPurchaseIfEnvelope({
    store,
    envelope: envA,
    onlyNonDurable: true,
    ...authFor("uid-a", 1, live),
    expectedAttempt: 1,
    currentAttempt: () => live.attempt,
  });
  store.releaseSetItem();
  const lateA = await writeVerifyingA;
  assert.equal(lateA, false);
  const current = await readPendingPurchase({ store, uid: "uid-a" });
  assert.equal(current?.canonicalSku, "vyd_professional_monthly");
  assert.equal(current?.stage, "intent_created");
  assert.equal(current?.initiatedAt, 104);
  assert.equal(JSON.parse(store.data[PENDING_PURCHASE_CACHE_KEY]!).initiatedAt, 104);
}

async function testDeferredOldRemoveWithInterveningRetiredCleanupDoesNotDeleteB() {
  // Preventive: delayed A remove plus a retired cleanup must not delete B.
  const store = createDeferredStore({ blockRemove: true });
  const live = { uid: "uid-a" as string | null, gen: 1, attempt: 1 as number | null };
  const envA = envelope("uid-a", { initiatedAt: 101, updatedAt: 101 });
  store.data[PENDING_PURCHASE_CACHE_KEY] = JSON.stringify(envA);
  const clearA = clearPendingPurchaseIfEnvelope({
    store,
    envelope: envA,
    onlyNonDurable: true,
    ...authFor("uid-a", 1, live),
    expectedAttempt: 1,
    currentAttempt: () => live.attempt,
  });
  await store.waitForRemoveItem();
  live.attempt = 2;
  const wroteB = await writePendingPurchase({
    store,
    envelope: monthlyEnvelope(104),
    ...authFor("uid-a", 1, live),
    expectedAttempt: 2,
    currentAttempt: () => live.attempt,
  });
  assert.equal(wroteB, true);
  await clearPendingPurchaseIfEnvelope({
    store,
    envelope: envA,
    onlyNonDurable: true,
    ...authFor("uid-a", 1, live),
    expectedAttempt: 1,
    currentAttempt: () => live.attempt,
  });
  store.releaseRemoveItem();
  await clearA;
  const current = await readPendingPurchase({ store, uid: "uid-a" });
  assert.equal(current?.canonicalSku, "vyd_professional_monthly");
  assert.equal(current?.initiatedAt, 104);
  assert.equal(JSON.parse(store.data[PENDING_PURCHASE_CACHE_KEY]!).canonicalSku, "vyd_professional_monthly");
}

async function testAcceptedDurableWriteSurvivesAfterOwnerReleasesAttempt() {
  // Reproduced: B’s store_pending write remains after B releases and A’s
  // delayed write completes. Cache must not require B’s attempt to stay live.
  const store = createDeferredStore({ blockSet: true });
  const live = { uid: "uid-a" as string | null, gen: 1, attempt: 1 as number | null };
  const writeA = writePendingPurchase({
    store,
    envelope: envelope("uid-a", { initiatedAt: 101, updatedAt: 101 }),
    ...authFor("uid-a", 1, live),
    expectedAttempt: 1,
    currentAttempt: () => live.attempt,
  });
  await store.waitForSetItem();
  live.attempt = 2;
  const wroteB = await writePendingPurchase({
    store,
    envelope: monthlyEnvelope(104, { stage: "store_pending" }),
    ...authFor("uid-a", 1, live),
    expectedAttempt: 2,
    currentAttempt: () => live.attempt,
  });
  assert.equal(wroteB, true);
  live.attempt = null;
  store.releaseSetItem();
  const lateA = await writeA;
  assert.equal(lateA, false);
  const current = await readPendingPurchase({ store, uid: "uid-a" });
  assert.equal(current?.canonicalSku, "vyd_professional_monthly");
  assert.equal(current?.stage, "store_pending");
  assert.equal(current?.initiatedAt, 104);
  assert.equal(JSON.parse(store.data[PENDING_PURCHASE_CACHE_KEY]!).stage, "store_pending");
}

async function testCompletedClearSurvivesOldWriteAfterOwnerFinished() {
  // Preventive: B’s accepted empty/cancelled state stays empty after old I/O.
  const store = createDeferredStore({ blockSet: true });
  const live = { uid: "uid-a" as string | null, gen: 1, attempt: 1 as number | null };
  const envA = envelope("uid-a", { initiatedAt: 101, updatedAt: 101 });
  const writeA = writePendingPurchase({
    store,
    envelope: envA,
    ...authFor("uid-a", 1, live),
    expectedAttempt: 1,
    currentAttempt: () => live.attempt,
  });
  await store.waitForSetItem();
  live.attempt = 2;
  const envB = monthlyEnvelope(104);
  await writePendingPurchase({
    store,
    envelope: envB,
    ...authFor("uid-a", 1, live),
    expectedAttempt: 2,
    currentAttempt: () => live.attempt,
  });
  await clearPendingPurchaseIfEnvelope({
    store,
    envelope: envB,
    onlyNonDurable: true,
    ...authFor("uid-a", 1, live),
    expectedAttempt: 2,
    currentAttempt: () => live.attempt,
  });
  assert.equal(store.data[PENDING_PURCHASE_CACHE_KEY], undefined);
  live.attempt = null;
  store.releaseSetItem();
  await writeA;
  assert.equal(store.data[PENDING_PURCHASE_CACHE_KEY], undefined);
  assert.equal(persistedEnvelope(store), undefined);
  assert.equal(await readPendingPurchase({ store, uid: "uid-a" }), null);
}

function persistedEnvelope(store: { data: Record<string, string> }): unknown {
  const raw = store.data[PENDING_PURCHASE_CACHE_KEY];
  return raw ? JSON.parse(raw) : undefined;
}

function attemptAuth(
  uid: string,
  generation: number,
  live: { uid: string | null; gen: number; attempt: number | null }
) {
  return {
    ...authFor(uid, generation, live),
    expectedAttempt: live.attempt,
    currentAttempt: () => live.attempt,
  };
}

function iosMonthlyUnfinished(initiatedAt: number): PendingPurchaseEnvelope {
  return {
    version: 1,
    uid: "uid-a",
    platform: "ios",
    canonicalSku: "vyd_professional_monthly",
    productId: "com.specialsoftwares.vyaamikkdiary.professional.monthly",
    stage: "verified_unfinished_ios",
    initiatedAt,
    updatedAt: initiatedAt,
  };
}

async function testMismatchedEnvelopeClearDoesNotDeleteMonthly() {
  // Reproduced at cache level: live-authorized clear of Yearly/101 must not
  // delete accepted Monthly/104. Product/UID similarity is not identity.
  const store = memoryStore();
  const live = { uid: "uid-a" as string | null, gen: 1, attempt: 2 as number | null };
  const monthly = monthlyEnvelope(104);
  const yearly = envelope("uid-a", { initiatedAt: 101, updatedAt: 101 });
  const wrote = await writePendingPurchase({
    store,
    envelope: monthly,
    ...attemptAuth("uid-a", 1, live),
  });
  assert.equal(wrote, true);
  await clearPendingPurchaseIfEnvelope({
    store,
    envelope: yearly,
    onlyNonDurable: true,
    ...attemptAuth("uid-a", 1, live),
  });
  assert.deepEqual(persistedEnvelope(store), monthly);
  assert.deepEqual(await readPendingPurchase({ store, uid: "uid-a" }), monthly);
  // Plant Yearly on disk. If the clear replaced accepted state with empty,
  // another Yearly clear would delete it. Monthly's accepted set must restore.
  store.data[PENDING_PURCHASE_CACHE_KEY] = JSON.stringify(yearly);
  await clearPendingPurchaseIfEnvelope({
    store,
    envelope: yearly,
    onlyNonDurable: true,
    ...attemptAuth("uid-a", 1, live),
  });
  assert.deepEqual(persistedEnvelope(store), monthly);
}

async function testColdStartMismatchedEnvelopeClearDoesNotDeleteDiskMonthly() {
  // Preventive/cold-start: no in-memory accepted set exists yet.
  const store = memoryStore();
  const live = { uid: "uid-a" as string | null, gen: 1, attempt: 2 as number | null };
  const monthly = monthlyEnvelope(104);
  const yearly = envelope("uid-a", { initiatedAt: 101, updatedAt: 101 });
  store.data[PENDING_PURCHASE_CACHE_KEY] = JSON.stringify(monthly);
  await clearPendingPurchaseIfEnvelope({
    store,
    envelope: yearly,
    onlyNonDurable: true,
    ...attemptAuth("uid-a", 1, live),
  });
  assert.deepEqual(persistedEnvelope(store), monthly);
}

async function testDurableAndroidNoOpClearThenDelayedOldWriteKeepsB() {
  // Reproduced at cache level: onlyNonDurable clear of live B store_pending
  // must not replace accepted B. After A's delayed write, B remains.
  const store = createDeferredStore({ blockSet: true });
  const live = { uid: "uid-a" as string | null, gen: 1, attempt: 1 as number | null };
  const envA = envelope("uid-a", { initiatedAt: 101, updatedAt: 101 });
  const envB = monthlyEnvelope(104, { stage: "store_pending" });
  const writeA = writePendingPurchase({
    store,
    envelope: envA,
    ...attemptAuth("uid-a", 1, live),
  });
  await store.waitForSetItem();
  live.attempt = 2;
  const wroteB = await writePendingPurchase({
    store,
    envelope: envB,
    ...attemptAuth("uid-a", 1, live),
  });
  assert.equal(wroteB, true);
  assert.deepEqual(persistedEnvelope(store), envB);
  await clearPendingPurchaseIfEnvelope({
    store,
    envelope: envB,
    onlyNonDurable: true,
    ...attemptAuth("uid-a", 1, live),
  });
  assert.deepEqual(persistedEnvelope(store), envB);
  store.releaseSetItem();
  const lateA = await writeA;
  assert.equal(lateA, false);
  assert.deepEqual(persistedEnvelope(store), envB);
  assert.equal((persistedEnvelope(store) as PendingPurchaseEnvelope).stage, "store_pending");
  assert.equal((persistedEnvelope(store) as PendingPurchaseEnvelope).initiatedAt, 104);
  assert.equal((persistedEnvelope(store) as PendingPurchaseEnvelope).updatedAt, 104);
}

async function testDurableIosNoOpClearThenDelayedOldWriteKeepsB() {
  const store = createDeferredStore({ blockSet: true });
  const live = { uid: "uid-a" as string | null, gen: 1, attempt: 1 as number | null };
  const envA = envelope("uid-a", { initiatedAt: 101, updatedAt: 101 });
  const envB = iosMonthlyUnfinished(104);
  const writeA = writePendingPurchase({
    store,
    envelope: envA,
    ...attemptAuth("uid-a", 1, live),
  });
  await store.waitForSetItem();
  live.attempt = 2;
  const wroteB = await writePendingPurchase({
    store,
    envelope: envB,
    ...attemptAuth("uid-a", 1, live),
  });
  assert.equal(wroteB, true);
  await clearPendingPurchaseIfEnvelope({
    store,
    envelope: envB,
    onlyNonDurable: true,
    ...attemptAuth("uid-a", 1, live),
  });
  store.releaseSetItem();
  await writeA;
  assert.deepEqual(persistedEnvelope(store), envB);
  assert.equal((persistedEnvelope(store) as PendingPurchaseEnvelope).stage, "verified_unfinished_ios");
}

async function testDelayedRemoveCannotEraseDurableNoOpPreservedB() {
  const store = createDeferredStore({ blockRemove: true });
  const live = { uid: "uid-a" as string | null, gen: 1, attempt: 1 as number | null };
  const envA = envelope("uid-a", { initiatedAt: 101, updatedAt: 101 });
  store.data[PENDING_PURCHASE_CACHE_KEY] = JSON.stringify(envA);
  const clearA = clearPendingPurchaseIfEnvelope({
    store,
    envelope: envA,
    onlyNonDurable: true,
    ...attemptAuth("uid-a", 1, live),
  });
  await store.waitForRemoveItem();
  live.attempt = 2;
  const envB = monthlyEnvelope(104, { stage: "store_pending" });
  const wroteB = await writePendingPurchase({
    store,
    envelope: envB,
    ...attemptAuth("uid-a", 1, live),
  });
  assert.equal(wroteB, true);
  await clearPendingPurchaseIfEnvelope({
    store,
    envelope: envB,
    onlyNonDurable: true,
    ...attemptAuth("uid-a", 1, live),
  });
  store.releaseRemoveItem();
  await clearA;
  assert.deepEqual(persistedEnvelope(store), envB);
}

async function testDelayedRemoveCannotEraseMismatchedClearPreservedB() {
  const store = createDeferredStore({ blockRemove: true });
  const live = { uid: "uid-a" as string | null, gen: 1, attempt: 1 as number | null };
  const envA = envelope("uid-a", { initiatedAt: 101, updatedAt: 101 });
  store.data[PENDING_PURCHASE_CACHE_KEY] = JSON.stringify(envA);
  const clearA = clearPendingPurchaseIfEnvelope({
    store,
    envelope: envA,
    onlyNonDurable: true,
    ...attemptAuth("uid-a", 1, live),
  });
  await store.waitForRemoveItem();
  live.attempt = 2;
  const envB = monthlyEnvelope(104);
  const wroteB = await writePendingPurchase({
    store,
    envelope: envB,
    ...attemptAuth("uid-a", 1, live),
  });
  assert.equal(wroteB, true);
  await clearPendingPurchaseIfEnvelope({
    store,
    envelope: envA,
    onlyNonDurable: true,
    ...attemptAuth("uid-a", 1, live),
  });
  store.releaseRemoveItem();
  await clearA;
  assert.deepEqual(persistedEnvelope(store), envB);
}

async function testIdleRevisionAndAttemptGuardsAgree() {
  // Storage authorization must treat “captured while idle” as bound to the
  // session operation revision, not as unrestricted access.
  const live = {
    uid: "uid-a" as string | null,
    gen: 1,
    attempt: null as number | null,
    revision: 1,
  };
  const idleAuth = {
    ...authFor("uid-a", 1, live),
    expectedAttempt: null,
    currentAttempt: () => live.attempt,
    expectedRevision: 1,
    currentRevision: () => live.revision,
  };
  assert.equal(authStillOwnsAttempt(idleAuth), true);
  live.revision = 2;
  live.attempt = 2;
  assert.equal(authStillOwnsAttempt(idleAuth), false);
  live.attempt = null;
  assert.equal(authStillOwnsAttempt(idleAuth), false);
  const store = memoryStore();
  const wrote = await writePendingPurchase({
    store,
    envelope: envelope("uid-a", { initiatedAt: 101, updatedAt: 101 }),
    ...idleAuth,
  });
  assert.equal(wrote, false);
  assert.equal(store.data[PENDING_PURCHASE_CACHE_KEY], undefined);
}

async function main() {
  testExactKey();
  testRejectsSecrets();
  testRejectsMalformedCanonicalSku();
  await testUidADoesNotSurfaceToB();
  await testLogoutClearsOwnUidOnly();
  await testLateAWriteCannotOverwriteB();
  await testDeferredAWriteCannotOverwriteB();
  await testLateAClearCannotDeleteB();
  await testReconcileClearsOrphanedDifferentUid();
  await testSameSessionRetiredWriteDoesNotOverwriteNewerEnvelope();
  await testRetiredEnvelopeClearDoesNotDeleteNewerIntent();
  await testDurableEnvelopeSurvivesRetiredClear();
  await testDeferredSameSessionWriteDoesNotOverwriteNewerIntent();
  await testDeferredSameSessionClearDoesNotDeleteNewerIntent();
  await testThreeOpDeferredVerifyingWriteRetiredCompensationKeepsB();
  await testDeferredOldRemoveWithInterveningRetiredCleanupDoesNotDeleteB();
  await testAcceptedDurableWriteSurvivesAfterOwnerReleasesAttempt();
  await testCompletedClearSurvivesOldWriteAfterOwnerFinished();
  await testMismatchedEnvelopeClearDoesNotDeleteMonthly();
  await testColdStartMismatchedEnvelopeClearDoesNotDeleteDiskMonthly();
  await testDurableAndroidNoOpClearThenDelayedOldWriteKeepsB();
  await testDurableIosNoOpClearThenDelayedOldWriteKeepsB();
  await testDelayedRemoveCannotEraseDurableNoOpPreservedB();
  await testDelayedRemoveCannotEraseMismatchedClearPreservedB();
  await testIdleRevisionAndAttemptGuardsAgree();
  console.log("iapPendingPurchase.test.ts: ok");
}

main();
