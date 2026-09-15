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
  IapView,
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
  prepareAndroidBillingAccount?: () => Promise<{ obfuscatedAccountId: string }>;
  prepareIOSBillingAccount?: () => Promise<{ appAccountToken: string }>;
  validateAndActivateAndroid?: (input: {
    purchaseToken: string;
    expectedCanonicalSku?: string;
  }) => Promise<{ alreadyProcessed: boolean; acknowledged: boolean }>;
  validateAndActivateIOS?: (input: {
    signedTransactionInfo: string;
    expectedCanonicalSku?: string;
  }) => Promise<{ alreadyProcessed: boolean }>;
  now?: () => number;
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
    initInFlight: 0,
    maxConcurrentInit: 0,
    activePurchaseListeners: 0,
    activeErrorListeners: 0,
  };
  let onPurchase: ((p: StorePurchase) => void) | null = null;
  let onError: ((e: StorePurchaseError) => void) | null = null;

  const native: IapNativeAdapter = {
    async initConnection() {
      calls.init += 1;
      calls.initInFlight += 1;
      calls.maxConcurrentInit = Math.max(calls.maxConcurrentInit, calls.initInFlight);
      try {
        if (args.initConnection) return await args.initConnection();
        return true;
      } finally {
        calls.initInFlight -= 1;
      }
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
      calls.activePurchaseListeners += 1;
      onPurchase = listener;
      return () => {
        calls.activePurchaseListeners -= 1;
        if (onPurchase === listener) onPurchase = null;
      };
    },
    addPurchaseErrorListener(listener) {
      calls.errorListeners += 1;
      calls.activeErrorListeners += 1;
      onError = listener;
      return () => {
        calls.activeErrorListeners -= 1;
        if (onError === listener) onError = null;
      };
    },
  };

  const backend: IapBackend = {
    async prepareAndroidBillingAccount() {
      calls.prepareAndroid += 1;
      if (args.prepareAndroidBillingAccount) return args.prepareAndroidBillingAccount();
      return { obfuscatedAccountId: "obf-server-aaa" };
    },
    async validateAndActivateAndroid(input) {
      calls.validateAndroid.push(input);
      if (args.validateAndActivateAndroid) return args.validateAndActivateAndroid(input);
      return { alreadyProcessed: false, acknowledged: true };
    },
    async prepareIOSBillingAccount() {
      calls.prepareIos += 1;
      if (args.prepareIOSBillingAccount) return args.prepareIOSBillingAccount();
      return { appAccountToken: "22222222-2222-4222-8222-222222222222" };
    },
    async validateAndActivateIOS(input) {
      calls.validateIos.push(input);
      if (args.validateAndActivateIOS) return args.validateAndActivateIOS(input);
      return { alreadyProcessed: false };
    },
  };

  const capability =
    args.capabilityReason != null
      ? { available: false as const, reason: args.capabilityReason }
      : { available: true as const, reason: null };

  const views: IapView[] = [];
  const session = createIapSession({
    native,
    backend,
    store,
    platform: args.platform === "web" ? "web" : args.platform,
    capability,
    now: args.now ?? (() => 100),
    onChange: (view) => {
      views.push({
        ...view,
        catalog: [...view.catalog],
        pending: view.pending ? { ...view.pending } : null,
        lastResult: view.lastResult,
      });
    },
  });

  return {
    session,
    store,
    calls,
    native,
    views,
    emitPurchase: (p: StorePurchase) => onPurchase?.(p),
    emitError: (e: StorePurchaseError) => onError?.(e),
  };
}

async function flushAsync() {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
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
  assert.equal(h.calls.initInFlight, 1);
  const authB = h.session.setAuth({ status: "signed_in", uid: "uid-b" });
  await flushAsync();
  assert.equal(h.calls.initInFlight, 1);
  assert.equal(h.calls.init, 1);
  assert.equal(h.calls.maxConcurrentInit, 1);
  resolveA(true);
  await authA;
  await authB;
  assert.equal(h.calls.initInFlight, 0);
  assert.equal(h.session.getView().ownerUid, "uid-b");
  assert.equal(h.session.getView().connected, true);
  assert.equal(h.calls.maxConcurrentInit, 1);
  assert.equal(h.calls.activePurchaseListeners, 1);
  assert.equal(h.calls.activeErrorListeners, 1);
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

function gate() {
  let release = () => {};
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release: () => release() };
}

async function testStaleARequestResolveDoesNotReleaseBLock() {
  let first = true;
  const g = gate();
  let started = () => {};
  const startedP = new Promise<void>((resolve) => {
    started = resolve;
  });
  const h = createHarness({
    platform: "android",
    requestPurchase: async () => {
      if (first) {
        first = false;
        started();
        await g.wait;
      }
    },
  });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const purchaseA = h.session.purchase("vyd_professional_yearly");
  await startedP;
  await h.session.setAuth({ status: "signed_in", uid: "uid-b" });
  const purchaseB = await h.session.purchase("vyd_professional_yearly");
  assert.equal(purchaseB.kind, "sheet_launched");
  assert.equal(h.session.getView().purchaseInFlight, true);
  assert.equal(h.session.getView().pending?.uid, "uid-b");
  const bLast = h.session.getView().lastResult;
  g.release();
  const aResult = await purchaseA;
  assert.equal(aResult.kind, "failed");
  assert.equal(h.session.getView().purchaseInFlight, true);
  assert.equal(h.session.getView().pending?.uid, "uid-b");
  assert.equal(h.session.getView().lastResult, bLast);
  assert.equal(readPersistedPending(h.store)?.uid, "uid-b");
  const secondB = await h.session.purchase("vyd_professional_monthly");
  assert.equal(secondB.kind, "already_in_flight");
  assert.equal(h.calls.requestPurchase.length, 2);
}

async function testStaleARequestRejectDoesNotReleaseBLock() {
  let first = true;
  const g = gate();
  let started = () => {};
  const startedP = new Promise<void>((resolve) => {
    started = resolve;
  });
  const h = createHarness({
    platform: "android",
    requestPurchase: async () => {
      if (first) {
        first = false;
        started();
        await g.wait;
        throw new Error("stale A request failed");
      }
    },
  });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const purchaseA = h.session.purchase("vyd_professional_yearly");
  await startedP;
  await h.session.setAuth({ status: "signed_in", uid: "uid-b" });
  const purchaseB = await h.session.purchase("vyd_professional_yearly");
  assert.equal(purchaseB.kind, "sheet_launched");
  const bLast = h.session.getView().lastResult;
  g.release();
  const aResult = await purchaseA;
  assert.equal(aResult.kind, "failed");
  assert.equal(h.session.getView().purchaseInFlight, true);
  assert.equal(h.session.getView().pending?.uid, "uid-b");
  assert.equal(h.session.getView().lastResult, bLast);
  assert.equal(readPersistedPending(h.store)?.uid, "uid-b");
  const secondB = await h.session.purchase("vyd_professional_monthly");
  assert.equal(secondB.kind, "already_in_flight");
  assert.equal(h.calls.requestPurchase.length, 2);
}

