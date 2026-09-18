/**
 * Mounted quota-upsell host lifecycle.
 *
 * Executes the production notify entry, host runtime, controller, and
 * UpgradeSheet mapping with injected IAP/store/backend boundaries.
 *
 * Boundaries:
 * - mocked: IAP purchase/restore, catalog/pending view, subscription snapshot
 * - mounted: createQuotaUpsellHostRuntime + controller + notify presenter
 * - rendered: not in this suite (isolated production host logic, no React tree)
 * - emulator-tested: no
 * - device-tested: no
 */
import assert from "node:assert/strict";

import type {
  CanonicalSku,
  CanonicalSkuAvailability,
  IapView,
  PurchaseFlowResult,
} from "@/billing/iap/iapTypes";
import { ALL_CANONICAL_SKUS } from "@/billing/iap/iapCatalog";
import {
  canDispatchPurchase,
  canDispatchTrial,
  decideUpgradeSheetDispatch,
  planIdForSku,
  resolveUpgradeCta,
  restoreCtaLabel,
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
import { createQuotaUpsellHostRuntime } from "./quotaUpsellHostRuntime";
import type { QuotaUpsellRequest } from "./quotaUpsellTypes";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const t = (key: string) => key;

const readyCatalog: CanonicalSkuAvailability[] = ALL_CANONICAL_SKUS.map((sku) => ({
  canonicalSku: sku,
  available: true,
  unavailableReason: null,
  storeProductId: sku,
  displayPrice: `₹${sku}`,
  currency: "INR",
}));

const subscription = {
  status: DEFAULT_CLIENT_SUBSCRIPTION,
  plan: "free" as const,
  features: featuresForPlan("free"),
};

function baseIap(over: Partial<IapView> = {}): IapView {
  return {
    ownerUid: "uid-a",
    available: true,
    unavailableReason: null,
    connected: true,
    catalog: readyCatalog,
    pending: null,
    lastResult: null,
    purchaseInFlight: false,
    ...over,
  };
}

function quotaReq(over: Partial<QuotaUpsellRequest> = {}): QuotaUpsellRequest {
  return {
    family: "diary",
    origin: "user_save",
    clientRecordId: "diary_1",
    session: syncSessionOwnership.capture(),
    failureKind: "quota_exhausted",
    ...over,
  };
}

function sheetSurface(runtime: ReturnType<typeof createQuotaUpsellHostRuntime>, iap: IapView) {
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
  const trialEnabled = canDispatchTrial({
    ctaEnabled: cta.enabled,
    dispatch: cta.dispatch,
    trialActionAvailable: model.trialActionAvailable,
  });
  const sheet = decideUpgradeSheetDispatch({
    purchaseEnabled,
    trialEnabled,
    restoreAvailable: model.restoreAvailable,
    purchaseState: model.purchaseState,
    restoreState: model.restoreState,
    dispatch: cta.dispatch,
    selectedSku,
  });
  return {
    snap,
    model,
    cta,
    sheet,
    restoreLabel: restoreCtaLabel(t, {
      restoreAvailable: model.restoreAvailable,
      restoreState: model.restoreState,
    }),
  };
}

async function run(): Promise<void> {
  __setQuotaUpsellEnabledForTests(true);
  syncSessionOwnership.resetForTests();

  const iap = baseIap();
  const purchaseCalls: CanonicalSku[] = [];
  const restoreCalls: number[] = [];
  let purchaseImpl: () => Promise<PurchaseFlowResult> = async () => ({ kind: "sheet_launched" });
  let restoreImpl: () => Promise<PurchaseFlowResult> = async () => ({ kind: "sheet_launched" });
  const entitlement = { ...DEFAULT_CLIENT_SUBSCRIPTION };

  const runtime = createQuotaUpsellHostRuntime({
    purchase: async (sku) => {
      purchaseCalls.push(sku);
      return purchaseImpl();
    },
    restorePurchases: async () => {
      restoreCalls.push(1);
      return restoreImpl();
    },
    getIap: () => iap,
  });
  runtime.attach();

  const sessionA1 = syncSessionOwnership.beginSession("uid-a");

  {
    const letterhead = notifyOrdinaryQuotaUpsell(
      quotaReq({ family: "letterhead", clientRecordId: "lh_1", session: sessionA1 })
    );
    const background = notifyOrdinaryQuotaUpsell(
      quotaReq({ origin: "background_sync", clientRecordId: "bg_1", session: sessionA1 })
    );
    assert.equal(letterhead.ok, false);
    assert.equal(background.ok, false);
    assert.equal(runtime.snapshot().visible, false);
  }

  {
    const opened = notifyOrdinaryQuotaUpsell(
      quotaReq({ session: sessionA1, clientRecordId: "diary_1" })
    );
    assert.equal(opened.ok, true);
    assert.equal(runtime.snapshot().visible, true);
    assert.equal(runtime.snapshot().clientRecordId, "diary_1");
    const surface = sheetSurface(runtime, iap);
    assert.equal(surface.model.triggerContext, "recordLimitReached");
    assert.equal(surface.model.trialActionAvailable, false);
    assert.equal(surface.sheet.primaryEnabled, true);
    assert.equal(surface.sheet.primaryPress.type, "purchase");
    assert.equal(surface.cta.labelKey, "billing.upgrade.ctaSubscribe");
    assert.equal(surface.restoreLabel, "billing.upgrade.ctaRestore");
    assert.equal(runtime.snapshot().saveCalls, 0);
  }

  runtime.openEducation();
  assert.equal(runtime.snapshot().educationOpen, true);
  assert.equal(runtime.snapshot().visible, true);
  runtime.closeEducation();
  assert.equal(runtime.snapshot().educationOpen, false);

  {
    const sessionB = syncSessionOwnership.beginSession("uid-b");
    runtime.reconcile();
    assert.equal(runtime.snapshot().visible, false, "A→B retires presentation");
    assert.equal(runtime.snapshot().educationOpen, false);
    const refusedStale = notifyOrdinaryQuotaUpsell(
      quotaReq({ session: sessionA1, clientRecordId: "diary_1" })
    );
    assert.equal(refusedStale.ok, false);
    const admitted = notifyOrdinaryQuotaUpsell(
      quotaReq({
        session: sessionB,
        family: "purchase_order",
        clientRecordId: "po_b",
      })
    );
    assert.equal(admitted.ok, true);
    assert.equal(runtime.snapshot().visible, true);
    assert.equal(runtime.snapshot().clientRecordId, "po_b");
    assert.equal(runtime.snapshot().educationOpen, false);
    runtime.openEducation();
    assert.equal(runtime.snapshot().educationOpen, true);
    runtime.closeEducation();
  }

  {
    runtime.dismiss();
    syncSessionOwnership.endSession();
    runtime.reconcile();
    const sessionA2 = syncSessionOwnership.beginSession("uid-a");
    runtime.reconcile();
    assert.equal(runtime.snapshot().visible, false, "logout→A stays retired until a live request");
    const stale = notifyOrdinaryQuotaUpsell(
      quotaReq({ session: sessionA1, clientRecordId: "after_logout" })
    );
    assert.equal(stale.ok, false);
    const live = notifyOrdinaryQuotaUpsell(
      quotaReq({ session: sessionA2, clientRecordId: "diary_relogin" })
    );
    assert.equal(live.ok, true);
    assert.equal(runtime.snapshot().visible, true);
    assert.equal(runtime.snapshot().educationOpen, false);
  }

  {
    const gateOld = deferred<PurchaseFlowResult>();
    purchaseImpl = () => gateOld.promise;
    const oldAttempt = runtime.purchase("vyd_starter_monthly");
    assert.equal(runtime.snapshot().inFlightKind, "purchase");
    const surfaceBusy = sheetSurface(runtime, iap);
    assert.equal(surfaceBusy.cta.labelKey, "billing.upgrade.purchaseLoading");
    assert.equal(surfaceBusy.sheet.primaryEnabled, false);
    assert.equal(surfaceBusy.sheet.purchaseSpinner, true);
    assert.equal(surfaceBusy.sheet.restoreSpinner, false);
    assert.equal(surfaceBusy.restoreLabel, "billing.upgrade.ctaRestore");

    runtime.dismiss();
    assert.equal(runtime.snapshot().visible, false);
    assert.equal(runtime.snapshot().clientRecordId, "diary_relogin", "dismissal keeps retry id");
    assert.equal(runtime.snapshot().saveCalls, 0);

    const reopened = notifyOrdinaryQuotaUpsell(
      quotaReq({ clientRecordId: "diary_relogin" })
    );
    assert.equal(reopened.ok, true);
    const blocked = await runtime.purchase("vyd_professional_monthly");
    assert.equal(blocked.kind, "blocked_busy");
    assert.equal(purchaseCalls.includes("vyd_professional_monthly"), false);

    const newerGate = deferred<PurchaseFlowResult>();
    gateOld.resolve({ kind: "failed", recoverable: true, message: "old fail" });
    const oldResult = await oldAttempt;
    assert.equal(oldResult.kind, "ignored_stale");
    assert.equal(runtime.snapshot().hostErrorMessage, null);
    assert.equal(runtime.snapshot().inFlightKind, null);

    purchaseImpl = () => newerGate.promise;
    const newerAttempt = runtime.purchase("vyd_starter_yearly");
    assert.equal(runtime.snapshot().inFlightKind, "purchase");
    newerGate.resolve({ kind: "sheet_launched" });
    const newerResult = await newerAttempt;
    assert.equal(newerResult.kind, "sheet_launched");
    assert.equal(runtime.snapshot().hostErrorMessage, null);
    assert.notEqual(runtime.snapshot().inFlightKind, "purchase");
  }

  {
    runtime.dismiss();
    const sessionA = syncSessionOwnership.beginSession("uid-a");
    const openedA = notifyOrdinaryQuotaUpsell(
      quotaReq({ session: sessionA, clientRecordId: "account_a" })
    );
    assert.equal(openedA.ok, true);
    const gateA = deferred<PurchaseFlowResult>();
    purchaseImpl = () => gateA.promise;
    const aAttempt = runtime.purchase("vyd_business_monthly");

    const sessionB = syncSessionOwnership.beginSession("uid-b");
    runtime.reconcile();
    assert.equal(runtime.snapshot().visible, false);
    const openedB = notifyOrdinaryQuotaUpsell(
      quotaReq({ session: sessionB, family: "customer_credit", clientRecordId: "cc_b" })
    );
    assert.equal(openedB.ok, true);
    assert.equal(runtime.snapshot().visible, true);

    const gateB = deferred<PurchaseFlowResult>();
    purchaseImpl = () => gateB.promise;
    const bAttempt = runtime.purchase("vyd_starter_monthly");
    assert.equal(runtime.snapshot().inFlightKind, "purchase");
    const bAttemptId = runtime.snapshot().attemptId;

    gateA.resolve({ kind: "failed", recoverable: true, message: "account A fail" });
    const aResult = await aAttempt;
    assert.equal(aResult.kind, "ignored_stale");
    assert.equal(runtime.snapshot().attemptId, bAttemptId);
    assert.equal(runtime.snapshot().inFlightKind, "purchase");
    assert.equal(runtime.snapshot().hostErrorMessage, null);
    assert.equal(runtime.snapshot().hostPurchaseState, "loading");

    gateB.resolve({ kind: "cancelled" });
    const bResult = await bAttempt;
    assert.equal(bResult.kind, "cancelled");
    assert.equal(runtime.snapshot().hostPurchaseState, "idle");
    assert.equal(runtime.snapshot().hostErrorMessage, null);
  }

  {
    restoreImpl = async () => ({ kind: "store_pending" });
    iap.purchaseInFlight = true;
    iap.pending = {
      version: 1,
      uid: "uid-b",
      platform: "android",
      canonicalSku: "vyd_starter_monthly",
      productId: "vyd_starter",
      stage: "store_pending",
      initiatedAt: 1,
      updatedAt: 1,
    };
    iap.lastResult = { kind: "store_pending" };
    const restoreResult = await runtime.restore();
    assert.equal(restoreResult.kind, "store_pending");
    const pendingSurface = sheetSurface(runtime, iap);
    assert.equal(pendingSurface.model.restoreState, "pending");
    assert.equal(pendingSurface.restoreLabel, "billing.upgrade.restorePending");
    assert.equal(pendingSurface.sheet.restoreSpinner, true);
    assert.equal(pendingSurface.sheet.primaryEnabled, false);

    iap.pending = null;
    iap.purchaseInFlight = false;
    iap.lastResult = { kind: "verified" };
    runtime.reconcile();
    const settled = sheetSurface(runtime, iap);
    assert.equal(settled.model.restoreState, "idle");
    assert.equal(settled.model.purchaseState, "idle");
    assert.equal(settled.restoreLabel, "billing.upgrade.ctaRestore");
    assert.equal(settled.sheet.primaryEnabled, true);
    assert.deepEqual(entitlement, DEFAULT_CLIENT_SUBSCRIPTION, "purchase callback must not grant entitlement");
  }

  {
    purchaseImpl = async () => ({ kind: "cancelled" });
    const cancelled = await runtime.purchase("vyd_starter_monthly");
    assert.equal(cancelled.kind, "cancelled");
    iap.lastResult = { kind: "cancelled" };
    iap.purchaseInFlight = false;
    iap.pending = null;
    runtime.reconcile();
    assert.equal(runtime.snapshot().hostPurchaseState, "idle");
    assert.equal(sheetSurface(runtime, iap).sheet.primaryEnabled, true);
  }

  {
    purchaseImpl = async () => ({ kind: "already_in_flight" });
    iap.purchaseInFlight = true;
    const inflight = await runtime.purchase("vyd_professional_yearly");
    assert.equal(inflight.kind, "already_in_flight");
    assert.equal(runtime.snapshot().hostPurchaseState, "loading");
    const loading = sheetSurface(runtime, iap);
    assert.equal(loading.cta.labelKey, "billing.upgrade.purchaseLoading");
    iap.purchaseInFlight = false;
    iap.pending = null;
    iap.lastResult = { kind: "verified" };
    runtime.reconcile();
    assert.equal(runtime.snapshot().hostPurchaseState, "idle");
    assert.equal(runtime.snapshot().inFlightKind, null);
  }

  {
    purchaseImpl = async () => ({ kind: "unavailable", reason: "web" });
    iap.available = false;
    const unavailable = await runtime.purchase("vyd_starter_monthly");
    assert.equal(unavailable.kind, "unavailable");
    const blocked = sheetSurface(runtime, iap);
    assert.equal(blocked.model.purchaseState, "unavailable");
    assert.equal(blocked.cta.labelKey, "billing.upgrade.purchaseUnavailable");
    assert.equal(blocked.sheet.primaryEnabled, false);

    iap.available = true;
    runtime.reconcile();
    const recovered = sheetSurface(runtime, iap);
    assert.equal(recovered.model.purchaseState, "idle");
    assert.equal(recovered.cta.labelKey, "billing.upgrade.ctaSubscribe");
    assert.equal(recovered.sheet.primaryEnabled, true);
  }

  {
    purchaseImpl = async () => ({ kind: "failed", recoverable: true, message: "card declined" });
    const failed = await runtime.purchase("vyd_starter_monthly");
    assert.equal(failed.kind, "failed");
    const errored = sheetSurface(runtime, iap);
    assert.equal(errored.model.errorMessage, "card declined");
    assert.equal(errored.model.errorRetryEnabled, true);
    assert.equal(errored.cta.labelKey, "billing.upgrade.ctaSubscribe");
    assert.equal(errored.sheet.primaryEnabled, true);
    assert.equal(errored.sheet.primaryPress.type, "purchase");

    runtime.dismiss();
    iap.lastResult = { kind: "failed", recoverable: true, message: "card declined" };
    const again = notifyOrdinaryQuotaUpsell(quotaReq({ clientRecordId: "cc_b" }));
    assert.equal(again.ok, true);
    const reopened = sheetSurface(runtime, iap);
    assert.equal(reopened.model.errorMessage, null, "acknowledged error is not replayed");
    assert.equal(reopened.sheet.primaryEnabled, true);

    const beforeRetry = purchaseCalls.length;
    purchaseImpl = async () => ({ kind: "sheet_launched" });
    const retried = await runtime.purchase("vyd_starter_monthly");
    assert.equal(retried.kind, "sheet_launched");
    assert.equal(purchaseCalls.length, beforeRetry + 1);
  }

  {
    const rejected = deferred<PurchaseFlowResult>();
    purchaseImpl = () => rejected.promise;
    let unhandled = 0;
    const onUnhandled = () => {
      unhandled += 1;
    };
    process.on("unhandledRejection", onUnhandled);
    const op = runtime.purchase("vyd_starter_monthly");
    rejected.reject(new Error("native adapter exploded"));
    const result = await op;
    await Promise.resolve();
    process.off("unhandledRejection", onUnhandled);
    assert.equal(result.kind, "failed");
    assert.equal(unhandled, 0);
    assert.equal(runtime.snapshot().hostErrorMessage, "native adapter exploded");
    assert.equal(runtime.snapshot().errorRecoverable, true);
    assert.equal(runtime.snapshot().inFlightKind, null);
  }

  assert.equal(runtime.snapshot().saveCalls, 0);
  assert.equal(runtime.snapshot().trialCalls, 0);
  runtime.startTrial();
  assert.equal(runtime.snapshot().trialCalls, 1);
  assert.deepEqual(entitlement, DEFAULT_CLIENT_SUBSCRIPTION);

  runtime.dispose();
  registerQuotaUpsellPresenter(null);
  __setQuotaUpsellEnabledForTests(null);
  syncSessionOwnership.resetForTests();
  console.log("quotaUpsellHost.lifecycle.test.ts: ok");
}

void run().catch((error) => {
  console.error(error);
  process.exit(1);
});
