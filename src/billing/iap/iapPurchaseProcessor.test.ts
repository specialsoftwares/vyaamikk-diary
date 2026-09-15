/**
 * Purchase processor matrix: Android pending/purchased/ack, iOS JWS/finish order,
 * cancellation, restore, currentPlanId ignored.
 */
import assert from "node:assert/strict";

import { PENDING_PURCHASE_CACHE_KEY, writePendingPurchase } from "./iapPendingPurchase";
import {
  expectedCanonicalSkuHint,
  processPurchaseError,
  processStorePurchase,
  type PurchaseProcessorDeps,
} from "./iapPurchaseProcessor";
import type {
  IapBackend,
  IapKeyValueStore,
  IapNativeAdapter,
  NativePurchaseRequest,
  PendingPurchaseEnvelope,
  StorePurchase,
} from "./iapTypes";

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

function pending(uid = "uid-a"): PendingPurchaseEnvelope {
  return {
    version: 1,
    uid,
    platform: "android",
    canonicalSku: "vyd_professional_yearly",
    productId: "vyd_professional",
    androidBasePlanId: "yearly",
    stage: "intent_created",
    initiatedAt: 10,
    updatedAt: 10,
  };
}

function androidPurchase(extra: Partial<StorePurchase> = {}): StorePurchase {
  return {
    store: "google",
    productId: "vyd_professional",
    purchaseState: "purchased",
    purchaseToken: "play-token-1",
    currentPlanId: "monthly",
    isAcknowledgedAndroid: false,
    nativePurchase: { id: "native" },
    ...extra,
  };
}

function iosPurchase(extra: Partial<StorePurchase> = {}): StorePurchase {
  return {
    store: "apple",
    productId: "com.specialsoftwares.vyaamikkdiary.professional.yearly",
    purchaseState: "purchased",
    purchaseToken: "header.payload.signature",
    currentPlanId: "ignored",
    nativePurchase: { id: "native-ios" },
    ...extra,
  };
}

function fakeNative(spy: {
  finish: StorePurchase[];
  purchases: NativePurchaseRequest[];
}): IapNativeAdapter {
  return {
    async initConnection() {
      return true;
    },
    async endConnection() {},
    async fetchProducts() {
      return [];
    },
    async requestPurchase(req) {
      spy.purchases.push(req);
    },
    async getAvailablePurchases() {
      return [];
    },
    async finishTransactionIOS(purchase) {
      spy.finish.push(purchase);
    },
    addPurchaseUpdatedListener() {
      return () => {};
    },
    addPurchaseErrorListener() {
      return () => {};
    },
  };
}

function fakeBackend(spy: {
  android: { purchaseToken: string; expectedCanonicalSku?: string }[];
  ios: { signedTransactionInfo: string; expectedCanonicalSku?: string }[];
  androidShouldFail?: boolean;
  iosShouldFail?: boolean;
}): IapBackend {
  return {
    async prepareAndroidBillingAccount() {
      return { obfuscatedAccountId: "server-obf-1" };
    },
    async validateAndActivateAndroid(input) {
      spy.android.push(input);
      if (spy.androidShouldFail) throw new Error("backend");
      return {
        alreadyProcessed: spy.android.length > 1,
        acknowledged: true,
        entitlementActive: true,
      };
    },
    async prepareIOSBillingAccount() {
      return { appAccountToken: "11111111-1111-4111-8111-111111111111" };
    },
    async validateAndActivateIOS(input) {
      spy.ios.push(input);
      if (spy.iosShouldFail) throw new Error("backend");
      return { alreadyProcessed: spy.ios.length > 1, entitlementActive: true };
    },
  };
}