async function testStalePrepareDoesNotClearBPurchase() {
  let first = true;
  const g = gate();
  let started = () => {};
  const startedP = new Promise<void>((resolve) => {
    started = resolve;
  });
  const h = createHarness({
    platform: "android",
    prepareAndroidBillingAccount: async () => {
      if (first) {
        first = false;
        started();
        await g.wait;
      }
      return { obfuscatedAccountId: "obf-server-aaa" };
    },
  });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const purchaseA = h.session.purchase("vyd_professional_yearly");
  await startedP;
  await h.session.setAuth({ status: "signed_in", uid: "uid-b" });
  const purchaseB = await h.session.purchase("vyd_professional_yearly");
  assert.equal(purchaseB.kind, "sheet_launched");
  assert.equal(h.session.getView().purchaseInFlight, true);
  g.release();
  await purchaseA;
  assert.equal(h.session.getView().purchaseInFlight, true);
  assert.equal(h.session.getView().pending?.uid, "uid-b");
  const secondB = await h.session.purchase("vyd_professional_monthly");
  assert.equal(secondB.kind, "already_in_flight");
}

async function testStaleCatalogDoesNotClearBCatalog() {
  let first = true;
  const g = gate();
  let started = () => {};
  const startedP = new Promise<void>((resolve) => {
    started = resolve;
  });
  const h = createHarness({
    platform: "android",
    fetchProducts: async () => {
      if (first) {
        first = false;
        started();
        await g.wait;
      }
      return [standardAndroidProduct()];
    },
  });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const loadA = h.session.loadCatalog();
  await startedP;
  await h.session.setAuth({ status: "signed_in", uid: "uid-b" });
  const catalogB = await h.session.loadCatalog();
  assert.ok(catalogB.some((item) => item.canonicalSku === "vyd_professional_yearly" && item.available));
  g.release();
  await loadA;
  const after = h.session.getView().catalog;
  assert.ok(after.some((item) => item.canonicalSku === "vyd_professional_yearly" && item.available));
  assert.equal(after.length, catalogB.length);
}

async function testStaleRestoreDoesNotOverwriteBLastResult() {
  let first = true;
  const g = gate();
  let started = () => {};
  const startedP = new Promise<void>((resolve) => {
    started = resolve;
  });
  const h = createHarness({
    platform: "android",
    getAvailablePurchases: async () => {
      if (first) {
        first = false;
        started();
        await g.wait;
        throw new Error("store down");
      }
      return [];
    },
  });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const restoreA = h.session.restorePurchases();
  await startedP;
  await h.session.setAuth({ status: "signed_in", uid: "uid-b" });
  const restoreB = await h.session.restorePurchases();
  assert.equal(restoreB.kind, "verified");
  const bLast = h.session.getView().lastResult;
  g.release();
  await restoreA;
  assert.equal(h.session.getView().lastResult, bLast);
  assert.equal(h.session.getView().lastResult?.kind, "verified");
}

function createDeferredRemoveStore(): IapKeyValueStore & {
  data: Record<string, string>;
  waitForRemoveItem: () => Promise<void>;
  releaseRemoveItem: () => void;
} {
  const data: Record<string, string> = {};
  let started = () => {};
  const startedP = new Promise<void>((resolve) => {
    started = resolve;
  });
  const g = gate();
  let firstRemove = true;
  return {
    data,
    waitForRemoveItem: () => startedP,
    releaseRemoveItem: () => g.release(),
    async getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    async setItem(key, value) {
      data[key] = value;
    },
    async removeItem(key) {
      if (firstRemove) {
        firstRemove = false;
        started();
        await g.wait;
      }
      delete data[key];
    },
  };
}

async function testOldAuthCleanupDoesNotCloseNewAuth() {
  const store = createDeferredRemoveStore();
  const h = createHarness({ platform: "android", store });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  await h.session.purchase("vyd_professional_yearly");
  assert.equal(h.session.getView().connected, true);
  const authB = h.session.setAuth({ status: "signed_in", uid: "uid-b" });
  await store.waitForRemoveItem();
  await h.session.setAuth({ status: "signed_in", uid: "uid-c" });
  const endsAfterC = h.calls.end;
  const listenersAfterC = h.calls.purchaseListeners;
  store.releaseRemoveItem();
  await authB;
  assert.equal(h.session.getView().ownerUid, "uid-c");
  assert.equal(h.session.getView().connected, true);
  assert.equal(h.calls.end, endsAfterC);
  h.emitPurchase({
    store: "google",
    productId: "vyd_professional",
    purchaseState: "purchased",
    purchaseToken: "c-token",
    nativePurchase: {},
  });
  assert.ok(h.calls.purchaseListeners >= listenersAfterC);
}

async function testAuthChangeDuringEndConnection() {
  let firstEnd = true;
  const g = gate();
  let started = () => {};
  const startedP = new Promise<void>((resolve) => {
    started = resolve;
  });
  const h = createHarness({
    platform: "android",
    endConnection: async () => {
      if (firstEnd) {
        firstEnd = false;
        started();
        await g.wait;
      }
    },
  });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const authB = h.session.setAuth({ status: "signed_in", uid: "uid-b" });
  await startedP;
  const authC = h.session.setAuth({ status: "signed_in", uid: "uid-c" });
  g.release();
  await authB;
  await authC;
  assert.equal(h.session.getView().ownerUid, "uid-c");
  assert.equal(h.session.getView().connected, true);
}

async function testStaleInitAfterNewInitFalseCleansUp() {
  let resolveA = (_value: boolean) => {};
  let firstInit = true;
  let started = () => {};
  const startedP = new Promise<void>((resolve) => {
    started = resolve;
  });
  const h = createHarness({
    platform: "android",
    initConnection: async () => {
      if (firstInit) {
        firstInit = false;
        started();
        return new Promise<boolean>((resolve) => {
          resolveA = resolve;
        });
      }
      return false;
    },
  });
  const authA = h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  await startedP;
  assert.equal(h.calls.initInFlight, 1);
  const authB = h.session.setAuth({ status: "signed_in", uid: "uid-b" });
  await flushAsync();
  assert.equal(h.calls.initInFlight, 1);
  assert.equal(h.calls.init, 1);
  assert.equal(h.calls.maxConcurrentInit, 1);
  resolveA(true);
  await authA;
  await authB;
  assert.equal(h.calls.initInFlight, 0);
  assert.equal(h.calls.maxConcurrentInit, 1);
  assert.equal(h.session.getView().connected, false);
  assert.equal(h.session.getView().ownerUid, "uid-b");
  assert.equal(h.calls.activePurchaseListeners, 0);
  assert.equal(h.calls.activeErrorListeners, 0);
  assert.ok(h.calls.end >= 1);
}

