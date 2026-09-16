import assert from "node:assert/strict";

import { fixtureReadyOffers } from "./billingUxPreviewFixtures";
import {
  buildUpgradePlanCards,
  canDispatchPurchase,
  canDispatchRestore,
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
  "billing.upgrade.plans.starter.name": "Starter",
  "billing.upgrade.plans.starter.b1": "100 records",
  "billing.upgrade.plans.starter.b2": "core records",
  "billing.upgrade.plans.professional.name": "Professional",
  "billing.upgrade.plans.professional.b1": "unlimited",
  "billing.upgrade.plans.professional.b2": "brief",
  "billing.upgrade.plans.professional.b3": "starter+",
  "billing.upgrade.plans.business.name": "Business",
  "billing.upgrade.plans.business.b1": "unlimited",
  "billing.upgrade.plans.business.b2": "brief",
  "billing.upgrade.plans.business.b3": "insights",
  "billing.upgrade.plans.business.b4": "pro+",
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
  assert.equal(monthly.length, 3);
  assert.equal(monthly[0]?.planId, "starter");
  assert.equal(monthly[0]?.priceLabel, "₹499.00");
  assert.equal(defaultSelectedSku(monthly, null), "vyd_starter_monthly");
  assert.equal(selectedOfferIsReady(offers, "vyd_professional_monthly"), true);
  assert.equal(selectedOfferIsReady(offers, "missing"), false);
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

assert.deepEqual(
  resolveUpgradeCta({
    trialEligible: true,
    purchaseAvailable: true,
    purchaseState: "idle",
    catalogState: "ready",
  }),
  { kind: "trial", enabled: true, labelKey: "billing.upgrade.ctaTrial" }
);

assert.equal(
  resolveUpgradeCta({
    trialEligible: false,
    purchaseAvailable: true,
    purchaseState: "idle",
    catalogState: "ready",
  }).kind,
  "subscribe"
);

assert.equal(
  resolveUpgradeCta({
    trialEligible: true,
    purchaseAvailable: false,
    purchaseState: "idle",
    catalogState: "ready",
  }).kind,
  "unavailable"
);

assert.equal(
  resolveUpgradeCta({
    trialEligible: false,
    purchaseAvailable: true,
    purchaseState: "pending",
    catalogState: "ready",
  }).kind,
  "pending"
);

assert.equal(
  resolveUpgradeCta({
    trialEligible: false,
    purchaseAvailable: true,
    purchaseState: "idle",
    catalogState: "loading",
  }).kind,
  "loading"
);

assert.equal(
  canDispatchPurchase({
    ctaEnabled: true,
    selectedSku: "vyd_starter_monthly",
    selectedOfferReady: true,
  }),
  true
);
assert.equal(
  canDispatchPurchase({
    ctaEnabled: true,
    selectedSku: "vyd_starter_monthly",
    selectedOfferReady: false,
  }),
  false
);
assert.equal(canDispatchRestore({ restoreAvailable: true, restoreState: "idle" }), true);
assert.equal(canDispatchRestore({ restoreAvailable: true, restoreState: "pending" }), false);
assert.equal(canDispatchRestore({ restoreAvailable: false, restoreState: "idle" }), false);

assert.equal(estimateSheetsSaved(25), 25);
assert.equal(estimateSheetsSaved(-3), 0);
assert.equal(estimateSheetsSaved(Number.NaN), 0);
assert.equal(UPGRADE_PERIOD_ORDER.length, 3);

console.log("upgradePresentation.test.ts: ok");
