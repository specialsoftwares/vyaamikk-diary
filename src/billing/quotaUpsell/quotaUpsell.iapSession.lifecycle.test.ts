/**
 * Production createIapSession connected to the quota-upsell host runtime.
 *
 * Native/store/backend I/O is injected. This is not a mounted React tree,
 * emulator, or device/store acceptance.
 */
import assert from "node:assert/strict";

import { createIapSession } from "@/billing/iap/iapSession";
import type {
  CanonicalSku,
  IapBackend,
  IapKeyValueStore,
  IapNativeAdapter,
  IapView,
  NativePurchaseRequest,
  StoreProductLike,
  StorePurchase,
  StorePurchaseError,
} from "@/billing/iap/iapTypes";
import {
  canDispatchPurchase,
  decideUpgradeSheetDispatch,
  planIdForSku,
  resolveUpgradeCta,
  selectedOfferIsReady,
} from "@/components/billing/upgradePresentation";
import { featuresForPlan } from "@/subscription/subscriptionFeatures";
import { DEFAULT_CLIENT_SUBSCRIPTION } from "@/subscription/types";
import { syncSessionOwnership } from "@/sync/syncSessionOwnership";

import { mapUpgradeSheetModel } from "./mapUpgradeSheetModel";
import {
  notifyOrdinaryQuotaUpsell,
  registerQuotaUpsellPresenter,
} from "./notifyOrdinaryQuotaUpsell";
import { __setQuotaUpsellEnabledForTests } from "./quotaUpsellGate";
import {
  createQuotaUpsellHostRuntime,
  type QuotaUpsellHostRuntime,
} from "./quotaUpsellHostRuntime";
import type { QuotaUpsellRequest } from "./quotaUpsellTypes";

const t = (key: string) => key;
const subscription = {
  status: DEFAULT_CLIENT_SUBSCRIPTION,
  plan: "free" as const,
  features: featuresForPlan("free"),
};

