import assert from "node:assert/strict";

import { fixtureReadyOffers } from "./billingUxPreviewFixtures";
import {
  canDispatchPurchase,
  canDispatchRestore,
  canDispatchTrial,
  chooseUpgradePrimaryPress,
  CLIENT_MANUAL_TRIAL_START_SUPPORTED,
  defaultSelectedSku,
  planIdForSku,
  resolveUpgradeCta,
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
} {
  const offers = input.offers ?? fixtureReadyOffers();
  const catalogState = input.catalogState ?? "ready";
  const purchaseState = input.purchaseState ?? "idle";
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
  const press = chooseUpgradePrimaryPress({
    dispatch: cta.dispatch,
    enabled: (purchaseEnabled || trialEnabled) && input.busy !== true,
    selectedSku,
  });
  return {
    kind: cta.kind,
    labelKey: cta.labelKey,
    dispatch: cta.dispatch,
    enabled: cta.enabled,
    press,
    restoreEnabled: canDispatchRestore({
      restoreAvailable: input.restoreAvailable ?? true,
      restoreState: input.restoreState ?? "idle",
    }),
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
  assert.equal(pending.restoreEnabled, true);
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
  const restoreBusy = decidePrimary({
    trialEligible: false,
    trialActionAvailable: false,
    selectedSku: "vyd_starter_monthly",
    restoreState: "pending",
    busy: true,
  });
  assert.deepEqual(restoreBusy.press, { type: "none" });
  assert.equal(restoreBusy.restoreEnabled, false);
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