function deps(args: {
  platform: "android" | "ios";
  store: IapKeyValueStore;
  native: IapNativeAdapter;
  backend: IapBackend;
  uid?: string;
  gen?: { n: number };
  attempt?: { n: number | null };
  operationAttempt?: number | null;
}): PurchaseProcessorDeps {
  const gen = args.gen ?? { n: 1 };
  const uid = args.uid ?? "uid-a";
  return {
    native: args.native,
    backend: args.backend,
    store: args.store,
    platform: args.platform,
    now: () => 50,
    currentUid: () => uid,
    currentGeneration: () => gen.n,
    generation: 1,
    operationUid: uid,
    operationAttempt: args.operationAttempt,
    currentAttempt: args.attempt ? () => args.attempt!.n : undefined,
  };
}

async function seedPending(store: IapKeyValueStore, env: PendingPurchaseEnvelope) {
  const ok = await writePendingPurchase({
    store,
    envelope: env,
    expectedUid: env.uid,
    generation: 1,
    currentGeneration: () => 1,
    currentUid: () => env.uid,
  });
  assert.equal(ok, true);
}

function iosPending(uid = "uid-a"): PendingPurchaseEnvelope {
  return {
    version: 1,
    uid,
    platform: "ios",
    canonicalSku: "vyd_professional_yearly",
    productId: "com.specialsoftwares.vyaamikkdiary.professional.yearly",
    stage: "intent_created",
    initiatedAt: 10,
    updatedAt: 10,
  };
}

async function testAndroidPendingDoesNotValidate() {
  const store = memoryStore();
  const spy = {
    android: [] as { purchaseToken: string; expectedCanonicalSku?: string }[],
    ios: [] as { signedTransactionInfo: string; expectedCanonicalSku?: string }[],
    finish: [] as StorePurchase[],
    purchases: [] as NativePurchaseRequest[],
  };
  await seedPending(store, pending());
  const out = await processStorePurchase({
    deps: deps({
      platform: "android",
      store,
      native: fakeNative(spy),
      backend: fakeBackend(spy),
    }),
    purchase: androidPurchase({ purchaseState: "pending" }),
    pending: pending(),
    source: "purchase",
    processedTokens: new Set(),
  });
  assert.equal(out.result.kind, "store_pending");
  assert.equal(spy.android.length, 0);
  assert.equal(spy.finish.length, 0);
  assert.equal(out.pending?.stage, "store_pending");
  assert.ok(store.data[PENDING_PURCHASE_CACHE_KEY]);
}

async function testAndroidPurchasedSendsTokenNotCurrentPlan() {
  const store = memoryStore();
  const spy = {
    android: [] as { purchaseToken: string; expectedCanonicalSku?: string }[],
    ios: [] as { signedTransactionInfo: string; expectedCanonicalSku?: string }[],
    finish: [] as StorePurchase[],
    purchases: [] as NativePurchaseRequest[],
  };
  const p = pending();
  await seedPending(store, p);
  const purchase = androidPurchase({ currentPlanId: "monthly" });
  assert.equal(expectedCanonicalSkuHint(p, purchase), "vyd_professional_yearly");
  const out = await processStorePurchase({
    deps: deps({
      platform: "android",
      store,
      native: fakeNative(spy),
      backend: fakeBackend(spy),
    }),
    purchase,
    pending: p,
    source: "purchase",
    processedTokens: new Set(),
  });
  assert.equal(out.result.kind, "verified");
  assert.equal(spy.android.length, 1);
  assert.equal(spy.android[0].purchaseToken, "play-token-1");
  assert.equal(spy.android[0].expectedCanonicalSku, "vyd_professional_yearly");
  assert.equal(spy.finish.length, 0);
  assert.equal(store.data[PENDING_PURCHASE_CACHE_KEY], undefined);
}

async function testAndroidBackendFailureNoAck() {
  const store = memoryStore();
  const spy = {
    android: [] as { purchaseToken: string; expectedCanonicalSku?: string }[],
    ios: [],
    finish: [] as StorePurchase[],
    purchases: [],
    androidShouldFail: true,
  };
  await seedPending(store, pending());
  const out = await processStorePurchase({
    deps: deps({
      platform: "android",
      store,
      native: fakeNative(spy),
      backend: fakeBackend(spy),
    }),
    purchase: androidPurchase(),
    pending: pending(),
    source: "purchase",
    processedTokens: new Set(),
  });
  assert.equal(out.result.kind, "failed");
  assert.equal(spy.finish.length, 0);
  assert.equal(out.pending?.stage, "awaiting_recovery");
}