function memoryStore(): IapKeyValueStore & { data: Record<string, string> } {
  const data: Record<string, string> = {};
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

function androidProduct(): StoreProductLike {
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

function yearlyPurchase(): StorePurchase {
  return {
    store: "google",
    productId: "vyd_professional",
    purchaseState: "purchased",
    purchaseToken: "verify-fail-token",
    nativePurchase: {},
  };
}

async function until(predicate: () => boolean, steps = 40): Promise<void> {
  for (let i = 0; i < steps; i += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function quotaReq(over: Partial<QuotaUpsellRequest> = {}): QuotaUpsellRequest {
  return {
    family: "diary",
    origin: "user_save",
    clientRecordId: "diary_iap",
    session: syncSessionOwnership.capture(),
    failureKind: "quota_exhausted",
    ...over,
  };
}

function surface(runtime: QuotaUpsellHostRuntime, iap: IapView) {
  const snap = runtime.snapshot();
  const model = mapUpgradeSheetModel({
    t,
    iap,
    subscription,
    hostPurchaseState: snap.hostPurchaseState,
    hostRestoreState: snap.hostRestoreState,
    hostErrorMessage: snap.hostErrorMessage,
    errorRecoverable: snap.errorRecoverable,
  });
  const selectedSku = model.defaultSku;
  const cta = resolveUpgradeCta({
    trialEligible: model.trialEligible,
    trialActionAvailable: model.trialActionAvailable,
    selectedPlanId: planIdForSku(model.offers, selectedSku),
    purchaseAvailable: model.purchaseAvailable,
    purchaseState: model.purchaseState,
    catalogState: model.catalogState,
    hasError: Boolean(model.errorMessage) && !model.errorRetryEnabled,
  });
  const purchaseEnabled = canDispatchPurchase({
    ctaEnabled: cta.enabled,
    dispatch: cta.dispatch,
    selectedSku,
    selectedOfferReady: selectedOfferIsReady(model.offers, selectedSku),
  });
  const sheet = decideUpgradeSheetDispatch({
    purchaseEnabled,
    trialEnabled: false,
    restoreAvailable: model.restoreAvailable,
    purchaseState: model.purchaseState,
    restoreState: model.restoreState,
    dispatch: cta.dispatch,
    selectedSku,
  });
  return { snap, model, cta, sheet };
}

function createConnectedRuntime(args: {
  validateAndActivateAndroid?: IapBackend["validateAndActivateAndroid"];
}) {
  const store = memoryStore();
  let onPurchase: ((p: StorePurchase) => void) | null = null;
  let onError: ((e: StorePurchaseError) => void) | null = null;
  let runtime: QuotaUpsellHostRuntime | null = null;
  const purchaseRequests: NativePurchaseRequest[] = [];
  let validateAndroidCalls = 0;

  const native: IapNativeAdapter = {
    async initConnection() {
      return true;
    },
    async endConnection() {},
    async fetchProducts() {
      return [androidProduct()];
    },
    async requestPurchase(req) {
      purchaseRequests.push(req);
    },
    async getAvailablePurchases() {
      return [];
    },
    async finishTransactionIOS() {},
    addPurchaseUpdatedListener(listener) {
      onPurchase = listener;
      return () => {
        if (onPurchase === listener) onPurchase = null;
      };
    },
    addPurchaseErrorListener(listener) {
      onError = listener;
      return () => {
        if (onError === listener) onError = null;
      };
    },
  };

  const backend: IapBackend = {
    async prepareAndroidBillingAccount() {
      return { obfuscatedAccountId: "obf-server-aaa" };
    },
    async validateAndActivateAndroid(input) {
      validateAndroidCalls += 1;
      if (args.validateAndActivateAndroid) return args.validateAndActivateAndroid(input);
      return { alreadyProcessed: false, acknowledged: true };
    },
    async prepareIOSBillingAccount() {
      return { appAccountToken: "22222222-2222-4222-8222-222222222222" };
    },
    async validateAndActivateIOS() {
      return { alreadyProcessed: false };
    },
  };

  const session = createIapSession({
    native,
    backend,
    store,
    platform: "android",
    capability: { available: true, reason: null },
    now: () => 100,
    onChange: () => {
      runtime?.reconcile();
    },
  });

  runtime = createQuotaUpsellHostRuntime({
    purchase: (sku: CanonicalSku) => session.purchase(sku),
    restorePurchases: () => session.restorePurchases(),
    getIap: () => session.getView(),
  });

  return {
    session,
    runtime,
    purchaseRequests,
    get validateAndroidCalls() {
      return validateAndroidCalls;
    },
    emitPurchase: (p: StorePurchase) => onPurchase?.(p),
    emitError: (e: StorePurchaseError) => onError?.(e),
  };
}

async function run(): Promise<void> {
  __setQuotaUpsellEnabledForTests(true);
  syncSessionOwnership.resetForTests();

  {
    const h = createConnectedRuntime({});
    h.runtime.attach();
    await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
    await h.session.loadCatalog();
    const sessionA = syncSessionOwnership.beginSession("uid-a");
    const opened = notifyOrdinaryQuotaUpsell(
      quotaReq({ session: sessionA, clientRecordId: "diary_iap" })
    );
    assert.equal(opened.ok, true);

    const launched = await h.runtime.purchase("vyd_professional_yearly");
    assert.equal(launched.kind, "sheet_launched");
    assert.equal(h.purchaseRequests.length, 1);
    const afterLaunch = surface(h.runtime, h.session.getView());
    assert.equal(afterLaunch.model.errorMessage, null);

    h.emitError({ code: "billing-unavailable", message: "store failed" });
    await until(
      () =>
        h.session.getView().lastResult?.kind === "failed" &&
        h.session.getView().purchaseInFlight === false
    );
    const failedView = h.session.getView();
    assert.equal(failedView.lastResult?.kind, "failed");
    const shown = surface(h.runtime, failedView);
    assert.equal(shown.model.errorMessage, "Purchase didn't complete.");
    assert.equal(shown.model.errorRetryEnabled, true);
    assert.equal(shown.model.purchaseState, "idle");
    assert.equal(shown.sheet.primaryEnabled, true);
    assert.equal(shown.sheet.primaryPress.type, "purchase");
    assert.equal(h.runtime.snapshot().saveCalls, 0);
    assert.equal(h.validateAndroidCalls, 0);

    h.runtime.dismiss();
    const reopened = notifyOrdinaryQuotaUpsell(
      quotaReq({ session: sessionA, clientRecordId: "diary_iap" })
    );
    assert.equal(reopened.ok, true);
    const replay = surface(h.runtime, h.session.getView());
    assert.equal(replay.model.errorMessage, null, "dismissed failure is not replayed");

    const retried = await h.runtime.purchase("vyd_professional_yearly");
    assert.equal(retried.kind, "sheet_launched");
    assert.equal(h.purchaseRequests.length, 2);

    h.runtime.dispose();
  }

  {
    const h = createConnectedRuntime({
      validateAndActivateAndroid: async () => {
        throw new Error("backend verify failed");
      },
    });
    h.runtime.attach();
    await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
    await h.session.loadCatalog();
    const sessionA = syncSessionOwnership.beginSession("uid-a");
    assert.equal(
      notifyOrdinaryQuotaUpsell(quotaReq({ session: sessionA, clientRecordId: "diary_verify" })).ok,
      true
    );
    const launched = await h.runtime.purchase("vyd_professional_yearly");
    assert.equal(launched.kind, "sheet_launched");
    h.emitPurchase(yearlyPurchase());
    await until(() => h.session.getView().lastResult?.kind === "failed");
    const shown = surface(h.runtime, h.session.getView());
    assert.equal(shown.model.errorMessage, "Couldn't verify this purchase.");
    assert.equal(shown.model.errorRetryEnabled, true);
    assert.equal(h.runtime.snapshot().saveCalls, 0);
    assert.equal(h.validateAndroidCalls, 1);
    h.runtime.dispose();
  }

  {
    const h = createConnectedRuntime({});
    h.runtime.attach();
    await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
    await h.session.loadCatalog();
    const sessionA = syncSessionOwnership.beginSession("uid-a");
    assert.equal(
      notifyOrdinaryQuotaUpsell(quotaReq({ session: sessionA, clientRecordId: "diary_ab" })).ok,
      true
    );
    const launched = await h.runtime.purchase("vyd_professional_yearly");
    assert.equal(launched.kind, "sheet_launched");

    await h.session.setAuth({ status: "signed_in", uid: "uid-b" });
    await h.session.loadCatalog();
    const sessionB = syncSessionOwnership.beginSession("uid-b");
    h.runtime.reconcile();
    assert.equal(h.runtime.snapshot().visible, false);
    h.emitError({ code: "billing-unavailable", message: "late A error" });
    await until(() => true, 8);
    assert.notEqual(h.session.getView().lastResult?.kind, "failed");
    const admitted = notifyOrdinaryQuotaUpsell(
      quotaReq({
        session: sessionB,
        family: "purchase_order",
        clientRecordId: "po_b_iap",
      })
    );
    assert.equal(admitted.ok, true);
    const bSurface = surface(h.runtime, h.session.getView());
    assert.equal(bSurface.model.errorMessage, null);
    assert.equal(h.runtime.snapshot().visible, true);

    const bLaunch = await h.runtime.purchase("vyd_professional_monthly");
    assert.equal(bLaunch.kind, "sheet_launched");
    h.emitError({ code: "billing-unavailable", message: "late A error" });
    await until(
      () =>
        h.session.getView().lastResult?.kind === "failed" &&
        h.session.getView().purchaseInFlight === false
    );
    const bFailed = surface(h.runtime, h.session.getView());
    assert.equal(bFailed.model.errorMessage, "Purchase didn't complete.");
    assert.equal(h.runtime.snapshot().saveCalls, 0);
    h.runtime.dispose();
  }

  {
    const h = createConnectedRuntime({});
    h.runtime.attach();
    await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
    await h.session.loadCatalog();
    const sessionA1 = syncSessionOwnership.beginSession("uid-a");
    assert.equal(
      notifyOrdinaryQuotaUpsell(quotaReq({ session: sessionA1, clientRecordId: "logout_iap" })).ok,
      true
    );
    const launched = await h.runtime.purchase("vyd_professional_yearly");
    assert.equal(launched.kind, "sheet_launched");
    await h.session.setAuth({ status: "signed_out", uid: null });
    syncSessionOwnership.endSession();
    h.runtime.reconcile();
    assert.equal(h.runtime.snapshot().visible, false);
    await h.session.setAuth({ status: "signed_in", uid: "uid-a" });
    await h.session.loadCatalog();
    const sessionA2 = syncSessionOwnership.beginSession("uid-a");
    h.runtime.reconcile();
    assert.equal(h.runtime.snapshot().visible, false);
    const live = notifyOrdinaryQuotaUpsell(
      quotaReq({ session: sessionA2, clientRecordId: "logout_iap_2" })
    );
    assert.equal(live.ok, true);
    assert.equal(surface(h.runtime, h.session.getView()).model.errorMessage, null);
    h.runtime.dispose();
  }

  registerQuotaUpsellPresenter(null);
  __setQuotaUpsellEnabledForTests(null);
  syncSessionOwnership.resetForTests();
  console.log("quotaUpsell.iapSession.lifecycle.test.ts: ok");
}

void run().catch((error) => {
  console.error(error);
  process.exit(1);
});