async function testIosATokenDoesNotContaminateBSession() {
  const iosProduct: StoreProductLike = {
    id: "com.specialsoftwares.vyaamikkdiary.professional.yearly",
    type: "subs",
    platform: "ios",
    displayPrice: "$19.99",
    currency: "USD",
    introductoryPricePaymentModeIOS: "empty",
  };
  const starterProduct: StoreProductLike = {
    id: "com.specialsoftwares.vyaamikkdiary.starter.monthly",
    type: "subs",
    platform: "ios",
    displayPrice: "$2.99",
    currency: "USD",
    introductoryPricePaymentModeIOS: "empty",
  };
  const g = gate();
  let started = () => {};
  const startedP = new Promise<void>((resolve) => {
    started = resolve;
  });
  let firstValidate = true;
  const h = createHarness({
    platform: "ios",
    products: [iosProduct, starterProduct],
    validateAndActivateIOS: async () => {
      if (firstValidate) {
        firstValidate = false;
        started();
        await g.wait;
      }
      return { alreadyProcessed: false };
    },
  });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  await h.session.purchase("vyd_professional_yearly");
  const aPurchase = {
    store: "apple" as const,
    productId: "com.specialsoftwares.vyaamikkdiary.professional.yearly",
    purchaseState: "purchased" as const,
    purchaseToken: "header.payload.signature",
    nativePurchase: {},
  };
  h.emitPurchase(aPurchase);
  await startedP;
  await h.session.setAuth({ status: "signed_in", uid: "uid-b" });
  const bBuy = await h.session.purchase("vyd_starter_monthly");
  assert.equal(bBuy.kind, "sheet_launched");
  assert.equal(h.session.getView().pending?.uid, "uid-b");
  const validatesAfterB = h.calls.validateIos.length;
  g.release();
  await flushAsync();
  assert.equal(h.session.getView().pending?.uid, "uid-b");
  assert.equal(h.session.getView().pending?.canonicalSku, "vyd_starter_monthly");
  assert.equal(h.session.getView().purchaseInFlight, true);
  assert.notEqual(h.session.getView().lastResult?.kind, "verified");
  h.emitPurchase(aPurchase);
  await flushAsync();
  assert.equal(h.session.getView().pending?.uid, "uid-b");
  assert.equal(h.session.getView().pending?.canonicalSku, "vyd_starter_monthly");
  assert.ok(h.calls.validateIos.length >= validatesAfterB);
  assert.notEqual(h.session.getView().lastResult?.kind, "verified");
}

async function testConcurrentDoublePurchaseDuringCatalog() {
  let first = true;
  const g = gate();
  let started = () => {};
  const startedP = new Promise<void>((resolve) => {
    started = resolve;
  });
  const h = createHarness({
    platform: "android",
    fetchProducts: async () => {
      if (first) {
        first = false;
        started();
        await g.wait;
      }
      return [standardAndroidProduct()];
    },
  });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  assert.equal(h.session.getView().catalog.length, 0);
  const firstPromise = h.session.purchase("vyd_professional_yearly");
  await startedP;
  const secondResult = await h.session.purchase("vyd_professional_monthly");
  assert.equal(secondResult.kind, "already_in_flight");
  g.release();
  const firstResult = await firstPromise;
  assert.equal(firstResult.kind, "sheet_launched");
  assert.equal(h.calls.prepareAndroid, 1);
  assert.equal(h.session.getView().pending?.canonicalSku, "vyd_professional_yearly");
  assert.equal(h.session.getView().pending?.uid, "uid-a");
  assert.equal(h.calls.requestPurchase.length, 1);
}

async function testIdenticalSkuDoubleTap() {
  let first = true;
  const g = gate();
  let started = () => {};
  const startedP = new Promise<void>((resolve) => {
    started = resolve;
  });
  const h = createHarness({
    platform: "android",
    fetchProducts: async () => {
      if (first) {
        first = false;
        started();
        await g.wait;
      }
      return [standardAndroidProduct()];
    },
  });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const firstPromise = h.session.purchase("vyd_professional_yearly");
  await startedP;
  const secondResult = await h.session.purchase("vyd_professional_yearly");
  assert.equal(secondResult.kind, "already_in_flight");
  g.release();
  const firstResult = await firstPromise;
  assert.equal(firstResult.kind, "sheet_launched");
  assert.equal(h.calls.prepareAndroid, 1);
  assert.equal(h.calls.requestPurchase.length, 1);
}

async function testRestoreBlockedWhilePurchaseInFlight() {
  const g = gate();
  let started = () => {};
  const startedP = new Promise<void>((resolve) => {
    started = resolve;
  });
  const h = createHarness({
    platform: "android",
    requestPurchase: async () => {
      started();
      await g.wait;
    },
  });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const getAvailableBefore = h.calls.getAvailable;
  const purchaseP = h.session.purchase("vyd_professional_yearly");
  await startedP;
  const lastBefore = h.session.getView().lastResult;
  const restore = await h.session.restorePurchases();
  assert.equal(restore.kind, "already_in_flight");
  assert.equal(h.calls.getAvailable, getAvailableBefore);
  assert.equal(h.session.getView().pending?.uid, "uid-a");
  assert.equal(h.session.getView().pending?.stage, "intent_created");
  assert.equal(h.session.getView().purchaseInFlight, true);
  assert.equal(h.session.getView().lastResult, lastBefore);
  assert.equal(h.calls.validateAndroid.length, 0);
  g.release();
  const launched = await purchaseP;
  assert.equal(launched.kind, "sheet_launched");
  h.emitError({ code: "user-cancelled", message: "cancelled" });
  await flushAsync();
  assert.equal(h.session.getView().purchaseInFlight, false);
  const restoreAfter = await h.session.restorePurchases();
  assert.equal(restoreAfter.kind, "verified");
  assert.ok(h.calls.getAvailable > getAvailableBefore);
  assert.equal(h.calls.validateAndroid.length, 0);
}

async function testPurchaseBlockedDuringDurableRecovery() {
  const pendingEnv = {
    version: 1,
    uid: "uid-a",
    platform: "android" as const,
    canonicalSku: "vyd_professional_yearly" as const,
    productId: "vyd_professional",
    androidBasePlanId: "yearly" as const,
    stage: "store_pending" as const,
    initiatedAt: 1,
    updatedAt: 1,
  };
  const g = gate();
  let started = () => {};
  const startedP = new Promise<void>((resolve) => {
    started = resolve;
  });
  const h = createHarness({
    platform: "android",
    getAvailablePurchases: async () => {
      started();
      await g.wait;
      return [];
    },
  });
  h.store.data[PENDING_PURCHASE_CACHE_KEY] = JSON.stringify(pendingEnv);
  const authP = h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  await startedP;
  const buy = await h.session.purchase("vyd_professional_monthly");
  assert.equal(buy.kind, "already_in_flight");
  assert.equal(h.calls.requestPurchase.length, 0);
  assert.equal(h.calls.prepareAndroid, 0);
  assert.equal(h.session.getView().pending?.stage, "store_pending");
  g.release();
  await authP;
  assert.equal(h.session.getView().pending?.stage, "store_pending");
  const after = await h.session.purchase("vyd_professional_yearly");
  assert.equal(after.kind, "already_in_flight");
  assert.equal(h.calls.requestPurchase.length, 0);
}

async function testPurchaseWorksAfterEmptyRecovery() {
  const h = createHarness({ platform: "android" });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const result = await h.session.purchase("vyd_professional_yearly");
  assert.equal(result.kind, "sheet_launched");
  assert.equal(h.calls.requestPurchase.length, 1);
}

