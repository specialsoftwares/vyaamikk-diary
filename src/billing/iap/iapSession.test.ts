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
  store?: IapKeyValueStore & { data: Record<string, string> };
  initConnection?: () => Promise<boolean>;
  endConnection?: () => Promise<void>;
  requestPurchase?: (req: NativePurchaseRequest) => Promise<void>;
  fetchProducts?: () => Promise<StoreProductLike[]>;
  getAvailablePurchases?: () => Promise<StorePurchase[]>;
  finishTransactionIOS?: () => Promise<void>;
}) {
  const store = args.store ?? memoryStore();
  const calls = {
    init: 0,
    end: 0,
    requestPurchase: [] as NativePurchaseRequest[],
    prepareAndroid: 0,
    prepareIos: 0,
    validateAndroid: [] as { purchaseToken: string; expectedCanonicalSku?: string }[],
    validateIos: [] as { signedTransactionInfo: string }[],
    finishIos: 0,
    getAvailable: 0,
    fetch: 0,
    purchaseListeners: 0,
    errorListeners: 0,
  };
  let onPurchase: ((p: StorePurchase) => void) | null = null;
  let onError: ((e: StorePurchaseError) => void) | null = null;

  const native: IapNativeAdapter = {
    async initConnection() {
      calls.init += 1;
      if (args.initConnection) return args.initConnection();
      return true;
    },
    async endConnection() {
      calls.end += 1;
      if (args.endConnection) await args.endConnection();
    },
    async fetchProducts() {
      calls.fetch += 1;
      if (args.fetchProducts) return args.fetchProducts();
      return args.products ?? [standardAndroidProduct()];
    },
    async requestPurchase(req) {
      calls.requestPurchase.push(req);
      if (args.requestPurchase) await args.requestPurchase(req);
    },
    async getAvailablePurchases() {
      calls.getAvailable += 1;
      if (args.getAvailablePurchases) return args.getAvailablePurchases();
      return args.availablePurchases ?? [];
    },
    async finishTransactionIOS() {
      calls.finishIos += 1;
      if (args.finishTransactionIOS) await args.finishTransactionIOS();
    },
    addPurchaseUpdatedListener(listener) {
      calls.purchaseListeners += 1;
      onPurchase = listener;
      return () => {
        onPurchase = null;
      };
    },
    addPurchaseErrorListener(listener) {
      calls.errorListeners += 1;
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

function createDeferredStore(): IapKeyValueStore & {
  data: Record<string, string>;
  waitForSetItem: () => Promise<void>;
  releaseSetItem: () => void;
} {
  const data: Record<string, string> = {};
  let setStarted: () => void = () => {};
  const setStartedP = new Promise<void>((resolve) => {
    setStarted = resolve;
  });
  let releaseSet: () => void = () => {};
  const setGate = new Promise<void>((resolve) => {
    releaseSet = resolve;
  });
  let firstSet = true;
  return {
    data,
    waitForSetItem: () => setStartedP,
    releaseSetItem: () => releaseSet(),
    async getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    async setItem(key, value) {
      if (firstSet) {
        firstSet = false;
        setStarted();
        await setGate;
      }
      data[key] = value;
    },
    async removeItem(key) {
      delete data[key];
    },
  };
}

async function testStaleAPurchaseDoesNotLaunchSheetAfterB() {
  const store = createDeferredStore();
  const h = createHarness({ platform: "android", store });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const purchaseA = h.session.purchase("vyd_professional_yearly");
  await store.waitForSetItem();
  await h.session.setAuth({ status: "signed_in", uid: "uid-b" });
  store.releaseSetItem();
  const result = await purchaseA;
  assert.equal(result.kind, "failed");
  if (result.kind === "failed") assert.equal(result.recoverable, true);
  assert.equal(h.calls.requestPurchase.length, 0);
  const raw = store.data[PENDING_PURCHASE_CACHE_KEY];
  if (raw) {
    const parsed = JSON.parse(raw) as { uid: string };
    assert.notEqual(parsed.uid, "uid-a");
  }
}

async function testColdStartBCanPurchaseAfterOrphanedA() {
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
  const h = createHarness({ platform: "android" });
  h.store.data[PENDING_PURCHASE_CACHE_KEY] = JSON.stringify(pendingEnv);
  await h.session.setAuth({ status: "signed_in", uid: "uid-b" });
  assert.equal(h.session.getView().pending, null);
  const result = await h.session.purchase("vyd_professional_yearly");
  assert.equal(result.kind, "sheet_launched");
  assert.equal(h.calls.requestPurchase.length, 1);
  const parsed = JSON.parse(h.store.data[PENDING_PURCHASE_CACHE_KEY]) as { uid: string };
  assert.equal(parsed.uid, "uid-b");
}

async function testInitConnectionFalseDoesNotConnectOrRecover() {
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
  const h = createHarness({
    platform: "android",
    initConnection: async () => false,
  });
  h.store.data[PENDING_PURCHASE_CACHE_KEY] = JSON.stringify(pendingEnv);
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  assert.equal(h.session.getView().connected, false);
  assert.equal(h.calls.purchaseListeners, 0);
  assert.equal(h.calls.errorListeners, 0);
  assert.equal(h.calls.getAvailable, 0);
}

async function testStaleAInitDoesNotOrphanConnection() {
  let resolveA = (_value: boolean) => {};
  let firstInit = true;
  let initStarted = () => {};
  const initStartedP = new Promise<void>((resolve) => {
    initStarted = resolve;
  });
  const h = createHarness({
    platform: "android",
    initConnection: async () => {
      if (firstInit) {
        firstInit = false;
        initStarted();
        return new Promise<boolean>((resolve) => {
          resolveA = resolve;
        });
      }
      return true;
    },
  });
  const authA = h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  await initStartedP;
  await h.session.setAuth({ status: "signed_out", uid: null });
  resolveA(true);
  await authA;
  assert.ok(h.calls.end >= 1);
  assert.equal(h.session.getView().connected, false);
}

async function testStaleAInitDoesNotTearDownB() {
  let resolveA = (_value: boolean) => {};
  let firstInit = true;
  let initStarted = () => {};
  const initStartedP = new Promise<void>((resolve) => {
    initStarted = resolve;
  });
  const h = createHarness({
    platform: "android",
    initConnection: async () => {
      if (firstInit) {
        firstInit = false;
        initStarted();
        return new Promise<boolean>((resolve) => {
          resolveA = resolve;
        });
      }
      return true;
    },
  });
  const authA = h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  await initStartedP;
  await h.session.setAuth({ status: "signed_in", uid: "uid-b" });
  const endsAfterB = h.calls.end;
  resolveA(true);
  await authA;
  assert.equal(h.session.getView().ownerUid, "uid-b");
  assert.equal(h.session.getView().connected, true);
  assert.equal(h.calls.end, endsAfterB);
}

async function testBoundedReconnectDoesNotAutoLaunchPurchase() {
  let fetchCount = 0;
  const h = createHarness({
    platform: "android",
    fetchProducts: async () => {
      fetchCount += 1;
      if (fetchCount === 1) {
        const err = new Error("disconnected");
        (err as { code?: string }).code = "service-disconnected";
        throw err;
      }
      return [standardAndroidProduct()];
    },
  });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  assert.equal(h.calls.requestPurchase.length, 0);
  const catalog = await h.session.loadCatalog();
  assert.equal(h.calls.init, 2);
  assert.ok(catalog.some((item) => item.canonicalSku === "vyd_professional_yearly" && item.available));
  assert.equal(h.calls.requestPurchase.length, 0);
}

async function testNonCancelListenerErrorReleasesFlowLock() {
  const h = createHarness({ platform: "android" });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const first = await h.session.purchase("vyd_professional_yearly");
  assert.equal(first.kind, "sheet_launched");
  h.emitError({ code: "billing-unavailable", message: "store failed" });
  for (let i = 0; i < 30; i += 1) {
    if (!h.session.getView().purchaseInFlight && h.session.getView().pending == null) break;
    await new Promise((r) => setImmediate(r));
  }
  assert.equal(h.session.getView().purchaseInFlight, false);
  const second = await h.session.purchase("vyd_professional_monthly");
  assert.equal(second.kind, "sheet_launched");
  assert.equal(h.calls.requestPurchase.length, 2);
}

async function testRequestPurchaseFailureIsRetryable() {
  let throws = true;
  const h = createHarness({
    platform: "android",
    requestPurchase: async () => {
      if (throws) throw new Error("Play Billing failed");
    },
  });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const first = await h.session.purchase("vyd_professional_yearly");
  assert.equal(first.kind, "failed");
  if (first.kind === "failed") assert.equal(first.recoverable, true);
  assert.equal(h.session.getView().purchaseInFlight, false);
  throws = false;
  const second = await h.session.purchase("vyd_professional_yearly");
  assert.equal(second.kind, "sheet_launched");
}

async function testRequestPurchaseUserCancelledByCode() {
  const h = createHarness({
    platform: "android",
    requestPurchase: async () => {
      const err = new Error("कार्रवाई रद्द");
      (err as { code?: string }).code = "user-cancelled";
      throw err;
    },
  });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const result = await h.session.purchase("vyd_professional_yearly");
  assert.equal(result.kind, "cancelled");
  assert.equal(h.store.data[PENDING_PURCHASE_CACHE_KEY], undefined);
  const retry = await h.session.purchase("vyd_professional_yearly");
  assert.equal(retry.kind, "cancelled");
  assert.equal(h.calls.requestPurchase.length, 2);
}

async function testEmptyRecoveryClearsAbandonedIntent() {
  const pendingEnv = {
    version: 1,
    uid: "uid-a",
    platform: "android",
    canonicalSku: "vyd_professional_yearly",
    productId: "vyd_professional",
    androidBasePlanId: "yearly",
    stage: "intent_created" as const,
    initiatedAt: 1,
    updatedAt: 1,
  };
  const h = createHarness({ platform: "android", availablePurchases: [] });
  h.store.data[PENDING_PURCHASE_CACHE_KEY] = JSON.stringify(pendingEnv);
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  assert.equal(h.calls.getAvailable, 1);
  assert.equal(h.session.getView().pending, null);
  const result = await h.session.purchase("vyd_professional_yearly");
  assert.equal(result.kind, "sheet_launched");
}

async function testEmptyRecoveryClearsAwaitingRecovery() {
  const pendingEnv = {
    version: 1,
    uid: "uid-a",
    platform: "android",
    canonicalSku: "vyd_professional_yearly",
    productId: "vyd_professional",
    androidBasePlanId: "yearly",
    stage: "awaiting_recovery" as const,
    initiatedAt: 1,
    updatedAt: 1,
  };
  const h = createHarness({ platform: "android", availablePurchases: [] });
  h.store.data[PENDING_PURCHASE_CACHE_KEY] = JSON.stringify(pendingEnv);
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  assert.equal(h.session.getView().pending, null);
}

async function testFailedRecoveryQueryKeepsRecoverableState() {
  const pendingEnv = {
    version: 1,
    uid: "uid-a",
    platform: "android",
    canonicalSku: "vyd_professional_yearly",
    productId: "vyd_professional",
    androidBasePlanId: "yearly",
    stage: "intent_created" as const,
    initiatedAt: 1,
    updatedAt: 1,
  };
  const h = createHarness({
    platform: "android",
    getAvailablePurchases: async () => {
      throw new Error("store down");
    },
  });
  h.store.data[PENDING_PURCHASE_CACHE_KEY] = JSON.stringify(pendingEnv);
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  assert.equal(h.session.getView().pending?.stage, "awaiting_recovery");
}

async function testStorePendingSurvivesEmptyAndFailedRecovery() {
  const pendingEnv = {
    version: 1,
    uid: "uid-a",
    platform: "android",
    canonicalSku: "vyd_professional_yearly",
    productId: "vyd_professional",
    androidBasePlanId: "yearly",
    stage: "store_pending" as const,
    initiatedAt: 1,
    updatedAt: 1,
  };
  const empty = createHarness({ platform: "android", availablePurchases: [] });
  empty.store.data[PENDING_PURCHASE_CACHE_KEY] = JSON.stringify(pendingEnv);
  await empty.session.setAuth({ status: "signed_in", uid: "uid-a" });
  assert.equal(empty.session.getView().pending?.stage, "store_pending");
  const blocked = await empty.session.purchase("vyd_professional_monthly");
  assert.equal(blocked.kind, "already_in_flight");

  const failed = createHarness({
    platform: "android",
    getAvailablePurchases: async () => {
      throw new Error("store down");
    },
  });
  failed.store.data[PENDING_PURCHASE_CACHE_KEY] = JSON.stringify(pendingEnv);
  await failed.session.setAuth({ status: "signed_in", uid: "uid-a" });
  assert.equal(failed.session.getView().pending?.stage, "store_pending");
}

async function testVerifiedUnfinishedIosSurvivesUntilFinish() {
  const pendingEnv = {
    version: 1,
    uid: "uid-a",
    platform: "ios" as const,
    canonicalSku: "vyd_professional_yearly" as const,
    productId: "com.specialsoftwares.vyaamikkdiary.professional.yearly",
    stage: "verified_unfinished_ios" as const,
    initiatedAt: 1,
    updatedAt: 1,
  };
  const iosProduct: StoreProductLike = {
    id: "com.specialsoftwares.vyaamikkdiary.professional.yearly",
    type: "subs",
    platform: "ios",
    displayPrice: "$19.99",
    currency: "USD",
    introductoryPricePaymentModeIOS: "empty",
  };
  const empty = createHarness({
    platform: "ios",
    products: [iosProduct],
    availablePurchases: [],
  });
  empty.store.data[PENDING_PURCHASE_CACHE_KEY] = JSON.stringify(pendingEnv);
  await empty.session.setAuth({ status: "signed_in", uid: "uid-a" });
  assert.equal(empty.session.getView().pending?.stage, "verified_unfinished_ios");
  const blocked = await empty.session.purchase("vyd_professional_yearly");
  assert.equal(blocked.kind, "already_in_flight");
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
  await testStaleAPurchaseDoesNotLaunchSheetAfterB();
  await testColdStartBCanPurchaseAfterOrphanedA();
  await testInitConnectionFalseDoesNotConnectOrRecover();
  await testStaleAInitDoesNotOrphanConnection();
  await testStaleAInitDoesNotTearDownB();
  await testBoundedReconnectDoesNotAutoLaunchPurchase();
  await testNonCancelListenerErrorReleasesFlowLock();
  await testRequestPurchaseFailureIsRetryable();
  await testRequestPurchaseUserCancelledByCode();
  await testEmptyRecoveryClearsAbandonedIntent();
  await testEmptyRecoveryClearsAwaitingRecovery();
  await testFailedRecoveryQueryKeepsRecoverableState();
  await testStorePendingSurvivesEmptyAndFailedRecovery();
  await testVerifiedUnfinishedIosSurvivesUntilFinish();
  console.log("iapSession.test.ts: ok");
}

main();
