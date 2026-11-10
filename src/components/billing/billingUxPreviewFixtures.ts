/**
 * Layout fixtures for the billing UX preview lab and unit tests.
 * Not live store prices, discounts, or trial eligibility.
 * New selling surface: Unlimited Monthly / Yearly only.
 */

import type { UpgradePlanOffer, UpgradeTriggerContext } from "./upgradeTypes";

export const BILLING_UX_PREVIEW_ERROR = "Preview only — store purchases are not activated.";

export function fixtureReadyOffers(): UpgradePlanOffer[] {
  return [
    {
      planId: "unlimited",
      period: "monthly",
      sku: "vyd_unlimited_monthly",
      offer: { status: "ready", displayPrice: "₹136.00" },
    },
    {
      planId: "unlimited",
      period: "yearly",
      sku: "vyd_unlimited_yearly",
      offer: { status: "ready", displayPrice: "₹1,832.00" },
    },
  ];
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