async function testIosValidateBeforeFinish() {
  const store = memoryStore();
  const order: string[] = [];
  const spy = {
    android: [],
    ios: [] as { signedTransactionInfo: string; expectedCanonicalSku?: string }[],
    finish: [] as StorePurchase[],
    purchases: [],
  };
  const backend = fakeBackend(spy);
  const native = fakeNative(spy);
  const wrapped: IapBackend = {
    ...backend,
    async validateAndActivateIOS(input) {
      order.push("validate");
      return backend.validateAndActivateIOS(input);
    },
  };
  const wrappedNative: IapNativeAdapter = {
    ...native,
    async finishTransactionIOS(purchase) {
      order.push("finish");
      return native.finishTransactionIOS(purchase);
    },
  };
  const env = iosPending();
  await seedPending(store, env);
  const out = await processStorePurchase({
    deps: deps({ platform: "ios", store, native: wrappedNative, backend: wrapped }),
    purchase: iosPurchase(),
    pending: env,
    source: "purchase",
    processedTokens: new Set(),
  });
  assert.equal(out.result.kind, "verified");
  assert.deepEqual(order, ["validate", "finish"]);
  assert.equal(spy.ios[0].signedTransactionInfo, "header.payload.signature");
  assert.doesNotMatch(JSON.stringify(store.data), /header\.payload\.signature/);
}

async function testIosValidationFailureDoesNotFinish() {
  const store = memoryStore();
  const spy = {
    android: [],
    ios: [] as { signedTransactionInfo: string; expectedCanonicalSku?: string }[],
    finish: [] as StorePurchase[],
    purchases: [],
    iosShouldFail: true,
  };
  const env = iosPending();
  await seedPending(store, env);
  const out = await processStorePurchase({
    deps: deps({
      platform: "ios",
      store,
      native: fakeNative(spy),
      backend: fakeBackend(spy),
    }),
    purchase: iosPurchase(),
    pending: env,
    source: "purchase",
    processedTokens: new Set(),
  });
  assert.equal(out.result.kind, "failed");
  assert.equal(spy.finish.length, 0);
}

async function testIosFinishFailureVerifiedUnfinished() {
  const store = memoryStore();
  const spy = {
    android: [],
    ios: [] as { signedTransactionInfo: string; expectedCanonicalSku?: string }[],
    finish: [] as StorePurchase[],
    purchases: [],
  };
  const native = fakeNative(spy);
  const failing: IapNativeAdapter = {
    ...native,
    async finishTransactionIOS() {
      throw new Error("finish failed");
    },
  };
  const env = iosPending();
  await seedPending(store, env);
  const out = await processStorePurchase({
    deps: deps({
      platform: "ios",
      store,
      native: failing,
      backend: fakeBackend(spy),
    }),
    purchase: iosPurchase(),
    pending: env,
    source: "purchase",
    processedTokens: new Set(),
  });
  assert.equal(out.result.kind, "verified_unfinished_ios");
  assert.equal(out.pending?.stage, "verified_unfinished_ios");
  assert.doesNotMatch(store.data[PENDING_PURCHASE_CACHE_KEY] ?? "", /header\.payload/);
}

async function testDuplicateAndroidIdempotent() {
  const store = memoryStore();
  const spy = {
    android: [] as { purchaseToken: string; expectedCanonicalSku?: string }[],
    ios: [],
    finish: [] as StorePurchase[],
    purchases: [],
  };
  const tokens = new Set<string>();
  const p = pending();
  await seedPending(store, p);
  const d = deps({
    platform: "android",
    store,
    native: fakeNative(spy),
    backend: fakeBackend(spy),
  });
  const first = await processStorePurchase({
    deps: d,
    purchase: androidPurchase(),
    pending: p,
    source: "purchase",
    processedTokens: tokens,
  });
  const second = await processStorePurchase({
    deps: d,
    purchase: androidPurchase(),
    pending: null,
    source: "purchase",
    processedTokens: tokens,
  });
  assert.equal(first.result.kind, "verified");
  assert.equal(second.result.kind, "verified");
  assert.equal(spy.android.length, 2);
  assert.equal(spy.finish.length, 0);
}

