/**
 * Layout fixtures for the billing UX preview lab and unit tests.
 * Not live store prices, discounts, or trial eligibility.
 */

import type { UpgradePlanOffer, UpgradeTriggerContext } from "./upgradeTypes";

export const BILLING_UX_PREVIEW_ERROR = "Preview only — store purchases are not activated.";

const PERIODS = ["monthly", "quarterly", "yearly"] as const;
const PLANS = [
  { planId: "starter" as const, monthly: "₹499.00", quarterly: "₹1,349.00", yearly: "₹4,999.00" },
  { planId: "professional" as const, monthly: "₹999.00", quarterly: "₹2,699.00", yearly: "₹9,999.00" },
  { planId: "business" as const, monthly: "₹1,999.00", quarterly: "₹5,399.00", yearly: "₹19,999.00" },
];

export function fixtureReadyOffers(): UpgradePlanOffer[] {
  const offers: UpgradePlanOffer[] = [];
  for (const plan of PLANS) {
    for (const period of PERIODS) {
      offers.push({
        planId: plan.planId,
        period,
        sku: `vyd_${plan.planId}_${period}`,
        offer: { status: "ready", displayPrice: plan[period] },
      });
    }
  }
  return offers;
}

export function fixtureLoadingOffers(): UpgradePlanOffer[] {
  return fixtureReadyOffers().map((row) => ({
    ...row,
    offer: { status: "loading" },
  }));
}

export function fixtureUnavailableOffers(): UpgradePlanOffer[] {
  return fixtureReadyOffers().map((row) => ({
    ...row,
    offer: { status: "unavailable" },
  }));
}

export const BILLING_UX_PREVIEW_TRIGGERS: UpgradeTriggerContext[] = [
  "recordLimitReached",
  "featureLocked",
  "trialExpiring",
  "manualUpgrade",
];
