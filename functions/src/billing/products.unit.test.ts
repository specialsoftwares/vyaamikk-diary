/**
 * Canonical SKU catalog contract tests.
 * Run: npm run test:billing-catalog
 */

import assert from "node:assert/strict";

import {
  ALL_CANONICAL_SKUS,
  NEW_PURCHASE_SKUS,
  LEGACY_RECOGNITION_SKUS,
  canonicalSkuForAndroid,
  canonicalSkuForIos,
  getCatalogEntry,
  isNewPurchaseSku,
  subscriptionDescriptionForSku,
  SUBSCRIPTION_CATALOG,
  GRIN_INCLUDED_IN_EXISTING_PLANS,
} from "./products";
import { PLAN_MONTHLY_RECORD_LIMITS, UNLIMITED_RECORDS } from "./types";

assert.equal(ALL_CANONICAL_SKUS.length, 11);
assert.deepEqual([...NEW_PURCHASE_SKUS], ["vyd_unlimited_monthly", "vyd_unlimited_yearly"]);
assert.equal(LEGACY_RECOGNITION_SKUS.length, 9);
assert.equal(isNewPurchaseSku("vyd_unlimited_monthly"), true);
assert.equal(isNewPurchaseSku("vyd_starter_monthly"), false);

assert.equal(getCatalogEntry("vyd_unlimited_monthly").expectedPriceInPaise, 13_600);
assert.equal(getCatalogEntry("vyd_unlimited_yearly").expectedPriceInPaise, 183_200);
assert.equal(getCatalogEntry("vyd_unlimited_monthly").android.productId, "vyd_unlimited");
assert.equal(getCatalogEntry("vyd_unlimited_yearly").android.basePlanId, "yearly");
assert.equal(getCatalogEntry("vyd_unlimited_monthly").availableForNewPurchase, true);
assert.equal(getCatalogEntry("vyd_starter_monthly").availableForNewPurchase, false);

for (const sku of ALL_CANONICAL_SKUS) {
  const e = SUBSCRIPTION_CATALOG[sku];
  assert.equal(e.canonicalSku, sku);
  assert.ok(!e.android.basePlanId.includes("_"), `basePlanId has underscore: ${e.android.basePlanId}`);
  assert.ok(Number.isInteger(e.expectedPriceInPaise) && e.expectedPriceInPaise > 0);
  assert.equal(canonicalSkuForAndroid(e.android.productId, e.android.basePlanId), sku);
}

assert.equal(canonicalSkuForAndroid("vyd_unlimited", "monthly"), "vyd_unlimited_monthly");
assert.equal(canonicalSkuForAndroid("vyd_professional", "yearly"), "vyd_professional_yearly");
assert.equal(canonicalSkuForAndroid("vyd_unlimited", "quarterly"), null);
assert.equal(canonicalSkuForAndroid("vyd_professional", "yearly_v2"), null);

for (const sku of ALL_CANONICAL_SKUS) {
  assert.equal(canonicalSkuForIos(SUBSCRIPTION_CATALOG[sku].ios.productId), sku);
}

assert.equal(PLAN_MONTHLY_RECORD_LIMITS.free, 25);
assert.equal(PLAN_MONTHLY_RECORD_LIMITS.starter, 100);
assert.equal(PLAN_MONTHLY_RECORD_LIMITS.professional, UNLIMITED_RECORDS);
assert.equal(PLAN_MONTHLY_RECORD_LIMITS.business, UNLIMITED_RECORDS);
assert.equal(PLAN_MONTHLY_RECORD_LIMITS.unlimited, UNLIMITED_RECORDS);

assert.equal(GRIN_INCLUDED_IN_EXISTING_PLANS, true);
assert.equal(
  subscriptionDescriptionForSku("vyd_unlimited_yearly"),
  "Vyaamikk Diary Unlimited Subscription (Yearly)"
);
assert.equal(
  subscriptionDescriptionForSku("vyd_professional_yearly"),
  "Vyaamikk Diary Professional Subscription (Yearly)"
);

console.log("products.unit.test.ts: ok");