async function testUserCancelledClearsIntent() {
  const store = memoryStore();
  const spy = {
    android: [] as { purchaseToken: string; expectedCanonicalSku?: string }[],
    ios: [] as { signedTransactionInfo: string; expectedCanonicalSku?: string }[],
    finish: [] as StorePurchase[],
    purchases: [] as NativePurchaseRequest[],
  };
  await seedPending(store, pending());
  const out = await processPurchaseError({
    deps: deps({
      platform: "android",
      store,
      native: fakeNative(spy),
      backend: fakeBackend(spy),
    }),
    error: { code: "user-cancelled", message: "cancelled" },
    pending: pending(),
  });
  assert.equal(out.result.kind, "cancelled");
  assert.equal(store.data[PENDING_PURCHASE_CACHE_KEY], undefined);
}

async function testUserCancelledDoesNotClearStorePending() {
  const store = memoryStore();
  const spy = {
    android: [] as { purchaseToken: string; expectedCanonicalSku?: string }[],
    ios: [] as { signedTransactionInfo: string; expectedCanonicalSku?: string }[],
    finish: [] as StorePurchase[],
    purchases: [] as NativePurchaseRequest[],
  };
  const env = pending();
  env.stage = "store_pending";
  await seedPending(store, env);
  const out = await processPurchaseError({
    deps: deps({
      platform: "android",
      store,
      native: fakeNative(spy),
      backend: fakeBackend(spy),
    }),
    error: { code: "user-cancelled", message: "cancelled" },
    pending: env,
  });
  assert.equal(out.result.kind, "failed");
  assert.ok(store.data[PENDING_PURCHASE_CACHE_KEY]);
}

async function testRestoreAndroidValidatesWithoutBasePlan() {
  const store = memoryStore();
  const spy = {
    android: [] as { purchaseToken: string; expectedCanonicalSku?: string }[],
    ios: [],
    finish: [] as StorePurchase[],
    purchases: [],
  };
  const out = await processStorePurchase({
    deps: deps({
      platform: "android",
      store,
      native: fakeNative(spy),
      backend: fakeBackend(spy),
    }),
    purchase: androidPurchase({ currentPlanId: "quarterly" }),
    pending: null,
    source: "restore",
    processedTokens: new Set(),
  });
  assert.equal(out.result.kind, "verified");
  assert.equal(spy.android[0].purchaseToken, "play-token-1");
  assert.equal(spy.android[0].expectedCanonicalSku, undefined);
  assert.equal(spy.finish.length, 0);
}

async function testRestoreIosValidatesJwsWithoutGrantApi() {
  const store = memoryStore();
  const spy = {
    android: [],
    ios: [] as { signedTransactionInfo: string; expectedCanonicalSku?: string }[],
    finish: [] as StorePurchase[],
    purchases: [],
  };
  const out = await processStorePurchase({
    deps: deps({
      platform: "ios",
      store,
      native: fakeNative(spy),
      backend: fakeBackend(spy),
    }),
    purchase: iosPurchase(),
    pending: null,
    source: "restore",
    processedTokens: new Set(),
  });
  assert.equal(out.result.kind, "verified");
  assert.equal(spy.ios[0].signedTransactionInfo, "header.payload.signature");
  assert.equal(spy.finish.length, 0);
}

