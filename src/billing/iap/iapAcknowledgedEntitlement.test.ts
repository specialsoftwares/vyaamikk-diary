/**
 * Acknowledged / entitlementActive end-to-end meaning for the authenticated owner.
 *
 * Cases:
 * 1. New purchase — acknowledged + entitlementActive → verified
 * 2. Already-acknowledged restore — alreadyProcessed + entitlementActive → verified
 * 3. Same-token renewal — second validate alreadyProcessed → verified (no double grant UX)
 * 4. Retry after lost response — awaiting_recovery then success → verified
 * 5. Pending / inactive purchase must not grant access
 */
import assert from "node:assert/strict";

import { processStorePurchase, type PurchaseProcessorDeps } from "./iapPurchaseProcessor";
import { PENDING_PURCHASE_CACHE_KEY, writePendingPurchase } from "./iapPendingPurchase";
import type {
  AndroidValidationResult,
  IapBackend,
  IapKeyValueStore,
  IapNativeAdapter,
  NativePurchaseRequest,
  PendingPurchaseEnvelope,
  StorePurchase,
} from "./iapTypes";

function memoryStore(): IapKeyValueStore & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    async getItem(key) {
      return data[key] ?? null;
    },
    async setItem(key, value) {
      data[key] = value;
    },
    async removeItem(key) {
      delete data[key];
    },
  };
}

function pending(over: Partial<PendingPurchaseEnvelope> = {}): PendingPurchaseEnvelope {
  return {
    version: 1,
    uid: "uid-a",
    platform: "android",
    canonicalSku: "vyd_unlimited_monthly",
    productId: "vyd_unlimited",
    androidBasePlanId: "monthly",
    stage: "intent_created",
    initiatedAt: 1,
    updatedAt: 1,
    ...over,
  };
}

function androidPurchase(over: Partial<StorePurchase> = {}): StorePurchase {
  return {
    store: "google",
    productId: "vyd_unlimited",
    purchaseState: "purchased",
    purchaseToken: "play-token-vc36-a",
    nativePurchase: { id: "order-1" },
    ...over,
  };
}

function fakeNative(): IapNativeAdapter {
  return {
    async initConnection() {
      return true;
    },
    async endConnection() {},
    async fetchProducts() {
      return [];
    },
    async requestPurchase(_request: NativePurchaseRequest) {},
    async getAvailablePurchases() {
      return [];
    },
    async finishTransactionIOS() {},
    addPurchaseUpdatedListener() {
      return () => {};
    },
    addPurchaseErrorListener() {
      return () => {};
    },
  };
}

function backendWith(
  respond: (input: {
    purchaseToken: string;
    expectedCanonicalSku?: string;
  }) => Promise<AndroidValidationResult>
): IapBackend {
  return {
    async prepareAndroidBillingAccount() {
      return { obfuscatedAccountId: "obf" };
    },
    async validateAndActivateAndroid(input) {
      return respond(input);
    },
    async prepareIOSBillingAccount() {
      return { appAccountToken: "11111111-1111-4111-8111-111111111111" };
    },
    async validateAndActivateIOS() {
      return { alreadyProcessed: false, entitlementActive: true };
    },
  };
}