async function testInitAFalseThenBTrue() {
  let resolveA = (_value: boolean) => {};
  let firstInit = true;
  let started = () => {};
  const startedP = new Promise<void>((resolve) => {
    started = resolve;
  });
  const h = createHarness({
    platform: "android",
    initConnection: async () => {
      if (firstInit) {
        firstInit = false;
        started();
        return new Promise<boolean>((resolve) => {
          resolveA = resolve;
        });
      }
      return true;
    },
  });
  const authA = h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  await startedP;
  assert.equal(h.calls.initInFlight, 1);
  const authB = h.session.setAuth({ status: "signed_in", uid: "uid-b" });
  await flushAsync();
  assert.equal(h.calls.initInFlight, 1);
  assert.equal(h.calls.init, 1);
  assert.equal(h.calls.maxConcurrentInit, 1);
  resolveA(false);
  await authA;
  await authB;
  assert.equal(h.calls.initInFlight, 0);
  assert.equal(h.calls.maxConcurrentInit, 1);
  assert.equal(h.session.getView().ownerUid, "uid-b");
  assert.equal(h.session.getView().connected, true);
  assert.equal(h.calls.activePurchaseListeners, 1);
  assert.equal(h.calls.activeErrorListeners, 1);
  assert.equal(h.calls.purchaseListeners, 1);
  assert.equal(h.calls.errorListeners, 1);
}

async function testSameGenerationInitCoalesces() {
  const g = gate();
  let started = () => {};
  const startedP = new Promise<void>((resolve) => {
    started = resolve;
  });
  let bothFetching = () => {};
  const bothFetchingP = new Promise<void>((resolve) => {
    bothFetching = resolve;
  });
  let initN = 0;
  let fetchN = 0;
  let inFetch = 0;
  const h = createHarness({
    platform: "android",
    initConnection: async () => {
      initN += 1;
      if (initN >= 2) {
        started();
        await g.wait;
      }
      return true;
    },
    fetchProducts: async () => {
      fetchN += 1;
      if (fetchN <= 2) {
        inFetch += 1;
        if (inFetch === 2) bothFetching();
        await bothFetchingP;
        const err = new Error("disconnected");
        (err as { code?: string }).code = "service-disconnected";
        throw err;
      }
      return [standardAndroidProduct()];
    },
  });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const c1 = h.session.loadCatalog();
  const c2 = h.session.loadCatalog();
  await bothFetchingP;
  await startedP;
  assert.equal(h.calls.initInFlight, 1);
  assert.equal(h.calls.maxConcurrentInit, 1);
  assert.equal(h.calls.init, 2);
  g.release();
  await c1;
  await c2;
  assert.equal(h.calls.initInFlight, 0);
  assert.equal(h.calls.maxConcurrentInit, 1);
  assert.equal(h.calls.init, 2);
  assert.equal(h.calls.activePurchaseListeners, 1);
  assert.equal(h.calls.activeErrorListeners, 1);
}

function starterAndroidPurchase(): StorePurchase {
  return {
    store: "google",
    productId: "vyd_starter",
    purchaseState: "purchased",
    purchaseToken: "starter-token",
    nativePurchase: {},
  };
}

async function testRestoreFirstBlocksPurchaseDuringValidation() {
  const g = gate();
  let started = () => {};
  const startedP = new Promise<void>((resolve) => {
    started = resolve;
  });
  const h = createHarness({
    platform: "android",
    availablePurchases: [
      {
        store: "google",
        productId: "vyd_professional",
        purchaseState: "purchased",
        purchaseToken: "restore-token",
        nativePurchase: {},
      },
    ],
    validateAndActivateAndroid: async () => {
      started();
      await g.wait;
      return { alreadyProcessed: false, acknowledged: true };
    },
  });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const restoreP = h.session.restorePurchases();
  await startedP;
  const buy = await h.session.purchase("vyd_professional_yearly");
  assert.equal(buy.kind, "already_in_flight");
  assert.equal(h.calls.prepareAndroid, 0);
  assert.equal(h.calls.requestPurchase.length, 0);
  assert.equal(h.store.data[PENDING_PURCHASE_CACHE_KEY], undefined);
  g.release();
  const restored = await restoreP;
  assert.equal(restored.kind, "verified");
  assert.equal(h.calls.requestPurchase.length, 0);
  const after = await h.session.purchase("vyd_professional_yearly");
  assert.equal(after.kind, "sheet_launched");
  assert.equal(h.calls.prepareAndroid, 1);
  assert.equal(h.calls.requestPurchase.length, 1);
}

async function testUnrelatedPurchasedEventDoesNotReleaseLock() {
  const h = createHarness({ platform: "android" });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const first = await h.session.purchase("vyd_professional_yearly");
  assert.equal(first.kind, "sheet_launched");
  assert.equal(h.session.getView().purchaseInFlight, true);
  const pendingBefore = h.session.getView().pending;
  const lastBefore = h.session.getView().lastResult;
  h.emitPurchase(starterAndroidPurchase());
  await flushAsync();
  assert.equal(h.session.getView().purchaseInFlight, true);
  assert.equal(h.session.getView().pending?.canonicalSku, "vyd_professional_yearly");
  assert.equal(h.session.getView().pending?.stage, pendingBefore?.stage);
  assert.equal(h.session.getView().lastResult, lastBefore);
  assert.ok(h.store.data[PENDING_PURCHASE_CACHE_KEY]);
  const second = await h.session.purchase("vyd_professional_monthly");
  assert.equal(second.kind, "already_in_flight");
  assert.equal(h.calls.requestPurchase.length, 1);
}

async function testConcurrentRestoresSingleOwner() {
  const g = gate();
  let started = () => {};
  const startedP = new Promise<void>((resolve) => {
    started = resolve;
  });
  const h = createHarness({
    platform: "android",
    getAvailablePurchases: async () => {
      started();
      await g.wait;
      return [];
    },
  });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const first = h.session.restorePurchases();
  await startedP;
  const second = await h.session.restorePurchases();
  assert.equal(second.kind, "already_in_flight");
  assert.equal(h.calls.getAvailable, 1);
  g.release();
  const done = await first;
  assert.equal(done.kind, "verified");
}

async function testRestoreAuthChangeDoesNotMutateNewerSession() {
  const g = gate();
  let started = () => {};
  const startedP = new Promise<void>((resolve) => {
    started = resolve;
  });
  const h = createHarness({
    platform: "android",
    getAvailablePurchases: async () => {
      started();
      await g.wait;
      return [];
    },
  });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const restoreA = h.session.restorePurchases();
  await startedP;
  await h.session.setAuth({ status: "signed_in", uid: "uid-b" });
  const bLast = h.session.getView().lastResult;
  g.release();
  await restoreA;
  assert.equal(h.session.getView().ownerUid, "uid-b");
  assert.equal(h.session.getView().lastResult, bLast);
  assert.equal(h.session.getView().purchaseInFlight, false);
}

async function testUnrelatedPendingAndUnknownDoNotPatchActivePending() {
  const h = createHarness({ platform: "android" });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  await h.session.purchase("vyd_professional_yearly");
  h.emitPurchase({
    ...starterAndroidPurchase(),
    purchaseState: "pending",
    purchaseToken: "starter-pending",
  });
  await flushAsync();
  assert.equal(h.session.getView().pending?.stage, "intent_created");
  h.emitPurchase({
    ...starterAndroidPurchase(),
    purchaseState: "unknown",
    purchaseToken: "starter-unknown",
  });
  await flushAsync();
  assert.equal(h.session.getView().pending?.stage, "intent_created");
  assert.equal(h.session.getView().purchaseInFlight, true);
}