async function testDuplicateIosSuccessfulCallbackFinishesOnce() {
  const store = memoryStore();
  const spy = {
    android: [],
    ios: [] as { signedTransactionInfo: string; expectedCanonicalSku?: string }[],
    finish: [] as StorePurchase[],
    purchases: [],
  };
  const tokens = new Set<string>();
  const finished = new Set<string>();
  const env = iosPending();
  await seedPending(store, env);
  const d = deps({ platform: "ios", store, native: fakeNative(spy), backend: fakeBackend(spy) });
  const first = await processStorePurchase({
    deps: d,
    purchase: iosPurchase(),
    pending: env,
    source: "purchase",
    processedTokens: tokens,
    finishedIosTokens: finished,
  });
  const second = await processStorePurchase({
    deps: d,
    purchase: iosPurchase(),
    pending: null,
    source: "purchase",
    processedTokens: tokens,
    finishedIosTokens: finished,
  });
  assert.equal(first.result.kind, "verified");
  assert.equal(second.result.kind, "verified");
  assert.equal(spy.finish.length, 1);
  assert.equal(store.data[PENDING_PURCHASE_CACHE_KEY], undefined);
}

async function testVerifiedUnfinishedIosRetriesFinish() {
  const store = memoryStore();
  const spy = {
    android: [],
    ios: [] as { signedTransactionInfo: string; expectedCanonicalSku?: string }[],
    finish: [] as StorePurchase[],
    purchases: [],
  };
  let shouldFailFinish = true;
  const native = fakeNative(spy);
  const wrapping: IapNativeAdapter = {
    ...native,
    async finishTransactionIOS(purchase) {
      if (shouldFailFinish) throw new Error("finish failed");
      return native.finishTransactionIOS(purchase);
    },
  };
  const env = iosPending();
  await seedPending(store, env);
  const tokens = new Set<string>();
  const finished = new Set<string>();
  const d = deps({ platform: "ios", store, native: wrapping, backend: fakeBackend(spy) });
  const first = await processStorePurchase({
    deps: d,
    purchase: iosPurchase(),
    pending: env,
    source: "purchase",
    processedTokens: tokens,
    finishedIosTokens: finished,
  });
  assert.equal(first.result.kind, "verified_unfinished_ios");
  assert.equal(first.pending?.stage, "verified_unfinished_ios");
  assert.equal(spy.ios.length, 1);
  shouldFailFinish = false;
  const second = await processStorePurchase({
    deps: d,
    purchase: iosPurchase(),
    pending: first.pending,
    source: "purchase",
    processedTokens: tokens,
    finishedIosTokens: finished,
  });
  assert.equal(second.result.kind, "verified");
  assert.equal(second.pending, null);
  assert.equal(spy.ios.length, 1);
  assert.equal(spy.finish.length, 1);
}

async function testSuccessfulFinishDuplicateCannotCreatePhantomUnfinished() {
  const store = memoryStore();
  const spy = {
    android: [],
    ios: [] as { signedTransactionInfo: string; expectedCanonicalSku?: string }[],
    finish: [] as StorePurchase[],
    purchases: [],
  };
  const native = fakeNative(spy);
  const wrapping: IapNativeAdapter = {
    ...native,
    async finishTransactionIOS(purchase) {
      if (spy.finish.length >= 1) throw new Error("second finish must not run");
      return native.finishTransactionIOS(purchase);
    },
  };
  const env = iosPending();
  await seedPending(store, env);
  const tokens = new Set<string>();
  const finished = new Set<string>();
  const d = deps({ platform: "ios", store, native: wrapping, backend: fakeBackend(spy) });
  const first = await processStorePurchase({
    deps: d,
    purchase: iosPurchase(),
    pending: env,
    source: "purchase",
    processedTokens: tokens,
    finishedIosTokens: finished,
  });
  assert.equal(first.result.kind, "verified");
  const second = await processStorePurchase({
    deps: d,
    purchase: iosPurchase(),
    pending: null,
    source: "purchase",
    processedTokens: tokens,
    finishedIosTokens: finished,
  });
  assert.equal(second.result.kind, "verified");
  assert.equal(second.pending, null);
  assert.equal(spy.finish.length, 1);
  assert.notEqual(second.result.kind, "verified_unfinished_ios");
  assert.equal(store.data[PENDING_PURCHASE_CACHE_KEY], undefined);
}

