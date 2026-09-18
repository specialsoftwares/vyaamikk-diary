import assert from "node:assert/strict";

import type { CanonicalSkuAvailability, IapView } from "@/billing/iap/iapTypes";
import { ALL_CANONICAL_SKUS } from "@/billing/iap/iapCatalog";
import { featuresForPlan } from "@/subscription/subscriptionFeatures";
import { DEFAULT_CLIENT_SUBSCRIPTION } from "@/subscription/types";

import { mapUpgradeSheetModel } from "./mapUpgradeSheetModel";

const t = (key: string, vars?: Record<string, string | number>) =>
  vars ? `${key}:${JSON.stringify(vars)}` : key;

function iapView(over: Partial<IapView> = {}): IapView {
  return {
    ownerUid: "uid-a",
    available: true,
    unavailableReason: null,
    connected: true,
    catalog: [],
    pending: null,
    lastResult: null,
    purchaseInFlight: false,
    ...over,
  };
}

const readyCatalog: CanonicalSkuAvailability[] = ALL_CANONICAL_SKUS.map((sku) => ({
  canonicalSku: sku,
  available: true,
  unavailableReason: null,
  storeProductId: sku,
  displayPrice: `₹${sku}`,
  currency: "INR",
}));

{
  const model = mapUpgradeSheetModel({
    t,
    iap: iapView({ catalog: readyCatalog }),
    subscription: {
      status: DEFAULT_CLIENT_SUBSCRIPTION,
      plan: "free",
      features: featuresForPlan("free"),
    },
    hostPurchaseState: "idle",
    hostRestoreState: "idle",
    hostErrorMessage: null,
  });
  assert.equal(model.triggerContext, "recordLimitReached");
  assert.equal(model.trialActionAvailable, false);
  assert.equal(model.trialEligible, false);
  assert.equal(model.offers.length, 9);
  assert.equal(model.catalogState, "ready");
  assert.equal(model.purchaseAvailable, true);
  assert.equal(model.restoreAvailable, true);
  assert.equal(
    model.offers.find((o) => o.sku === "vyd_starter_monthly")?.offer.status,
    "ready"
  );
  assert.equal(model.currentPlanLabel, "billing.upgrade.freePlanName");
  assert.equal(model.entitlementLabel, "billing.upgrade.entitlementInactive");
  assert.equal(model.errorRetryEnabled, false);
}

{
  const loading = mapUpgradeSheetModel({
    t,
    iap: iapView({ connected: false, catalog: [] }),
    subscription: {
      status: DEFAULT_CLIENT_SUBSCRIPTION,
      plan: "free",
      features: featuresForPlan("free"),
    },
    hostPurchaseState: "idle",
    hostRestoreState: "idle",
    hostErrorMessage: null,
  });
  assert.equal(loading.catalogState, "loading");
  assert.equal(
    loading.offers.every((o) => o.offer.status === "loading"),
    true
  );
}

{
  const unavailable = mapUpgradeSheetModel({
    t,
    iap: iapView({
      available: false,
      unavailableReason: "native_build_required",
      connected: false,
    }),
    subscription: {
      status: DEFAULT_CLIENT_SUBSCRIPTION,
      plan: "free",
      features: featuresForPlan("free"),
    },
    hostPurchaseState: "idle",
    hostRestoreState: "idle",
    hostErrorMessage: null,
  });
  assert.equal(unavailable.catalogState, "unavailable");
  assert.equal(unavailable.purchaseAvailable, false);
  assert.equal(unavailable.restoreAvailable, false);
  assert.equal(unavailable.purchaseState, "unavailable");
}

{
  const pending = mapUpgradeSheetModel({
    t,
    iap: iapView({
      catalog: readyCatalog,
      purchaseInFlight: true,
      pending: {
        version: 1,
        uid: "uid-a",
        platform: "android",
        canonicalSku: "vyd_starter_monthly",
        productId: "vyd_starter",
        stage: "store_pending",
        initiatedAt: 1,
        updatedAt: 1,
      },
    }),
    subscription: {
      status: DEFAULT_CLIENT_SUBSCRIPTION,
      plan: "free",
      features: featuresForPlan("free"),
    },
    hostPurchaseState: "idle",
    hostRestoreState: "idle",
    hostErrorMessage: null,
  });
  assert.equal(pending.purchaseState, "pending");
}

{
  const failed = mapUpgradeSheetModel({
    t,
    iap: iapView({
      catalog: readyCatalog,
      lastResult: { kind: "failed", recoverable: true, message: "store error" },
    }),
    subscription: {
      status: DEFAULT_CLIENT_SUBSCRIPTION,
      plan: "free",
      features: featuresForPlan("free"),
    },
    hostPurchaseState: "idle",
    hostRestoreState: "idle",
    hostErrorMessage: null,
  });
  assert.equal(failed.errorMessage, null);
  assert.equal(failed.errorRetryEnabled, false);
}

{
  const hostFailed = mapUpgradeSheetModel({
    t,
    iap: iapView({
      catalog: readyCatalog,
      lastResult: { kind: "failed", recoverable: true, message: "store error" },
    }),
    subscription: {
      status: DEFAULT_CLIENT_SUBSCRIPTION,
      plan: "free",
      features: featuresForPlan("free"),
    },
    hostPurchaseState: "idle",
    hostRestoreState: "idle",
    hostErrorMessage: "pay fail",
    errorRecoverable: true,
  });
  assert.equal(hostFailed.errorMessage, "pay fail");
  assert.equal(hostFailed.errorRetryEnabled, true);
}

{
  const entitled = mapUpgradeSheetModel({
    t,
    iap: iapView({ catalog: readyCatalog }),
    subscription: {
      status: {
        ...DEFAULT_CLIENT_SUBSCRIPTION,
        plan: "starter",
        billingStatus: "active",
        entitlementActive: true,
        entitlementReason: "storeSubscriptionActive",
      },
      plan: "starter",
      features: featuresForPlan("starter"),
    },
    hostPurchaseState: "idle",
    hostRestoreState: "idle",
    hostErrorMessage: null,
  });
  assert.equal(entitled.currentPlanLabel, "billing.upgrade.plans.starter.name");
  assert.match(entitled.entitlementLabel, /billing\.upgrade\.entitlementLimit/);
  assert.match(entitled.entitlementLabel, /100/);
}

{
  const pro = mapUpgradeSheetModel({
    t,
    iap: iapView({ catalog: readyCatalog }),
    subscription: {
      status: {
        ...DEFAULT_CLIENT_SUBSCRIPTION,
        plan: "professional",
        billingStatus: "active",
        entitlementActive: true,
        entitlementReason: "storeSubscriptionActive",
      },
      plan: "professional",
      features: featuresForPlan("professional"),
    },
    hostPurchaseState: "idle",
    hostRestoreState: "idle",
    hostErrorMessage: null,
  });
  assert.equal(pro.entitlementLabel, "billing.upgrade.entitlementUnlimited");
}

console.log("mapUpgradeSheetModel.test.ts: ok");
