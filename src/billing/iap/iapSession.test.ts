/**
 * Session: connection/listener ownership, no auto purchase sheet, prepare-before-buy,
 * pending-before-sheet, Expo Go/web, recovery, restore does not revoke.
 */
import assert from "node:assert/strict";

import { resolveIapCapability } from "./iapCapability";
import { PENDING_PURCHASE_CACHE_KEY } from "./iapPendingPurchase";
import { createIapSession } from "./iapSession";
import type {
  IapBackend,
  IapKeyValueStore,
  IapNativeAdapter,
  NativePurchaseRequest,
  StoreProductLike,
  StorePurchase,
  StorePurchaseError,
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

function standardAndroidProduct(): StoreProductLike {
  const offer = (base: string) => ({
    id: base,
    basePlanIdAndroid: base,
    offerTokenAndroid: `token-${base}`,
    displayPrice: `₹store-${base}`,
    currency: "INR",
    pricingPhasesAndroid: {
      pricingPhaseList: [
        {
          billingCycleCount: 0,
          billingPeriod: "P1M",
          formattedPrice: `₹store-${base}`,
          priceAmountMicros: "1000000",
          priceCurrencyCode: "INR",
          recurrenceMode: 1,
        },
      ],
    },
  });
  return {
    id: "vyd_professional",
    type: "subs",
    platform: "android",
    displayPrice: "ignore",
    currency: "INR",
    subscriptionOffers: [offer("monthly"), offer("quarterly"), offer("yearly")],
  };
}

function createHarness(args: {
  platform: "android" | "ios" | "web";
  capabilityReason?: "web" | "expo_go" | "native_build_required" | null;
  products?: StoreProductLike[];
  availablePurchases?: StorePurchase[];
}) {
  const store = memoryStore();
  const calls = {
    init: 0,
    requestPurchase: [] as NativePurchaseRequest[],
    prepareAndroid: 0,
    prepareIos: 0,
    validateAndroid: [] as { purchaseToken: string; expectedCanonicalSku?: string }[],
    validateIos: [] as { signedTransactionInfo: string }[],
    finishIos: 0,
    getAvailable: 0,
  };
  let onPurchase: ((p: StorePurchase) => void) | null = null;
  let onError: ((e: StorePurchaseError) => void) | null = null;

  const native: IapNativeAdapter = {
    async initConnection() {
      calls.init += 1;
      return true;
    },
    async endConnection() {},
    async fetchProducts() {
      return args.products ?? [standardAndroidProduct()];
    },
    async requestPurchase(req) {
      calls.requestPurchase.push(req);
    },
    async getAvailablePurchases() {
      calls.getAvailable += 1;
      return args.availablePurchases ?? [];
    },
    async finishTransactionIOS() {
      calls.finishIos += 1;
    },
    addPurchaseUpdatedListener(listener) {
      onPurchase = listener;
      return () => {
        onPurchase = null;
      };
    },
    addPurchaseErrorListener(listener) {
      onError = listener;
      return () => {
        onError = null;
      };
    },
  };

  const backend: IapBackend = {
    async prepareAndroidBillingAccount() {
      calls.prepareAndroid += 1;
      return { obfuscatedAccountId: "obf-server-aaa" };
    },
    async validateAndActivateAndroid(input) {
      calls.validateAndroid.push(input);
      return { alreadyProcessed: false, acknowledged: true };
    },
    async prepareIOSBillingAccount() {
      calls.prepareIos += 1;
      return { appAccountToken: "22222222-2222-4222-8222-222222222222" };
    },
    async validateAndActivateIOS(input) {
      calls.validateIos.push(input);
      return { alreadyProcessed: false };
    },
  };

  const capability =
    args.capabilityReason != null
      ? { available: false as const, reason: args.capabilityReason }
      : { available: true as const, reason: null };

  const session = createIapSession({
    native,
    backend,
    store,
    platform: args.platform === "web" ? "web" : args.platform,
    capability,
    now: () => 100,
    onChange: () => {},
  });

  return { session, store, calls, native, emitPurchase: (p: StorePurchase) => onPurchase?.(p), emitError: (e: StorePurchaseError) => onError?.(e) };
}

async function testNoPurchaseSheetOnStartup() {
  const h = createHarness({ platform: "android" });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  assert.equal(h.calls.init, 1);
  assert.equal(h.calls.requestPurchase.length, 0);
  assert.equal(h.calls.prepareAndroid, 0);
}

async function testExpoGoAndWebUnsupported() {
  const go = resolveIapCapability({
    platform: "ios",
    appOwnership: "expo",
    nativeModulePresent: true,
  });
  assert.equal(go.available, false);
  assert.equal(go.reason, "expo_go");
  const web = resolveIapCapability({
    platform: "web",
    appOwnership: null,
    nativeModulePresent: false,
  });
  assert.equal(web.reason, "web");
  const h = createHarness({ platform: "web", capabilityReason: "web" });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const result = await h.session.purchase("vyd_professional_yearly");
  assert.equal(result.kind, "unavailable");
  if (result.kind === "unavailable") assert.equal(result.reason, "web");
  assert.equal(h.calls.requestPurchase.length, 0);
}

async function testAndroidPrepareAndPendingBeforeSheet() {
  const h = createHarness({ platform: "android" });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const result = await h.session.purchase("vyd_professional_yearly");
  assert.equal(result.kind, "sheet_launched");
  assert.equal(h.calls.prepareAndroid, 1);
  assert.equal(h.calls.requestPurchase.length, 1);
  const req = h.calls.requestPurchase[0];
  assert.equal(req.type, "subs");
  assert.deepEqual(req.request.google?.skus, ["vyd_professional"]);
  assert.deepEqual(req.request.google?.subscriptionOffers, [
    { sku: "vyd_professional", offerToken: "token-yearly" },
  ]);
  assert.equal(req.request.google?.obfuscatedAccountId, "obf-server-aaa");
  assert.equal(req.request.apple, undefined);
  const raw = h.store.data[PENDING_PURCHASE_CACHE_KEY];
  assert.ok(raw);
  const parsed = JSON.parse(raw) as { uid: string; stage: string; canonicalSku: string };
  assert.equal(parsed.uid, "uid-a");
  assert.equal(parsed.stage, "intent_created");
  assert.equal(parsed.canonicalSku, "vyd_professional_yearly");
  assert.doesNotMatch(raw, /obf-server|play-token|purchaseToken/);
}

async function testIosPrepareUuidAndPendingBeforeSheet() {
  const iosProduct: StoreProductLike = {
    id: "com.specialsoftwares.vyaamikkdiary.professional.yearly",
    type: "subs",
    platform: "ios",
    displayPrice: "$19.99",
    currency: "USD",
    introductoryPricePaymentModeIOS: "empty",
  };
  const h = createHarness({ platform: "ios", products: [iosProduct] });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const result = await h.session.purchase("vyd_professional_yearly");
  assert.equal(result.kind, "sheet_launched");
  assert.equal(h.calls.prepareIos, 1);
  assert.equal(h.calls.requestPurchase[0].request.apple?.sku, iosProduct.id);
  assert.equal(
    h.calls.requestPurchase[0].request.apple?.appAccountToken,
    "22222222-2222-4222-8222-222222222222"
  );
  assert.equal(
    "withOffer" in (h.calls.requestPurchase[0].request.apple ?? {}),
    false
  );
  assert.ok(h.store.data[PENDING_PURCHASE_CACHE_KEY]);
}

async function testOnePurchaseAtATime() {
  const h = createHarness({ platform: "android" });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const first = await h.session.purchase("vyd_professional_yearly");
  const second = await h.session.purchase("vyd_professional_monthly");
  assert.equal(first.kind, "sheet_launched");
  assert.equal(second.kind, "already_in_flight");
  assert.equal(h.calls.requestPurchase.length, 1);
}

async function testRecoveryQueriesStoreAndValidates() {
  const pendingEnv = {
    version: 1,
    uid: "uid-a",
    platform: "android",
    canonicalSku: "vyd_professional_yearly",
    productId: "vyd_professional",
    androidBasePlanId: "yearly",
    stage: "intent_created",
    initiatedAt: 1,
    updatedAt: 1,
  };
  const purchase: StorePurchase = {
    store: "google",
    productId: "vyd_professional",
    purchaseState: "purchased",
    purchaseToken: "recover-token",
    currentPlanId: "monthly",
    nativePurchase: {},
  };
  const h = createHarness({
    platform: "android",
    availablePurchases: [purchase],
  });
  h.store.data[PENDING_PURCHASE_CACHE_KEY] = JSON.stringify(pendingEnv);
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  assert.equal(h.calls.requestPurchase.length, 0);
  assert.equal(h.calls.getAvailable, 1);
  assert.equal(h.calls.validateAndroid.length, 1);
  assert.equal(h.calls.validateAndroid[0].purchaseToken, "recover-token");
}

async function testFailedStoreQueryDoesNotValidate() {
  const store = memoryStore();
  const native: IapNativeAdapter = {
    async initConnection() {
      return true;
    },
    async endConnection() {},
    async fetchProducts() {
      return [standardAndroidProduct()];
    },
    async requestPurchase() {},
    async getAvailablePurchases() {
      throw new Error("store down");
    },
    async finishTransactionIOS() {},
    addPurchaseUpdatedListener() {
      return () => {};
    },
    addPurchaseErrorListener() {
      return () => {};
    },
  };
  const validates: string[] = [];
  const session = createIapSession({
    native,
    backend: {
      async prepareAndroidBillingAccount() {
        return { obfuscatedAccountId: "x" };
      },
      async validateAndActivateAndroid() {
        validates.push("android");
        return { alreadyProcessed: false, acknowledged: true };
      },
      async prepareIOSBillingAccount() {
        return { appAccountToken: "22222222-2222-4222-8222-222222222222" };
      },
      async validateAndActivateIOS() {
        validates.push("ios");
        return { alreadyProcessed: false };
      },
    },
    store,
    platform: "android",
    capability: { available: true, reason: null },
    now: () => 1,
    onChange: () => {},
  });
  await session.setAuth({ status: "signed_in", uid: "uid-a" });
  const result = await session.restorePurchases();
  assert.equal(validates.length, 0);
  assert.equal(result.kind, "failed");
}

async function testEmptyRestoreDoesNotInventSuccessRevoke() {
  const h = createHarness({ platform: "android", availablePurchases: [] });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const result = await h.session.restorePurchases();
  assert.equal(h.calls.validateAndroid.length, 0);
  assert.ok(result.kind === "verified" || result.kind === "unavailable");
}

async function testLogoutIsolatesPending() {
  const h = createHarness({ platform: "android" });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  await h.session.purchase("vyd_professional_yearly");
  assert.ok(h.store.data[PENDING_PURCHASE_CACHE_KEY]);
  await h.session.setAuth({ status: "signed_out", uid: null });
  assert.equal(h.store.data[PENDING_PURCHASE_CACHE_KEY], undefined);
  await h.session.setAuth({ status: "signed_in", uid: "uid-b" });
  assert.equal(h.session.getView().pending, null);
}

async function main() {
  await testNoPurchaseSheetOnStartup();
  await testExpoGoAndWebUnsupported();
  await testAndroidPrepareAndPendingBeforeSheet();
  await testIosPrepareUuidAndPendingBeforeSheet();
  await testOnePurchaseAtATime();
  await testRecoveryQueriesStoreAndValidates();
  await testEmptyRestoreDoesNotInventSuccessRevoke();
  await testFailedStoreQueryDoesNotValidate();
  await testLogoutIsolatesPending();
  console.log("iapSession.test.ts: ok");
}

main();