async function testIosFinishedTokenDoesNotClearUnrelatedPending() {
  const store = memoryStore();
  const spy = {
    android: [],
    ios: [] as { signedTransactionInfo: string; expectedCanonicalSku?: string }[],
    finish: [] as StorePurchase[],
    purchases: [],
  };
  const finished = new Set<string>(["header.payload.signature"]);
  const bPending: PendingPurchaseEnvelope = {
    version: 1,
    uid: "uid-b",
    platform: "ios",
    canonicalSku: "vyd_starter_monthly",
    productId: "com.specialsoftwares.vyaamikkdiary.starter.monthly",
    stage: "intent_created",
    initiatedAt: 10,
    updatedAt: 10,
  };
  await seedPending(store, bPending);
  const live = { uid: "uid-b", gen: 2 };
  const d = deps({
    platform: "ios",
    store,
    native: fakeNative(spy),
    backend: fakeBackend(spy),
    uid: "uid-b",
  });
  const out = await processStorePurchase({
    deps: {
      ...d,
      currentUid: () => live.uid,
      currentGeneration: () => live.gen,
      generation: 2,
      operationUid: "uid-b",
    },
    purchase: iosPurchase(),
    pending: bPending,
    source: "purchase",
    processedTokens: new Set(),
    finishedIosTokens: finished,
  });
  assert.equal(out.result.kind, "failed");
  assert.equal(out.pending?.uid, "uid-b");
  assert.equal(out.pending?.canonicalSku, "vyd_starter_monthly");
  assert.ok(store.data[PENDING_PURCHASE_CACHE_KEY]);
  assert.equal(spy.finish.length, 0);
  assert.equal(spy.ios.length, 0);
}

async function testUnrelatedPurchasedDoesNotMutatePending() {
  const store = memoryStore();
  const env = pending();
  await seedPending(store, env);
  const spy = {
    android: [] as { purchaseToken: string; expectedCanonicalSku?: string }[],
    ios: [] as { signedTransactionInfo: string; expectedCanonicalSku?: string }[],
  };
  const nativeSpy = { finish: [] as StorePurchase[], purchases: [] as NativePurchaseRequest[] };
  const out = await processStorePurchase({
    deps: deps({
      platform: "android",
      store,
      native: fakeNative(nativeSpy),
      backend: fakeBackend(spy),
    }),
    purchase: androidPurchase({ productId: "vyd_starter", purchaseToken: "starter-token" }),
    pending: env,
    source: "purchase",
    processedTokens: new Set(),
  });
  assert.equal(out.result.kind, "failed");
  if (out.result.kind === "failed") assert.equal(out.result.message, "Product mismatch.");
  assert.equal(out.pending?.stage, "intent_created");
  assert.equal(out.pending?.productId, "vyd_professional");
  assert.equal(spy.android.length, 0);
  assert.ok(store.data[PENDING_PURCHASE_CACHE_KEY]);
}

async function testUnrelatedPendingAndUnknownDoNotPatchProcessor() {
  const store = memoryStore();
  const env = pending();
  await seedPending(store, env);
  const spy = {
    android: [] as { purchaseToken: string; expectedCanonicalSku?: string }[],
    ios: [] as { signedTransactionInfo: string; expectedCanonicalSku?: string }[],
  };
  const nativeSpy = { finish: [] as StorePurchase[], purchases: [] as NativePurchaseRequest[] };
  const pendingOut = await processStorePurchase({
    deps: deps({
      platform: "android",
      store,
      native: fakeNative(nativeSpy),
      backend: fakeBackend(spy),
    }),
    purchase: androidPurchase({
      productId: "vyd_starter",
      purchaseState: "pending",
      purchaseToken: "starter-pending",
    }),
    pending: env,
    source: "purchase",
    processedTokens: new Set(),
  });
  assert.equal(pendingOut.pending?.stage, "intent_created");
  const unknownOut = await processStorePurchase({
    deps: deps({
      platform: "android",
      store,
      native: fakeNative(nativeSpy),
      backend: fakeBackend(spy),
    }),
    purchase: androidPurchase({
      productId: "vyd_starter",
      purchaseState: "unknown",
      purchaseToken: "starter-unknown",
    }),
    pending: env,
    source: "purchase",
    processedTokens: new Set(),
  });
  assert.equal(unknownOut.pending?.stage, "intent_created");
  assert.equal(JSON.parse(store.data[PENDING_PURCHASE_CACHE_KEY]!).stage, "intent_created");
}

