import assert from "node:assert/strict";

import { fixtureReadyOffers } from "./billingUxPreviewFixtures";
import {
  canDispatchPurchase,
  canDispatchTrial,
  decideUpgradeSheetDispatch,
  CLIENT_MANUAL_TRIAL_START_SUPPORTED,
  defaultSelectedSku,
  planIdForSku,
  resolveUpgradeCta,
  restoreCtaLabel,
  selectedOfferIsReady,
} from "./upgradePresentation";
import type {
  UpgradeCatalogState,
  UpgradeOperationState,
  UpgradePlanOffer,
} from "./upgradeTypes";

type PrimaryPress =
  | { type: "purchase"; sku: string }
  | { type: "trial" }
  | { type: "none" };

function decidePrimary(input: {
  trialEligible: boolean;
  trialActionAvailable: boolean;
  selectedSku: string | null;
  purchaseAvailable?: boolean;
  purchaseState?: UpgradeOperationState;
  restoreAvailable?: boolean;
  restoreState?: UpgradeOperationState;
  catalogState?: UpgradeCatalogState;
  hasError?: boolean;
  offers?: readonly UpgradePlanOffer[];
}): {
  kind: string;
  labelKey: string;
  dispatch: string;
  enabled: boolean;
  press: PrimaryPress;
  restoreEnabled: boolean;
  primaryEnabled: boolean;
  purchaseSpinner: boolean;
  restoreSpinner: boolean;
} {
  const offers = input.offers ?? fixtureReadyOffers();
  const catalogState = input.catalogState ?? "ready";
  const purchaseState = input.purchaseState ?? "idle";
  const restoreState = input.restoreState ?? "idle";
  const restoreAvailable = input.restoreAvailable ?? true;
  const cardsPeriod = offers.find((row) => row.sku === input.selectedSku)?.period ?? "monthly";
  const selectedSku =
    input.selectedSku ??
    defaultSelectedSku(
      offers
        .filter((row) => row.period === cardsPeriod)
        .map((row) => ({
          sku: row.sku,
          planId: row.planId,
          period: row.period,
          name: row.planId,
          benefits: [],
          priceLabel: row.offer.status === "ready" ? row.offer.displayPrice : null,
          priceState: row.offer.status,
        })),
      input.selectedSku
    );
  const cta = resolveUpgradeCta({
    trialEligible: input.trialEligible,
    trialActionAvailable: input.trialActionAvailable,
    selectedPlanId: planIdForSku(offers, selectedSku),
    purchaseAvailable: input.purchaseAvailable ?? true,
    purchaseState,
    catalogState,
    hasError: input.hasError,
  });
  const purchaseEnabled = canDispatchPurchase({
    ctaEnabled: cta.enabled,
    dispatch: cta.dispatch,
    selectedSku,
    selectedOfferReady: selectedOfferIsReady(offers, selectedSku),
  });
  const trialEnabled = canDispatchTrial({
    ctaEnabled: cta.enabled,
    dispatch: cta.dispatch,
    trialActionAvailable: input.trialActionAvailable,
  });
  const sheet = decideUpgradeSheetDispatch({
    purchaseEnabled,
    trialEnabled,
    restoreAvailable,
    purchaseState,
    restoreState,
    dispatch: cta.dispatch,
    selectedSku,
  });
  return {
    kind: cta.kind,
    labelKey: cta.labelKey,
    dispatch: cta.dispatch,
    enabled: cta.enabled,
    press: sheet.primaryPress,
    restoreEnabled: sheet.restoreEnabled,
    primaryEnabled: sheet.primaryEnabled,
    purchaseSpinner: sheet.purchaseSpinner,
    restoreSpinner: sheet.restoreSpinner,
  };
}

assert.equal(CLIENT_MANUAL_TRIAL_START_SUPPORTED, false);

{
  const monthly = decidePrimary({
    trialEligible: true,
    trialActionAvailable: true,
    selectedSku: "vyd_unlimited_monthly",
  });
  assert.equal(monthly.kind, "subscribe");
  assert.equal(monthly.labelKey, "billing.upgrade.ctaSubscribe");
  assert.deepEqual(monthly.press, { type: "purchase", sku: "vyd_unlimited_monthly" });
}

{
  const yearly = decidePrimary({
    trialEligible: false,
    trialActionAvailable: false,
    selectedSku: "vyd_unlimited_yearly",
  });
  assert.equal(yearly.kind, "subscribe");
  assert.deepEqual(yearly.press, { type: "purchase", sku: "vyd_unlimited_yearly" });
}

{
  const pending = decidePrimary({
    trialEligible: false,
    trialActionAvailable: false,
    selectedSku: "vyd_unlimited_monthly",
    purchaseState: "pending",
  });
  assert.equal(pending.kind, "pending");
  assert.deepEqual(pending.press, { type: "none" });
  assert.equal(pending.purchaseSpinner, true);
}

{
  const verifying = decidePrimary({
    trialEligible: false,
    trialActionAvailable: false,
    selectedSku: "vyd_unlimited_monthly",
    purchaseState: "verifying",
  });
  assert.equal(verifying.kind, "verifying");
  assert.deepEqual(verifying.press, { type: "none" });
}

{
  const settled = decidePrimary({
    trialEligible: false,
    trialActionAvailable: false,
    selectedSku: "vyd_unlimited_monthly",
  });
  assert.deepEqual(settled.press, { type: "purchase", sku: "vyd_unlimited_monthly" });
  assert.equal(settled.restoreEnabled, true);
  assert.equal(settled.primaryEnabled, true);
}

{
  const t = (key: string) => key;
  assert.equal(
    restoreCtaLabel(t, { restoreAvailable: true, restoreState: "idle" }),
    "billing.upgrade.ctaRestore"
  );
}

console.log("upgradeCtaDispatch.test.ts: ok");
