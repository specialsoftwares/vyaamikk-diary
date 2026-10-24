/**
 * Restricted server admission can present a purchase-capable upgrade sheet
 * while the purchase-entry flag stays off. A session without that token cannot.
 *
 * The catalog price and offer token below are an injected store row, not a
 * live Play purchase and not a client entitlement.
 */
import assert from "node:assert/strict";

import { ALL_CANONICAL_SKUS } from "@/billing/iap/iapCatalog";
import type { CanonicalSkuAvailability, IapView } from "@/billing/iap/iapTypes";
import { interpretPurchaseAdmission } from "@/billing/iap/purchaseAdmission";
import { __setSubscriptionPurchaseEntryEnabledForTests } from "@/billing/iap/purchaseEntryGate";
import { mapUpgradeSheetModel } from "@/billing/quotaUpsell/mapUpgradeSheetModel";
import { notifyManualUpgrade } from "@/billing/quotaUpsell/notifyOrdinaryQuotaUpsell";
import { __setQuotaUpsellEnabledForTests } from "@/billing/quotaUpsell/quotaUpsellGate";
import { createQuotaUpsellHostRuntime } from "@/billing/quotaUpsell/quotaUpsellHostRuntime";
import { featuresForPlan } from "@/subscription/subscriptionFeatures";
import { DEFAULT_CLIENT_SUBSCRIPTION } from "@/subscription/types";
import { syncSessionOwnership } from "@/sync/syncSessionOwnership";

import {
  canDispatchPurchase,
  decideUpgradeSheetDispatch,
  planIdForSku,
  resolveUpgradeCta,
  selectedOfferIsReady,
} from "./upgradePresentation";

const t = (key: string) => key;

const subscription = {
  status: DEFAULT_CLIENT_SUBSCRIPTION,
  plan: "free" as const,
  features: featuresForPlan("free"),
};

function catalogRow(
  sku: CanonicalSkuAvailability["canonicalSku"],
  ready: boolean
): CanonicalSkuAvailability {
  return {
    canonicalSku: sku,
    available: ready,
    unavailableReason: ready ? null : "products_unavailable",
    storeProductId: ready ? "vyd_starter" : sku,
    androidBasePlanId: ready ? "monthly" : undefined,
    displayPrice: ready ? "₹store-monthly" : null,
    currency: ready ? "INR" : null,
    androidOfferToken: ready ? "token-monthly" : undefined,
  };
}

/** Only Starter monthly has a store price. Other plans stay unpurchasable. */
const starterMonthlyCatalog: CanonicalSkuAvailability[] = ALL_CANONICAL_SKUS.map((sku) =>
  catalogRow(sku, sku === "vyd_starter_monthly")
);

const unpricedCatalog: CanonicalSkuAvailability[] = ALL_CANONICAL_SKUS.map((sku) =>
  catalogRow(sku, false)
);

function iapView(catalog: CanonicalSkuAvailability[]): IapView {
  return {
    ownerUid: "uid-a",
    available: true,
    unavailableReason: null,
    connected: true,
    catalog,
    pending: null,
    lastResult: null,
    purchaseInFlight: false,
  };
}

function sheetDecision(
  runtime: ReturnType<typeof createQuotaUpsellHostRuntime>,
  iap: IapView
) {
  const snap = runtime.snapshot();
  const model = mapUpgradeSheetModel({
    t,
    iap,
    subscription,
    hostPurchaseState: snap.hostPurchaseState,
    hostRestoreState: snap.hostRestoreState,
    hostErrorMessage: snap.hostErrorMessage,
    errorRecoverable: snap.errorRecoverable,
    triggerContext: snap.triggerContext,
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

async function run(): Promise<void> {
  __setSubscriptionPurchaseEntryEnabledForTests(false);
  __setQuotaUpsellEnabledForTests(false);
  syncSessionOwnership.resetForTests();

  const purchaseCalls: string[] = [];
  const priced = iapView(starterMonthlyCatalog);
  const runtime = createQuotaUpsellHostRuntime({
    purchase: async (sku) => {
      purchaseCalls.push(sku);
      return { kind: "sheet_launched" };
    },
    restorePurchases: async () => ({ kind: "sheet_launched" }),
    getIap: () => priced,
  });
  runtime.attach();

  try {
    const session = syncSessionOwnership.beginSession("uid-a");

    const closed = notifyManualUpgrade(session);
    assert.equal(closed.ok, false);
    assert.equal(closed.ok === false && closed.reason, "purchase_entry_closed");
    assert.equal(runtime.snapshot().visible, false);

    const forged = notifyManualUpgrade(session, { purchaseAllowed: true } as never);
    assert.equal(forged.ok, false);
    assert.equal(runtime.snapshot().visible, false);
    assert.equal(purchaseCalls.length, 0);

    const admitted = interpretPurchaseAdmission({ purchaseAllowed: true });
    assert.equal(admitted.status, "allowed");
    if (admitted.status !== "allowed") return;

    const opened = notifyManualUpgrade(session, admitted.token);
    assert.equal(opened.ok, true);
    assert.equal(opened.visible, true);
    const capable = sheetDecision(runtime, priced);
    assert.equal(capable.snap.visible, true);
    assert.equal(capable.snap.triggerContext, "manualUpgrade");
    assert.equal(capable.model.catalogState, "ready");
    assert.equal(capable.model.purchaseAvailable, true);
    assert.equal(capable.model.defaultSku, "vyd_starter_monthly");
    assert.equal(
      capable.model.offers.find((offer) => offer.sku === "vyd_starter_monthly")?.offer.status,
      "ready"
    );
    for (const offer of capable.model.offers) {
      if (offer.sku === "vyd_starter_monthly") continue;
      assert.equal(offer.offer.status, "unavailable", `${offer.sku} must stay unpriced`);
    }
    assert.equal(capable.cta.kind, "subscribe");
    assert.equal(capable.cta.labelKey, "billing.upgrade.ctaSubscribe");
    assert.notEqual(capable.cta.labelKey, "billing.upgrade.purchaseUnavailable");
    assert.equal(capable.cta.dispatch, "purchase");
    assert.deepEqual(capable.sheet.primaryPress, {
      type: "purchase",
      sku: "vyd_starter_monthly",
    });
    assert.equal(purchaseCalls.length, 0, "presenting the sheet must not purchase");

    runtime.dismiss();
    assert.equal(runtime.snapshot().visible, false);

    const unpriced = iapView(unpricedCatalog);
    const openedUnpriced = notifyManualUpgrade(session, admitted.token);
    assert.equal(openedUnpriced.ok, true);
    const blocked = sheetDecision(runtime, unpriced);
    assert.equal(blocked.model.catalogState, "unavailable");
    assert.equal(blocked.model.purchaseAvailable, false);
    assert.equal(blocked.cta.kind, "unavailable");
    assert.equal(blocked.cta.labelKey, "billing.upgrade.purchaseUnavailable");
    assert.equal(blocked.sheet.primaryPress.type, "none");
    assert.equal(purchaseCalls.length, 0);
  } finally {
    runtime.dispose();
    syncSessionOwnership.resetForTests();
    __setSubscriptionPurchaseEntryEnabledForTests(null);
    __setQuotaUpsellEnabledForTests(null);
  }
}

run().then(
  () => {
    console.log("admittedUpgradeSheet.test.ts: ok");
  },
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