async function testRestoreUnrelatedPurchasedDoesNotClearPending() {
  const store = memoryStore();
  const env = pending();
  await seedPending(store, env);
  const spy = {
    android: [] as { purchaseToken: string; expectedCanonicalSku?: string }[],
    ios: [] as { signedTransactionInfo: string; expectedCanonicalSku?: string }[],
  };
  const nativeSpy = { finish: [] as StorePurchase[], purchases: [] as NativePurchaseRequest[] };
  const out = await processStorePurchase({
    deps: deps({
      platform: "android",
      store,
      native: fakeNative(nativeSpy),
      backend: fakeBackend(spy),
    }),
    purchase: androidPurchase({ productId: "vyd_starter", purchaseToken: "starter-token" }),
    pending: env,
    source: "restore",
    processedTokens: new Set(),
  });
  assert.equal(out.result.kind, "verified");
  assert.equal(out.pending?.canonicalSku, "vyd_professional_yearly");
  assert.equal(out.pending?.stage, "intent_created");
  assert.equal(spy.android.length, 1);
  assert.equal(spy.android[0]?.purchaseToken, "starter-token");
  assert.ok(store.data[PENDING_PURCHASE_CACHE_KEY]);
}

async function testMismatchedProductErrorDoesNotClearPending() {
  const store = memoryStore();
  const env = pending();
  await seedPending(store, env);
  const spy = {
    android: [] as { purchaseToken: string; expectedCanonicalSku?: string }[],
    ios: [] as { signedTransactionInfo: string; expectedCanonicalSku?: string }[],
  };
  const nativeSpy = { finish: [] as StorePurchase[], purchases: [] as NativePurchaseRequest[] };
  const out = await processPurchaseError({
    deps: deps({
      platform: "android",
      store,
      native: fakeNative(nativeSpy),
      backend: fakeBackend(spy),
    }),
    error: {
      code: "billing-unavailable",
      message: "other sku failed",
      productId: "vyd_starter",
    },
    pending: env,
  });
  assert.equal(out.result.kind, "failed");
  assert.equal(out.pending?.stage, "intent_created");
  assert.ok(store.data[PENDING_PURCHASE_CACHE_KEY]);
}

async function testRetiredAttemptValidationDoesNotClearNewerEnvelope() {
  const store = memoryStore();
  const envA = pending();
  await seedPending(store, envA);
  const attempt = { n: 1 as number | null };
  const g = {
    release: () => {},
    wait: Promise.resolve(),
  };
  let started = () => {};
  const startedP = new Promise<void>((resolve) => {
    started = resolve;
  });
  let resolveWait = () => {};
  g.wait = new Promise<void>((resolve) => {
    resolveWait = resolve;
  });
  const spy = {
    android: [] as { purchaseToken: string; expectedCanonicalSku?: string }[],
    ios: [] as { signedTransactionInfo: string; expectedCanonicalSku?: string }[],
  };
  const backend = fakeBackend(spy);
  const orig = backend.validateAndActivateAndroid;
  backend.validateAndActivateAndroid = async (input) => {
    started();
    await g.wait;
    return orig.call(backend, input);
  };
  const nativeSpy = { finish: [] as StorePurchase[], purchases: [] as NativePurchaseRequest[] };
  const run = processStorePurchase({
    deps: deps({
      platform: "android",
      store,
      native: fakeNative(nativeSpy),
      backend,
      attempt,
      operationAttempt: 1,
    }),
    purchase: androidPurchase(),
    pending: envA,
    source: "purchase",
    processedTokens: new Set(),
  });
  await startedP;
  attempt.n = 2;
  const envB: PendingPurchaseEnvelope = {
    ...pending(),
    canonicalSku: "vyd_professional_monthly",
    androidBasePlanId: "monthly",
    initiatedAt: 40,
    updatedAt: 40,
  };
  await seedPending(store, envB);
  resolveWait();
  const out = await run;
  assert.equal(out.pending?.canonicalSku, "vyd_professional_yearly");
  const disk = JSON.parse(store.data[PENDING_PURCHASE_CACHE_KEY]!);
  assert.equal(disk.canonicalSku, "vyd_professional_monthly");
}