async function testMismatchedProductErrorPreservesPurchase() {
  const h = createHarness({ platform: "android" });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  await h.session.purchase("vyd_professional_yearly");
  h.emitError({
    code: "billing-unavailable",
    message: "other sku failed",
    productId: "vyd_starter",
  });
  await flushAsync();
  assert.equal(h.session.getView().purchaseInFlight, true);
  assert.equal(h.session.getView().pending?.canonicalSku, "vyd_professional_yearly");
  const second = await h.session.purchase("vyd_professional_monthly");
  assert.equal(second.kind, "already_in_flight");
  assert.equal(h.calls.requestPurchase.length, 1);
  h.emitError({
    code: "user-cancelled",
    message: "cancelled",
    productId: "vyd_professional",
  });
  await flushAsync();
  assert.equal(h.session.getView().purchaseInFlight, false);
  const retry = await h.session.purchase("vyd_professional_monthly");
  assert.equal(retry.kind, "sheet_launched");
  assert.equal(h.calls.requestPurchase.length, 2);
}

async function testLateRequestRejectDoesNotKillNewerAttempt() {
  let n = 0;
  const g = gate();
  let started = () => {};
  const startedP = new Promise<void>((resolve) => {
    started = resolve;
  });
  const h = createHarness({
    platform: "android",
    requestPurchase: async () => {
      n += 1;
      if (n === 1) {
        started();
        await g.wait;
        throw new Error("stale first request");
      }
    },
  });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const firstP = h.session.purchase("vyd_professional_yearly");
  await startedP;
  h.emitError({ code: "user-cancelled", message: "cancelled", productId: "vyd_professional" });
  await flushAsync();
  assert.equal(h.session.getView().purchaseInFlight, false);
  const second = await h.session.purchase("vyd_professional_monthly");
  assert.equal(second.kind, "sheet_launched");
  const secondPending = h.session.getView().pending;
  const secondLast = h.session.getView().lastResult;
  g.release();
  await firstP;
  assert.equal(h.session.getView().purchaseInFlight, true);
  assert.equal(h.session.getView().pending?.canonicalSku, secondPending?.canonicalSku);
  assert.equal(h.session.getView().lastResult, secondLast);
  assert.equal(h.calls.requestPurchase.length, 2);
  const persisted = JSON.parse(h.store.data[PENDING_PURCHASE_CACHE_KEY] as string);
  assert.equal(persisted.canonicalSku, "vyd_professional_monthly");
  assert.equal(persisted.initiatedAt, secondPending?.initiatedAt);
}

async function testRestoreFailureReleasesOwnerAndAllowsPurchase() {
  const h = createHarness({
    platform: "android",
    getAvailablePurchases: async () => {
      throw new Error("store query failed");
    },
  });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const restore = await h.session.restorePurchases();
  assert.equal(restore.kind, "failed");
  assert.equal(h.session.getView().purchaseInFlight, false);
  assert.equal(h.calls.validateAndroid.length, 0);
  const buy = await h.session.purchase("vyd_professional_yearly");
  assert.equal(buy.kind, "sheet_launched");
  assert.equal(h.calls.requestPurchase.length, 1);
}

async function testRestoreIgnoresUnidentifiedPurchaseError() {
  const g = gate();
  let started = () => {};
  const startedP = new Promise<void>((resolve) => {
    started = resolve;
  });
  const h = createHarness({
    platform: "android",
    getAvailablePurchases: async () => {
      started();
      await g.wait;
      return [];
    },
  });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const restoreP = h.session.restorePurchases();
  await startedP;
  const lastBefore = h.session.getView().lastResult;
  h.emitError({ code: "billing-unavailable", message: "store failed" });
  await flushAsync();
  assert.equal(h.session.getView().purchaseInFlight, true);
  assert.equal(h.session.getView().lastResult, lastBefore);
  const buy = await h.session.purchase("vyd_professional_yearly");
  assert.equal(buy.kind, "already_in_flight");
  assert.equal(h.calls.requestPurchase.length, 0);
  g.release();
  const restored = await restoreP;
  assert.equal(restored.kind, "verified");
  assert.equal(h.session.getView().purchaseInFlight, false);
}

function readPersistedPending(store: { data: Record<string, string> }) {
  const raw = store.data[PENDING_PURCHASE_CACHE_KEY];
  return raw ? JSON.parse(raw) : undefined;
}

function yearlyIosProduct(): StoreProductLike {
  return {
    id: "com.specialsoftwares.vyaamikkdiary.professional.yearly",
    type: "subs",
    platform: "ios",
    displayPrice: "$19.99",
    currency: "USD",
    introductoryPricePaymentModeIOS: "empty",
  };
}

function monthlyIosProduct(): StoreProductLike {
  return {
    id: "com.specialsoftwares.vyaamikkdiary.professional.monthly",
    type: "subs",
    platform: "ios",
    displayPrice: "$9.99",
    currency: "USD",
    introductoryPricePaymentModeIOS: "empty",
  };
}

function yearlyAndroidPurchase(): StorePurchase {
  return {
    store: "google",
    productId: "vyd_professional",
    purchaseState: "purchased",
    purchaseToken: "yearly-token",
    nativePurchase: {},
  };
}

function createStaleGetStore(): IapKeyValueStore & {
  data: Record<string, string>;
  deferNextGet: () => void;
  waitForGet: () => Promise<void>;
  releaseGet: () => void;
} {
  const data: Record<string, string> = {};
  let defer = false;
  let started = () => {};
  let startedP = Promise.resolve();
  let release = () => {};
  let gate = Promise.resolve();
  return {
    data,
    deferNextGet() {
      defer = true;
      startedP = new Promise((resolve) => {
        started = resolve;
      });
      gate = new Promise((resolve) => {
        release = resolve;
      });
    },
    waitForGet: () => startedP,
    releaseGet: () => release(),
    async getItem(key) {
      const value = Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
      if (defer) {
        defer = false;
        const captured = value;
        started();
        await gate;
        return captured;
      }
      return value;
    },
    async setItem(key, value) {
      data[key] = value;
    },
    async removeItem(key) {
      delete data[key];
    },
  };
}

async function testRetiredPrepareDoesNotWriteOrLaunch() {
  let first = true;
  const g = gate();
  let started = () => {};
  const startedP = new Promise<void>((resolve) => {
    started = resolve;
  });
  const h = createHarness({
    platform: "android",
    prepareAndroidBillingAccount: async () => {
      if (first) {
        first = false;
        started();
        await g.wait;
      }
      return { obfuscatedAccountId: "obf-server-aaa" };
    },
  });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const firstP = h.session.purchase("vyd_professional_yearly");
  await startedP;
  h.emitError({ code: "billing-unavailable", message: "store failed" });
  await flushAsync();
  assert.equal(h.session.getView().purchaseInFlight, false);
  const second = await h.session.purchase("vyd_professional_monthly");
  assert.equal(second.kind, "sheet_launched");
  assert.equal(h.calls.requestPurchase.length, 1);
  const secondPending = h.session.getView().pending;
  g.release();
  await firstP;
  assert.equal(h.calls.requestPurchase.length, 1);
  assert.equal(h.session.getView().pending?.canonicalSku, "vyd_professional_monthly");
  assert.equal(h.session.getView().pending?.initiatedAt, secondPending?.initiatedAt);
  assert.equal(readPersistedPending(h.store)?.canonicalSku, "vyd_professional_monthly");
  assert.equal(h.session.getView().purchaseInFlight, true);
}

