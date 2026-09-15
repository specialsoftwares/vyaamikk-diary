/**
 * C–J, H, I — Android standard offer selection and store-localized prices.
 */
import assert from "node:assert/strict";

import { mapStoreProductsToCatalog } from "./iapCatalogMap";
import { selectStandardAndroidOffer } from "./iapOffers";
import type { AndroidSubscriptionOfferLike, StoreProductLike } from "./iapTypes";

function standardOffer(
  basePlanId: string,
  extra: Partial<AndroidSubscriptionOfferLike> = {}
): AndroidSubscriptionOfferLike {
  return {
    id: basePlanId,
    basePlanIdAndroid: basePlanId,
    offerTokenAndroid: `token-${basePlanId}`,
    displayPrice: `₹store-${basePlanId}`,
    currency: "INR",
    type: "one-time",
    paymentMode: "unknown",
    installmentPlanDetailsAndroid: null,
    pricingPhasesAndroid: {
      pricingPhaseList: [
        {
          billingCycleCount: 0,
          billingPeriod: "P1M",
          formattedPrice: `₹store-${basePlanId}`,
          priceAmountMicros: "99000000",
          priceCurrencyCode: "INR",
          recurrenceMode: 1,
        },
      ],
    },
    ...extra,
  };
}

function testSelectsExactBasePlanNotOffersZero() {
  const yearlyPromo: AndroidSubscriptionOfferLike = {
    ...standardOffer("yearly"),
    id: "promo-yearly",
    offerTokenAndroid: "promo-token",
    displayPrice: "₹fake-first",
  };
  const monthly = standardOffer("monthly");
  const selected = selectStandardAndroidOffer({
    offers: [yearlyPromo, monthly],
    expectedBasePlanId: "monthly",
  });
  assert.equal(selected.ok, true);
  if (selected.ok) {
    assert.equal(selected.offer.offerToken, "token-monthly");
    assert.equal(selected.offer.displayPrice, "₹store-monthly");
  }
}

function testAmbiguousStandardOffersFail() {
  const a = standardOffer("yearly");
  const b = { ...standardOffer("yearly"), offerTokenAndroid: "token-yearly-2" };
  const selected = selectStandardAndroidOffer({
    offers: [a, b],
    expectedBasePlanId: "yearly",
  });
  assert.equal(selected.ok, false);
  if (!selected.ok) assert.equal(selected.reason, "ambiguous");
}

function testMissingOfferTokenFails() {
  const selected = selectStandardAndroidOffer({
    offers: [standardOffer("yearly", { offerTokenAndroid: "" })],
    expectedBasePlanId: "yearly",
  });
  assert.equal(selected.ok, false);
  if (!selected.ok) assert.equal(selected.reason, "missing_token");
}

function testTrialPhaseRejected() {
  const trial = standardOffer("yearly", {
    paymentMode: "free-trial",
    type: "introductory",
    pricingPhasesAndroid: {
      pricingPhaseList: [
        {
          billingCycleCount: 1,
          billingPeriod: "P14D",
          formattedPrice: "Free",
          priceAmountMicros: "0",
          priceCurrencyCode: "INR",
          recurrenceMode: 2,
        },
        {
          billingCycleCount: 0,
          billingPeriod: "P1Y",
          formattedPrice: "₹1999",
          priceAmountMicros: "1999000000",
          priceCurrencyCode: "INR",
          recurrenceMode: 1,
        },
      ],
    },
  });
  const selected = selectStandardAndroidOffer({
    offers: [trial],
    expectedBasePlanId: "yearly",
  });
  assert.equal(selected.ok, false);
  if (!selected.ok) assert.equal(selected.reason, "trial_or_promo");
}

function testInstallmentRejected() {
  const selected = selectStandardAndroidOffer({
    offers: [
      standardOffer("monthly", {
        installmentPlanDetailsAndroid: {
          commitmentPaymentsCount: 12,
          subsequentCommitmentPaymentsCount: 12,
        },
      }),
    ],
    expectedBasePlanId: "monthly",
  });
  assert.equal(selected.ok, false);
  if (!selected.ok) assert.equal(selected.reason, "installment");
}

function testMissingOffers() {
  const selected = selectStandardAndroidOffer({
    offers: [],
    expectedBasePlanId: "monthly",
  });
  assert.equal(selected.ok, false);
  if (!selected.ok) assert.equal(selected.reason, "missing");
}

function testStoreLocalizedCatalogPrice() {
  const product: StoreProductLike = {
    id: "vyd_professional",
    type: "subs",
    platform: "android",
    displayPrice: "IGNORE-PRODUCT-LEVEL",
    currency: "INR",
    subscriptionOffers: [
      standardOffer("monthly"),
      standardOffer("quarterly"),
      standardOffer("yearly"),
    ],
  };
  const catalog = mapStoreProductsToCatalog({
    platform: "android",
    products: [product],
  });
  const yearly = catalog.find((s) => s.canonicalSku === "vyd_professional_yearly");
  assert.equal(yearly?.available, true);
  assert.equal(yearly?.displayPrice, "₹store-yearly");
  assert.notEqual(yearly?.displayPrice, "₹1999");
}

function testUnavailableWhenStoreEmpty() {
  const catalog = mapStoreProductsToCatalog({ platform: "android", products: [] });
  assert.equal(catalog.length, 9);
  for (const row of catalog) {
    assert.equal(row.available, false);
    assert.equal(row.unavailableReason, "store_not_configured");
    assert.equal(row.displayPrice, null);
  }
}

function main() {
  testSelectsExactBasePlanNotOffersZero();
  testAmbiguousStandardOffersFail();
  testMissingOfferTokenFails();
  testTrialPhaseRejected();
  testInstallmentRejected();
  testMissingOffers();
  testStoreLocalizedCatalogPrice();
  testUnavailableWhenStoreEmpty();
  console.log("iapOffers.test.ts: ok");
}

main();
