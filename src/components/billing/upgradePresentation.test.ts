import assert from "node:assert/strict";

import { fixtureReadyOffers } from "./billingUxPreviewFixtures";
import {
  buildUpgradePlanCards,
  canDispatchPurchase,
  canDispatchRestore,
  CLIENT_MANUAL_TRIAL_START_SUPPORTED,
  decideUpgradeSheetDispatch,
  defaultSelectedSku,
  estimateSheetsSaved,
  FORBIDDEN_W9_CLAIM_FRAGMENTS,
  resolveUpgradeCta,
  selectedOfferIsReady,
  shouldShowTrustedByClaim,
  SHOW_TRUSTED_BY_INDIAN_BUSINESS_OWNERS_CLAIM,
  UNAPPROVED_TRUSTED_BY_CLAIM,
  upgradeTriggerCopy,
  UPGRADE_PERIOD_ORDER,
} from "./upgradePresentation";
import { UPGRADE_TRIGGER_CONTEXTS, type UpgradePlanOffer } from "./upgradeTypes";

const KEYS: Record<string, string> = {
  "billing.upgrade.trigger.recordLimitReached.title": "limit-title",
  "billing.upgrade.trigger.recordLimitReached.subtitle": "limit-sub",
  "billing.upgrade.trigger.featureLocked.title": "feat-title",
  "billing.upgrade.trigger.featureLocked.subtitle": "feat-sub",
  "billing.upgrade.trigger.trialExpiring.title": "trial-title",
  "billing.upgrade.trigger.trialExpiring.subtitle": "trial-sub",
  "billing.upgrade.trigger.manualUpgrade.title": "manual-title",
  "billing.upgrade.trigger.manualUpgrade.subtitle": "manual-sub",
  "billing.upgrade.plans.unlimited.name": "Unlimited",
  "billing.upgrade.plans.unlimited.b1": "unlimited records",
  "billing.upgrade.plans.unlimited.b2": "insights",
  "billing.upgrade.plans.unlimited.b3": "grin",
};

function t(key: string): string {
  return KEYS[key] ?? key;
}

assert.equal(SHOW_TRUSTED_BY_INDIAN_BUSINESS_OWNERS_CLAIM, false);
assert.equal(shouldShowTrustedByClaim(), false);
assert.equal(UNAPPROVED_TRUSTED_BY_CLAIM, "TRUSTED BY INDIAN BUSINESS OWNERS");
assert.ok(FORBIDDEN_W9_CLAIM_FRAGMENTS.includes(UNAPPROVED_TRUSTED_BY_CLAIM));

for (const trigger of UPGRADE_TRIGGER_CONTEXTS) {
  const copy = upgradeTriggerCopy(t, trigger);
  assert.ok(copy.title.length > 0, trigger);
  assert.ok(copy.subtitle.length > 0, trigger);
  assert.equal(copy.title.includes("TRUSTED BY"), false);
}

{
  const offers = fixtureReadyOffers();
  const monthly = buildUpgradePlanCards(t, offers, "monthly");
  assert.equal(monthly.length, 1);
  assert.equal(monthly[0]?.planId, "unlimited");
  assert.equal(monthly[0]?.priceLabel, "₹136.00");
  assert.equal(defaultSelectedSku(monthly, null), "vyd_unlimited_monthly");
  assert.equal(selectedOfferIsReady(offers, "vyd_unlimited_yearly"), true);
  assert.equal(selectedOfferIsReady(offers, "missing"), false);
  const yearly = buildUpgradePlanCards(t, offers, "yearly");
  assert.equal(yearly[0]?.priceLabel, "₹1,832.00");
  assert.equal(/sav/i.test(yearly[0]?.name ?? ""), false, "Yearly must not be labeled as a saving");
}

{
  const loading: UpgradePlanOffer[] = fixtureReadyOffers().map((row) => ({
    ...row,
    offer: { status: "loading" },
  }));
  const cards = buildUpgradePlanCards(t, loading, "yearly");
  assert.equal(cards.every((card) => card.priceLabel === null), true);
  assert.equal(cards.every((card) => card.priceState === "loading"), true);
}

assert.equal(CLIENT_MANUAL_TRIAL_START_SUPPORTED, false);

// Trial CTAs are removed from the new selling surface.
assert.deepEqual(
  resolveUpgradeCta({
    trialEligible: true,
    trialActionAvailable: true,
    selectedPlanId: "unlimited",
    purchaseAvailable: true,
    purchaseState: "idle",
    catalogState: "ready",
  }),
  {
    kind: "subscribe",
    enabled: true,
    labelKey: "billing.upgrade.ctaSubscribe",
    dispatch: "purchase",
  }
);

assert.equal(
  resolveUpgradeCta({
    trialEligible: false,
    trialActionAvailable: false,
    selectedPlanId: "unlimited",
    purchaseAvailable: true,
    purchaseState: "pending",
    catalogState: "ready",
  }).kind,
  "pending"
);

assert.equal(
  resolveUpgradeCta({
    trialEligible: false,
    trialActionAvailable: false,
    selectedPlanId: "unlimited",
    purchaseAvailable: true,
    purchaseState: "verifying",
    catalogState: "ready",
  }).kind,
  "verifying"
);

assert.equal(
  canDispatchPurchase({
    ctaEnabled: true,
    dispatch: "purchase",
    selectedSku: "vyd_unlimited_monthly",
    selectedOfferReady: true,
  }),
  true
);
assert.equal(canDispatchRestore({ restoreAvailable: true, restoreState: "idle" }), true);
assert.equal(canDispatchRestore({ restoreAvailable: true, restoreState: "pending" }), false);

{
  const restoreLocksPurchase = decideUpgradeSheetDispatch({
    purchaseEnabled: true,
    trialEnabled: false,
    restoreAvailable: true,
    purchaseState: "idle",
    restoreState: "pending",
    dispatch: "purchase",
    selectedSku: "vyd_unlimited_monthly",
  });
  assert.equal(restoreLocksPurchase.primaryEnabled, false);
  assert.equal(restoreLocksPurchase.restoreEnabled, false);
}

assert.equal(estimateSheetsSaved(15), 15);
assert.equal(UPGRADE_PERIOD_ORDER.length, 2);
assert.deepEqual([...UPGRADE_PERIOD_ORDER], ["monthly", "yearly"]);

console.log("upgradePresentation.test.ts: ok");