async function testIosRetiredPrepareDoesNotWriteOrLaunch() {
  let first = true;
  const g = gate();
  let started = () => {};
  const startedP = new Promise<void>((resolve) => {
    started = resolve;
  });
  const h = createHarness({
    platform: "ios",
    products: [yearlyIosProduct(), monthlyIosProduct()],
    prepareIOSBillingAccount: async () => {
      if (first) {
        first = false;
        started();
        await g.wait;
      }
      return { appAccountToken: "22222222-2222-4222-8222-222222222222" };
    },
  });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const firstP = h.session.purchase("vyd_professional_yearly");
  await startedP;
  h.emitError({ code: "billing-unavailable", message: "store failed" });
  await flushAsync();
  const second = await h.session.purchase("vyd_professional_monthly");
  assert.equal(second.kind, "sheet_launched");
  g.release();
  await firstP;
  assert.equal(h.calls.requestPurchase.length, 1);
  assert.equal(h.session.getView().pending?.canonicalSku, "vyd_professional_monthly");
  assert.equal(readPersistedPending(h.store)?.canonicalSku, "vyd_professional_monthly");
}

async function testStaleProcessorSuccessDoesNotClearNewerPending() {
  const g = gate();
  let started = () => {};
  const startedP = new Promise<void>((resolve) => {
    started = resolve;
  });
  const h = createHarness({
    platform: "android",
    validateAndActivateAndroid: async () => {
      started();
      await g.wait;
      return { alreadyProcessed: false, acknowledged: true };
    },
  });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  await h.session.purchase("vyd_professional_yearly");
  h.emitPurchase(yearlyAndroidPurchase());
  await startedP;
  h.emitError({ code: "billing-unavailable", message: "store failed" });
  await flushAsync();
  assert.equal(h.session.getView().purchaseInFlight, false);
  const second = await h.session.purchase("vyd_professional_monthly");
  assert.equal(second.kind, "sheet_launched");
  assert.equal(h.session.getView().purchaseInFlight, true);
  const secondPending = h.session.getView().pending;
  g.release();
  await flushAsync();
  assert.equal(h.session.getView().purchaseInFlight, true);
  assert.equal(h.session.getView().pending?.canonicalSku, "vyd_professional_monthly");
  assert.equal(h.session.getView().lastResult?.kind, "sheet_launched");
  assert.equal(readPersistedPending(h.store)?.canonicalSku, "vyd_professional_monthly");
  assert.equal(readPersistedPending(h.store)?.initiatedAt, secondPending?.initiatedAt);
}

async function testStaleProcessorFailureDoesNotPatchNewerPending() {
  const g = gate();
  let started = () => {};
  const startedP = new Promise<void>((resolve) => {
    started = resolve;
  });
  const h = createHarness({
    platform: "android",
    validateAndActivateAndroid: async () => {
      started();
      await g.wait;
      throw new Error("backend down");
    },
  });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  await h.session.purchase("vyd_professional_yearly");
  h.emitPurchase(yearlyAndroidPurchase());
  await startedP;
  h.emitError({ code: "billing-unavailable", message: "store failed" });
  await flushAsync();
  const second = await h.session.purchase("vyd_professional_monthly");
  assert.equal(second.kind, "sheet_launched");
  g.release();
  await flushAsync();
  assert.equal(h.session.getView().pending?.canonicalSku, "vyd_professional_monthly");
  assert.equal(h.session.getView().pending?.stage, "intent_created");
  assert.equal(readPersistedPending(h.store)?.canonicalSku, "vyd_professional_monthly");
  assert.equal(readPersistedPending(h.store)?.stage, "intent_created");
}

async function testDelayedCompensationReadDoesNotDeleteNewerEnvelope() {
  const clock = { now: 101 };
  const store = createStaleGetStore();
  let firstRequest = true;
  const requestG = gate();
  const validateG = gate();
  let requestStarted = () => {};
  const requestStartedP = new Promise<void>((resolve) => {
    requestStarted = resolve;
  });
  let validateStarted = () => {};
  const validateStartedP = new Promise<void>((resolve) => {
    validateStarted = resolve;
  });
  const h = createHarness({
    platform: "android",
    store,
    now: () => clock.now,
    requestPurchase: async () => {
      if (firstRequest) {
        firstRequest = false;
        requestStarted();
        await requestG.wait;
        throw new Error("stale first request");
      }
    },
    validateAndActivateAndroid: async () => {
      validateStarted();
      await validateG.wait;
      return { alreadyProcessed: false, acknowledged: true };
    },
  });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const firstP = h.session.purchase("vyd_professional_yearly");
  await requestStartedP;
  h.emitPurchase({
    ...yearlyAndroidPurchase(),
    purchaseState: "purchased",
  });
  await validateStartedP;
  h.emitError({ code: "user-cancelled", message: "cancelled", productId: "vyd_professional" });
  await flushAsync();
  assert.equal(h.session.getView().purchaseInFlight, false);
  store.deferNextGet();
  requestG.release();
  await store.waitForGet();
  clock.now = 104;
  const second = await h.session.purchase("vyd_professional_monthly");
  assert.equal(second.kind, "sheet_launched");
  assert.equal(readPersistedPending(store)?.initiatedAt, 104);
  store.releaseGet();
  await firstP;
  validateG.release();
  await flushAsync();
  const persisted = readPersistedPending(store);
  assert.equal(persisted?.canonicalSku, "vyd_professional_monthly");
  assert.equal(persisted?.initiatedAt, 104);
  assert.equal(h.session.getView().pending?.initiatedAt, 104);
  assert.equal(h.session.getView().purchaseInFlight, true);
}

async function testIosVerifiedUnfinishedSurvivesRequestSettlement() {
  const g = gate();
  let started = () => {};
  const startedP = new Promise<void>((resolve) => {
    started = resolve;
  });
  const h = createHarness({
    platform: "ios",
    products: [yearlyIosProduct(), monthlyIosProduct()],
    requestPurchase: async () => {
      started();
      await g.wait;
    },
    finishTransactionIOS: async () => {
      throw new Error("finish failed");
    },
  });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const firstP = h.session.purchase("vyd_professional_yearly");
  await startedP;
  h.emitPurchase({
    store: "apple",
    productId: "com.specialsoftwares.vyaamikkdiary.professional.yearly",
    purchaseState: "purchased",
    purchaseToken: "header.payload.signature",
    nativePurchase: {},
  });
  await flushAsync();
  assert.equal(h.session.getView().pending?.stage, "verified_unfinished_ios");
  assert.equal(readPersistedPending(h.store)?.stage, "verified_unfinished_ios");
  g.release();
  await firstP;
  assert.equal(readPersistedPending(h.store)?.stage, "verified_unfinished_ios");
  assert.equal(h.session.getView().pending?.stage, "verified_unfinished_ios");
  const recovered = createHarness({
    platform: "ios",
    products: [yearlyIosProduct(), monthlyIosProduct()],
    store: h.store,
    finishTransactionIOS: async () => {},
    availablePurchases: [
      {
        store: "apple",
        productId: "com.specialsoftwares.vyaamikkdiary.professional.yearly",
        purchaseState: "purchased",
        purchaseToken: "header.payload.signature",
        nativePurchase: {},
      },
    ],
  });
  await recovered.session.setAuth({ status: "signed_in", uid: "uid-a" });
  assert.equal(recovered.calls.finishIos >= 1, true);
}

