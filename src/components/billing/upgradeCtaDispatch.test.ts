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
  UpgradePlanId,
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
  busy?: boolean;
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
  const starter = decidePrimary({
    trialEligible: true,
    trialActionAvailable: false,
    selectedSku: "vyd_starter_monthly",
  });
  assert.equal(starter.kind, "subscribe");
  assert.equal(starter.labelKey, "billing.upgrade.ctaSubscribe");
  assert.deepEqual(starter.press, { type: "purchase", sku: "vyd_starter_monthly" });
}

{
  const ineligibleStarter = decidePrimary({
    trialEligible: false,
    trialActionAvailable: false,
    selectedSku: "vyd_starter_monthly",
  });
  assert.equal(ineligibleStarter.kind, "subscribe");
  assert.deepEqual(ineligibleStarter.press, { type: "purchase", sku: "vyd_starter_monthly" });
}

{
  const professionalUnavailable = decidePrimary({
    trialEligible: true,
    trialActionAvailable: false,
    selectedSku: "vyd_professional_monthly",
  });
  assert.equal(professionalUnavailable.kind, "trialUnavailable");
  assert.equal(professionalUnavailable.labelKey, "billing.upgrade.ctaTrialUnavailable");
  assert.equal(professionalUnavailable.enabled, false);
  assert.deepEqual(professionalUnavailable.press, { type: "none" });
}

{
  const professionalTrial = decidePrimary({
    trialEligible: true,
    trialActionAvailable: true,
    selectedSku: "vyd_professional_monthly",
  });
  assert.equal(professionalTrial.kind, "trial");
  assert.equal(professionalTrial.labelKey, "billing.upgrade.ctaTrial");
  assert.deepEqual(professionalTrial.press, { type: "trial" });
}

{
  const ineligibleProfessional = decidePrimary({
    trialEligible: false,
    trialActionAvailable: true,
    selectedSku: "vyd_professional_monthly",
  });
  assert.equal(ineligibleProfessional.kind, "subscribe");
  assert.deepEqual(ineligibleProfessional.press, {
    type: "purchase",
    sku: "vyd_professional_monthly",
  });
}

{
  const business = decidePrimary({
    trialEligible: true,
    trialActionAvailable: true,
    selectedSku: "vyd_business_monthly",
  });
  assert.equal(business.kind, "subscribe");
  assert.deepEqual(business.press, { type: "purchase", sku: "vyd_business_monthly" });
}

{
  const unknownPlan = decidePrimary({
    trialEligible: true,
    trialActionAvailable: true,
    selectedSku: "missing_sku",
  });
  assert.equal(unknownPlan.kind, "subscribe");
  assert.deepEqual(unknownPlan.press, { type: "none" });
}

{
  const loading = decidePrimary({
    trialEligible: true,
    trialActionAvailable: true,
    selectedSku: "vyd_professional_monthly",
    catalogState: "loading",
  });
  assert.equal(loading.kind, "loading");
  assert.deepEqual(loading.press, { type: "none" });
}

{
  const pending = decidePrimary({
    trialEligible: false,
    trialActionAvailable: false,
    selectedSku: "vyd_starter_monthly",
    purchaseState: "pending",
  });
  assert.equal(pending.kind, "pending");
  assert.deepEqual(pending.press, { type: "none" });
  assert.equal(pending.restoreEnabled, false);
  assert.equal(pending.primaryEnabled, false);
  assert.equal(pending.purchaseSpinner, true);
  assert.equal(pending.restoreSpinner, false);
}

{
  const unavailable = decidePrimary({
    trialEligible: true,
    trialActionAvailable: true,
    selectedSku: "vyd_professional_monthly",
    purchaseAvailable: false,
  });
  assert.equal(unavailable.kind, "unavailable");
  assert.deepEqual(unavailable.press, { type: "none" });
}

{
  const errorPaid = decidePrimary({
    trialEligible: false,
    trialActionAvailable: false,
    selectedSku: "vyd_starter_monthly",
    hasError: true,
  });
  assert.equal(errorPaid.kind, "subscribe");
  assert.equal(errorPaid.enabled, false);
  assert.deepEqual(errorPaid.press, { type: "none" });
  assert.equal(errorPaid.restoreEnabled, true);
}

{
  const errorTrial = decidePrimary({
    trialEligible: true,
    trialActionAvailable: true,
    selectedSku: "vyd_professional_monthly",
    hasError: true,
  });
  assert.equal(errorTrial.kind, "trial");
  assert.equal(errorTrial.enabled, false);
  assert.deepEqual(errorTrial.press, { type: "none" });
}