function deps(args: {
  store: IapKeyValueStore;
  backend: IapBackend;
}): PurchaseProcessorDeps {
  return {
    native: fakeNative(),
    backend: args.backend,
    store: args.store,
    platform: "android",
    now: () => 50,
    currentUid: () => "uid-a",
    currentGeneration: () => 1,
    generation: 1,
    operationUid: "uid-a",
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

async function testNewPurchaseAcknowledgedVerified() {
  const store = memoryStore();
  const env = pending();
  await seedPending(store, env);
  const out = await processStorePurchase({
    deps: deps({
      store,
      backend: backendWith(async () => ({
        alreadyProcessed: false,
        acknowledged: true,
        entitlementActive: true,
        canonicalSku: "vyd_unlimited_monthly",
      })),
    }),
    purchase: androidPurchase(),
    pending: env,
    source: "purchase",
    processedTokens: new Set(),
  });
  assert.equal(out.result.kind, "verified");
  assert.equal(out.pending, null);
  assert.equal(store.data[PENDING_PURCHASE_CACHE_KEY], undefined);
}

async function testAlreadyAcknowledgedRestoreVerified() {
  const store = memoryStore();
  const out = await processStorePurchase({
    deps: deps({
      store,
      backend: backendWith(async () => ({
        alreadyProcessed: true,
        acknowledged: false,
        entitlementActive: true,
        canonicalSku: "vyd_unlimited_monthly",
      })),
    }),
    purchase: androidPurchase({ purchaseToken: "play-token-restore" }),
    pending: null,
    source: "restore",
    processedTokens: new Set(),
  });
  assert.equal(out.result.kind, "verified");
}

async function testSameTokenRenewalVerifiedTwice() {
  const store = memoryStore();
  const tokens = new Set<string>();
  const env = pending();
  await seedPending(store, env);
  let calls = 0;
  const backend = backendWith(async () => {
    calls += 1;
    return {
      alreadyProcessed: calls > 1,
      acknowledged: true,
      entitlementActive: true,
      canonicalSku: "vyd_unlimited_monthly",
    };
  });
  const first = await processStorePurchase({
    deps: deps({ store, backend }),
    purchase: androidPurchase({ purchaseToken: "renew-token" }),
    pending: env,
    source: "purchase",
    processedTokens: tokens,
  });
  assert.equal(first.result.kind, "verified");
  const second = await processStorePurchase({
    deps: deps({ store, backend }),
    purchase: androidPurchase({ purchaseToken: "renew-token" }),
    pending: null,
    source: "restore",
    processedTokens: tokens,
  });
  assert.equal(second.result.kind, "verified");
  assert.equal(calls, 2);
}

async function testLostResponseRetryRecovers() {
  const store = memoryStore();
  const env = pending({ stage: "verifying" });
  await seedPending(store, env);
  const lost = await processStorePurchase({
    deps: deps({
      store,
      backend: backendWith(async () => ({
        alreadyProcessed: false,
        acknowledged: true,
        entitlementActive: false,
      })),
    }),
    purchase: androidPurchase({ purchaseToken: "lost-token" }),
    pending: env,
    source: "purchase",
    processedTokens: new Set(),
  });
  assert.equal(lost.result.kind, "failed");
  assert.equal(lost.pending?.stage, "awaiting_recovery");

  const recovered = await processStorePurchase({
    deps: deps({
      store,
      backend: backendWith(async () => ({
        alreadyProcessed: true,
        acknowledged: true,
        entitlementActive: true,
      })),
    }),
    purchase: androidPurchase({ purchaseToken: "lost-token" }),
    pending: lost.pending!,
    source: "recovery",
    processedTokens: new Set(),
  });
  assert.equal(recovered.result.kind, "verified");
  assert.equal(recovered.pending, null);
}

async function testInactiveDoesNotGrant() {
  const store = memoryStore();
  const env = pending();
  await seedPending(store, env);
  const inactive = await processStorePurchase({
    deps: deps({
      store,
      backend: backendWith(async () => ({
        alreadyProcessed: false,
        acknowledged: false,
        entitlementActive: false,
      })),
    }),
    purchase: androidPurchase({ purchaseToken: "inactive-token" }),
    pending: env,
    source: "purchase",
    processedTokens: new Set(),
  });
  assert.equal(inactive.result.kind, "failed");
  assert.notEqual(inactive.result.kind, "verified");
  assert.equal(inactive.pending?.stage, "awaiting_recovery");
}

async function testPendingPurchaseStateNeverValidates() {
  const store = memoryStore();
  const env = pending();
  await seedPending(store, env);
  let validated = 0;
  const out = await processStorePurchase({
    deps: deps({
      store,
      backend: backendWith(async () => {
        validated += 1;
        return { alreadyProcessed: false, acknowledged: true, entitlementActive: true };
      }),
    }),
    purchase: androidPurchase({ purchaseState: "pending", purchaseToken: "pending-token" }),
    pending: env,
    source: "purchase",
    processedTokens: new Set(),
  });
  assert.equal(validated, 0);
  assert.notEqual(out.result.kind, "verified");
}

async function main() {
  await testNewPurchaseAcknowledgedVerified();
  await testAlreadyAcknowledgedRestoreVerified();
  await testSameTokenRenewalVerifiedTwice();
  await testLostResponseRetryRecovers();
  await testInactiveDoesNotGrant();
  await testPendingPurchaseStateNeverValidates();
  console.log("iapAcknowledgedEntitlement.test.ts: ok");
}

main();