async function testAndroidStorePendingSurvivesRequestSettlement() {
  const g = gate();
  let started = () => {};
  const startedP = new Promise<void>((resolve) => {
    started = resolve;
  });
  const h = createHarness({
    platform: "android",
    requestPurchase: async () => {
      started();
      await g.wait;
      throw new Error("request later failed");
    },
  });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const firstP = h.session.purchase("vyd_professional_yearly");
  await startedP;
  h.emitPurchase({
    ...yearlyAndroidPurchase(),
    purchaseState: "pending",
    purchaseToken: "pending-token",
  });
  await flushAsync();
  assert.equal(h.session.getView().pending?.stage, "store_pending");
  g.release();
  await firstP;
  assert.equal(readPersistedPending(h.store)?.stage, "store_pending");
  assert.equal(h.session.getView().pending?.stage, "store_pending");
}

async function testRestoreFinalEmittedViewReleasesLock() {
  const h = createHarness({ platform: "android" });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const restore = await h.session.restorePurchases();
  assert.equal(restore.kind, "verified");
  assert.equal(h.session.getView().purchaseInFlight, false);
  const last = h.views[h.views.length - 1];
  assert.equal(last?.purchaseInFlight, false);
  assert.equal(last?.lastResult?.kind, "verified");
}

async function testFailedRestoreFinalEmittedViewReleasesLock() {
  const h = createHarness({
    platform: "android",
    getAvailablePurchases: async () => {
      throw new Error("store query failed");
    },
  });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const restore = await h.session.restorePurchases();
  assert.equal(restore.kind, "failed");
  const last = h.views[h.views.length - 1];
  assert.equal(last?.purchaseInFlight, false);
  assert.equal(last?.lastResult?.kind, "failed");
  assert.equal(h.session.getView().purchaseInFlight, false);
}

async function testStaleRestoreCleanupDoesNotEmitOverNewerOwner() {
  const g = gate();
  let started = () => {};
  const startedP = new Promise<void>((resolve) => {
    started = resolve;
  });
  const h = createHarness({
    platform: "android",
    getAvailablePurchases: async () => {
      started();
      await g.wait;
      return [];
    },
  });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const restoreA = h.session.restorePurchases();
  await startedP;
  await h.session.setAuth({ status: "signed_in", uid: "uid-b" });
  const viewsBefore = h.views.length;
  const lastBefore = h.views[h.views.length - 1];
  g.release();
  await restoreA;
  assert.equal(h.session.getView().ownerUid, "uid-b");
  assert.equal(h.session.getView().lastResult, lastBefore?.lastResult ?? null);
  const newer = h.views.slice(viewsBefore);
  assert.equal(
    newer.every((view) => view.ownerUid === "uid-b"),
    true
  );
}

async function testRetiredCatalogLoadDoesNotWriteOrLaunch() {
  let first = true;
  const g = gate();
  let started = () => {};
  const startedP = new Promise<void>((resolve) => {
    started = resolve;
  });
  const h = createHarness({
    platform: "android",
    fetchProducts: async () => {
      if (first) {
        first = false;
        started();
        await g.wait;
      }
      return [standardAndroidProduct()];
    },
  });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const firstP = h.session.purchase("vyd_professional_yearly");
  await startedP;
  h.emitError({ code: "billing-unavailable", message: "store failed" });
  await flushAsync();
  const second = await h.session.purchase("vyd_professional_monthly");
  assert.equal(second.kind, "sheet_launched");
  const secondPending = h.session.getView().pending;
  g.release();
  await firstP;
  assert.equal(h.calls.requestPurchase.length, 1);
  assert.equal(h.session.getView().pending?.canonicalSku, "vyd_professional_monthly");
  assert.equal(readPersistedPending(h.store)?.canonicalSku, "vyd_professional_monthly");
  assert.equal(readPersistedPending(h.store)?.initiatedAt, secondPending?.initiatedAt);
}

async function testRetiredPendingWriteDoesNotLaunchOrOverwrite() {
  let first = true;
  const g = gate();
  let started = () => {};
  const startedP = new Promise<void>((resolve) => {
    started = resolve;
  });
  const store = memoryStore();
  const origSet = store.setItem.bind(store);
  store.setItem = async (key, value) => {
    if (key === PENDING_PURCHASE_CACHE_KEY && first) {
      first = false;
      started();
      await g.wait;
    }
    return origSet(key, value);
  };
  const h = createHarness({ platform: "android", store });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const firstP = h.session.purchase("vyd_professional_yearly");
  await startedP;
  h.emitError({ code: "billing-unavailable", message: "store failed" });
  await flushAsync();
  const second = await h.session.purchase("vyd_professional_monthly");
  assert.equal(second.kind, "sheet_launched");
  const secondPending = h.session.getView().pending;
  g.release();
  await firstP;
  assert.equal(h.calls.requestPurchase.length, 1);
  assert.equal(h.session.getView().pending?.canonicalSku, "vyd_professional_monthly");
  assert.equal(readPersistedPending(store)?.canonicalSku, "vyd_professional_monthly");
  assert.equal(readPersistedPending(store)?.initiatedAt, secondPending?.initiatedAt);
}

async function testStrayPurchasedEventDoesNotOverwriteLaterPurchase() {
  const g = gate();
  let started = () => {};
  const startedP = new Promise<void>((resolve) => {
    started = resolve;
  });
  const h = createHarness({
    platform: "android",
    validateAndActivateAndroid: async () => {
      started();
      await g.wait;
      return { alreadyProcessed: false, acknowledged: true };
    },
  });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  h.emitPurchase(yearlyAndroidPurchase());
  await startedP;
  const second = await h.session.purchase("vyd_professional_monthly");
  assert.equal(second.kind, "sheet_launched");
  const secondPending = h.session.getView().pending;
  g.release();
  await flushAsync();
  assert.equal(h.session.getView().purchaseInFlight, true);
  assert.equal(h.session.getView().pending?.canonicalSku, "vyd_professional_monthly");
  assert.equal(h.session.getView().lastResult?.kind, "sheet_launched");
  assert.equal(readPersistedPending(h.store)?.canonicalSku, "vyd_professional_monthly");
  assert.equal(readPersistedPending(h.store)?.initiatedAt, secondPending?.initiatedAt);
}

async function testIosRestoreFinalEmittedViewReleasesLock() {
  const h = createHarness({
    platform: "ios",
    products: [yearlyIosProduct(), monthlyIosProduct()],
  });
  await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
  const restore = await h.session.restorePurchases();
  assert.equal(restore.kind, "verified");
  const last = h.views[h.views.length - 1];
  assert.equal(last?.purchaseInFlight, false);
  assert.equal(last?.lastResult?.kind, "verified");
  assert.equal(h.session.getView().purchaseInFlight, false);
}