{
  const restorePending = decidePrimary({
    trialEligible: false,
    trialActionAvailable: false,
    selectedSku: "vyd_starter_monthly",
    restoreState: "pending",
  });
  assert.deepEqual(restorePending.press, { type: "none" });
  assert.equal(restorePending.restoreEnabled, false);
  assert.equal(restorePending.primaryEnabled, false);
  assert.equal(restorePending.purchaseSpinner, false);
  assert.equal(restorePending.restoreSpinner, true);
}

{
  const restoreLoading = decidePrimary({
    trialEligible: false,
    trialActionAvailable: false,
    selectedSku: "vyd_starter_monthly",
    restoreState: "loading",
  });
  assert.deepEqual(restoreLoading.press, { type: "none" });
  assert.equal(restoreLoading.restoreEnabled, false);
  assert.equal(restoreLoading.primaryEnabled, false);
  assert.equal(restoreLoading.purchaseSpinner, false);
  assert.equal(restoreLoading.restoreSpinner, true);
}

{
  const purchaseLoading = decidePrimary({
    trialEligible: false,
    trialActionAvailable: false,
    selectedSku: "vyd_starter_monthly",
    purchaseState: "loading",
  });
  assert.deepEqual(purchaseLoading.press, { type: "none" });
  assert.equal(purchaseLoading.restoreEnabled, false);
  assert.equal(purchaseLoading.primaryEnabled, false);
  assert.equal(purchaseLoading.purchaseSpinner, true);
  assert.equal(purchaseLoading.restoreSpinner, false);
}

{
  const trialLockedByRestore = decidePrimary({
    trialEligible: true,
    trialActionAvailable: true,
    selectedSku: "vyd_professional_monthly",
    restoreState: "pending",
  });
  assert.equal(trialLockedByRestore.kind, "trial");
  assert.deepEqual(trialLockedByRestore.press, { type: "none" });
  assert.equal(trialLockedByRestore.restoreEnabled, false);
  assert.equal(trialLockedByRestore.primaryEnabled, false);
}

{
  const settled = decidePrimary({
    trialEligible: false,
    trialActionAvailable: false,
    selectedSku: "vyd_starter_monthly",
    purchaseState: "idle",
    restoreState: "idle",
  });
  assert.deepEqual(settled.press, { type: "purchase", sku: "vyd_starter_monthly" });
  assert.equal(settled.restoreEnabled, true);
  assert.equal(settled.primaryEnabled, true);
  assert.equal(settled.purchaseSpinner, false);
  assert.equal(settled.restoreSpinner, false);
}

{
  const t = (key: string) => key;
  assert.equal(
    restoreCtaLabel(t, { restoreAvailable: true, restoreState: "loading" }),
    "billing.upgrade.restoreLoading"
  );
  assert.equal(
    restoreCtaLabel(t, { restoreAvailable: true, restoreState: "pending" }),
    "billing.upgrade.restorePending"
  );
  assert.equal(
    restoreCtaLabel(t, { restoreAvailable: true, restoreState: "unavailable" }),
    "billing.upgrade.restoreUnavailable"
  );
  assert.equal(
    restoreCtaLabel(t, { restoreAvailable: false, restoreState: "idle" }),
    "billing.upgrade.restoreUnavailable"
  );
  assert.equal(
    restoreCtaLabel(t, { restoreAvailable: true, restoreState: "idle" }),
    "billing.upgrade.ctaRestore"
  );
}

{
  const restoreSeparate = decidePrimary({
    trialEligible: true,
    trialActionAvailable: true,
    selectedSku: "vyd_professional_monthly",
    restoreAvailable: true,
    restoreState: "idle",
  });
  assert.deepEqual(restoreSeparate.press, { type: "trial" });
  assert.equal(restoreSeparate.restoreEnabled, true);
}

{
  const restoreUnavailable = decidePrimary({
    trialEligible: false,
    trialActionAvailable: false,
    selectedSku: "vyd_starter_monthly",
    restoreAvailable: false,
    restoreState: "unavailable",
  });
  assert.deepEqual(restoreUnavailable.press, {
    type: "purchase",
    sku: "vyd_starter_monthly",
  });
  assert.equal(restoreUnavailable.restoreEnabled, false);
  assert.equal(restoreUnavailable.restoreSpinner, false);
}

{
  const plans: UpgradePlanId[] = ["starter", "professional", "business"];
  for (const planId of plans) {
    const sku = `vyd_${planId}_monthly`;
    const ineligible = decidePrimary({
      trialEligible: false,
      trialActionAvailable: false,
      selectedSku: sku,
    });
    assert.equal(ineligible.kind, "subscribe", planId);
    assert.deepEqual(ineligible.press, { type: "purchase", sku }, planId);
  }
}

console.log("upgradeCtaDispatch.test.ts: ok");