async function testRetiredAttemptValidationFailureDoesNotPatchNewerEnvelope() {
  const store = memoryStore();
  const envA = pending();
  await seedPending(store, envA);
  const attempt = { n: 1 as number | null };
  let resolveWait = () => {};
  const wait = new Promise<void>((resolve) => {
    resolveWait = resolve;
  });
  let started = () => {};
  const startedP = new Promise<void>((resolve) => {
    started = resolve;
  });
  const spy = {
    android: [] as { purchaseToken: string; expectedCanonicalSku?: string }[],
    ios: [] as { signedTransactionInfo: string; expectedCanonicalSku?: string }[],
  };
  const backend = fakeBackend(spy);
  backend.validateAndActivateAndroid = async () => {
    started();
    await wait;
    throw new Error("backend down");
  };
  const nativeSpy = { finish: [] as StorePurchase[], purchases: [] as NativePurchaseRequest[] };
  const run = processStorePurchase({
    deps: deps({
      platform: "android",
      store,
      native: fakeNative(nativeSpy),
      backend,
      attempt,
      operationAttempt: 1,
    }),
    purchase: androidPurchase(),
    pending: envA,
    source: "purchase",
    processedTokens: new Set(),
  });
  await startedP;
  attempt.n = 2;
  const envB: PendingPurchaseEnvelope = {
    ...pending(),
    canonicalSku: "vyd_professional_monthly",
    androidBasePlanId: "monthly",
    initiatedAt: 40,
    updatedAt: 40,
  };
  await seedPending(store, envB);
  resolveWait();
  await run;
  const disk = JSON.parse(store.data[PENDING_PURCHASE_CACHE_KEY]!);
  assert.equal(disk.canonicalSku, "vyd_professional_monthly");
  assert.equal(disk.stage, "intent_created");
}

async function main() {
  await testAndroidPendingDoesNotValidate();
  await testAndroidPurchasedSendsTokenNotCurrentPlan();
  await testAndroidBackendFailureNoAck();
  await testIosValidateBeforeFinish();
  await testIosValidationFailureDoesNotFinish();
  await testIosFinishFailureVerifiedUnfinished();
  await testDuplicateAndroidIdempotent();
  await testUserCancelledClearsIntent();
  await testUserCancelledDoesNotClearStorePending();
  await testRestoreAndroidValidatesWithoutBasePlan();
  await testRestoreIosValidatesJwsWithoutGrantApi();
  await testDuplicateIosSuccessfulCallbackFinishesOnce();
  await testVerifiedUnfinishedIosRetriesFinish();
  await testSuccessfulFinishDuplicateCannotCreatePhantomUnfinished();
  await testIosFinishedTokenDoesNotClearUnrelatedPending();
  await testUnrelatedPurchasedDoesNotMutatePending();
  await testUnrelatedPendingAndUnknownDoNotPatchProcessor();
  await testRestoreUnrelatedPurchasedDoesNotClearPending();
  await testMismatchedProductErrorDoesNotClearPending();
  await testRetiredAttemptValidationDoesNotClearNewerEnvelope();
  await testRetiredAttemptValidationFailureDoesNotPatchNewerEnvelope();
  console.log("iapPurchaseProcessor.test.ts: ok");
}

main();