async function main() {
  const tests: [string, () => Promise<void>][] = [
    ["testNoPurchaseSheetOnStartup", testNoPurchaseSheetOnStartup],
    ["testExpoGoAndWebUnsupported", testExpoGoAndWebUnsupported],
    ["testAndroidPrepareAndPendingBeforeSheet", testAndroidPrepareAndPendingBeforeSheet],
    ["testIosPrepareUuidAndPendingBeforeSheet", testIosPrepareUuidAndPendingBeforeSheet],
    ["testOnePurchaseAtATime", testOnePurchaseAtATime],
    ["testRecoveryQueriesStoreAndValidates", testRecoveryQueriesStoreAndValidates],
    ["testEmptyRestoreDoesNotInventSuccessRevoke", testEmptyRestoreDoesNotInventSuccessRevoke],
    ["testFailedStoreQueryDoesNotValidate", testFailedStoreQueryDoesNotValidate],
    ["testLogoutIsolatesPending", testLogoutIsolatesPending],
    ["testStaleAPurchaseDoesNotLaunchSheetAfterB", testStaleAPurchaseDoesNotLaunchSheetAfterB],
    ["testColdStartBCanPurchaseAfterOrphanedA", testColdStartBCanPurchaseAfterOrphanedA],
    ["testInitConnectionFalseDoesNotConnectOrRecover", testInitConnectionFalseDoesNotConnectOrRecover],
    ["testStaleAInitDoesNotOrphanConnection", testStaleAInitDoesNotOrphanConnection],
    ["testStaleAInitDoesNotTearDownB", testStaleAInitDoesNotTearDownB],
    ["testBoundedReconnectDoesNotAutoLaunchPurchase", testBoundedReconnectDoesNotAutoLaunchPurchase],
    ["testNonCancelListenerErrorReleasesFlowLock", testNonCancelListenerErrorReleasesFlowLock],
    ["testRequestPurchaseFailureIsRetryable", testRequestPurchaseFailureIsRetryable],
    ["testRequestPurchaseUserCancelledByCode", testRequestPurchaseUserCancelledByCode],
    ["testEmptyRecoveryClearsAbandonedIntent", testEmptyRecoveryClearsAbandonedIntent],
    ["testEmptyRecoveryClearsAwaitingRecovery", testEmptyRecoveryClearsAwaitingRecovery],
    ["testFailedRecoveryQueryKeepsRecoverableState", testFailedRecoveryQueryKeepsRecoverableState],
    ["testStorePendingSurvivesEmptyAndFailedRecovery", testStorePendingSurvivesEmptyAndFailedRecovery],
    ["testVerifiedUnfinishedIosSurvivesUntilFinish", testVerifiedUnfinishedIosSurvivesUntilFinish],
    ["testStaleARequestResolveDoesNotReleaseBLock", testStaleARequestResolveDoesNotReleaseBLock],
    ["testStaleARequestRejectDoesNotReleaseBLock", testStaleARequestRejectDoesNotReleaseBLock],
    ["testStalePrepareDoesNotClearBPurchase", testStalePrepareDoesNotClearBPurchase],
    ["testStaleCatalogDoesNotClearBCatalog", testStaleCatalogDoesNotClearBCatalog],
    ["testStaleRestoreDoesNotOverwriteBLastResult", testStaleRestoreDoesNotOverwriteBLastResult],
    ["testOldAuthCleanupDoesNotCloseNewAuth", testOldAuthCleanupDoesNotCloseNewAuth],
    ["testAuthChangeDuringEndConnection", testAuthChangeDuringEndConnection],
    ["testStaleInitAfterNewInitFalseCleansUp", testStaleInitAfterNewInitFalseCleansUp],
    ["testIosATokenDoesNotContaminateBSession", testIosATokenDoesNotContaminateBSession],
    ["testConcurrentDoublePurchaseDuringCatalog", testConcurrentDoublePurchaseDuringCatalog],
    ["testIdenticalSkuDoubleTap", testIdenticalSkuDoubleTap],
    ["testRestoreBlockedWhilePurchaseInFlight", testRestoreBlockedWhilePurchaseInFlight],
    ["testPurchaseBlockedDuringDurableRecovery", testPurchaseBlockedDuringDurableRecovery],
    ["testPurchaseWorksAfterEmptyRecovery", testPurchaseWorksAfterEmptyRecovery],
    ["testInitAFalseThenBTrue", testInitAFalseThenBTrue],
    ["testSameGenerationInitCoalesces", testSameGenerationInitCoalesces],
    ["testRestoreFirstBlocksPurchaseDuringValidation", testRestoreFirstBlocksPurchaseDuringValidation],
    ["testUnrelatedPurchasedEventDoesNotReleaseLock", testUnrelatedPurchasedEventDoesNotReleaseLock],
    ["testConcurrentRestoresSingleOwner", testConcurrentRestoresSingleOwner],
    ["testRestoreAuthChangeDoesNotMutateNewerSession", testRestoreAuthChangeDoesNotMutateNewerSession],
    ["testUnrelatedPendingAndUnknownDoNotPatchActivePending", testUnrelatedPendingAndUnknownDoNotPatchActivePending],
    ["testMismatchedProductErrorPreservesPurchase", testMismatchedProductErrorPreservesPurchase],
    ["testLateRequestRejectDoesNotKillNewerAttempt", testLateRequestRejectDoesNotKillNewerAttempt],
    ["testRestoreFailureReleasesOwnerAndAllowsPurchase", testRestoreFailureReleasesOwnerAndAllowsPurchase],
    ["testRestoreIgnoresUnidentifiedPurchaseError", testRestoreIgnoresUnidentifiedPurchaseError],
    ["testRetiredPrepareDoesNotWriteOrLaunch", testRetiredPrepareDoesNotWriteOrLaunch],
    ["testIosRetiredPrepareDoesNotWriteOrLaunch", testIosRetiredPrepareDoesNotWriteOrLaunch],
    ["testStaleProcessorSuccessDoesNotClearNewerPending", testStaleProcessorSuccessDoesNotClearNewerPending],
    ["testStaleProcessorFailureDoesNotPatchNewerPending", testStaleProcessorFailureDoesNotPatchNewerPending],
    ["testDelayedCompensationReadDoesNotDeleteNewerEnvelope", testDelayedCompensationReadDoesNotDeleteNewerEnvelope],
    ["testIosVerifiedUnfinishedSurvivesRequestSettlement", testIosVerifiedUnfinishedSurvivesRequestSettlement],
    ["testAndroidStorePendingSurvivesRequestSettlement", testAndroidStorePendingSurvivesRequestSettlement],
    ["testRestoreFinalEmittedViewReleasesLock", testRestoreFinalEmittedViewReleasesLock],
    ["testFailedRestoreFinalEmittedViewReleasesLock", testFailedRestoreFinalEmittedViewReleasesLock],
    ["testStaleRestoreCleanupDoesNotEmitOverNewerOwner", testStaleRestoreCleanupDoesNotEmitOverNewerOwner],
    ["testRetiredCatalogLoadDoesNotWriteOrLaunch", testRetiredCatalogLoadDoesNotWriteOrLaunch],
    ["testRetiredPendingWriteDoesNotLaunchOrOverwrite", testRetiredPendingWriteDoesNotLaunchOrOverwrite],
    ["testStrayPurchasedEventDoesNotOverwriteLaterPurchase", testStrayPurchasedEventDoesNotOverwriteLaterPurchase],
    ["testIosRestoreFinalEmittedViewReleasesLock", testIosRestoreFinalEmittedViewReleasesLock],
  ];
  for (const [name, fn] of tests) {
    try {
      await fn();
    } catch (error) {
      console.error(`FAIL ${name}`);
      throw error;
    }
  }
  console.log("iapSession.test.ts: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
