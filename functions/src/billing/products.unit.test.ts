/**
 * Canonical SKU catalog contract tests (owner decision W-1).
 * Run: npm run test:billing-catalog
 */

import assert from "node:assert/strict";

import {
  ALL_CANONICAL_SKUS,
  canonicalSkuForAndroid,
  canonicalSkuForIos,
  getCatalogEntry,
  SUBSCRIPTION_CATALOG,
} from "./products";
import { PLAN_MONTHLY_RECORD_LIMITS, UNLIMITED_RECORDS } from "./types";

// Exactly nine canonical SKUs, matching the owner-locked commercial list.
assert.equal(ALL_CANONICAL_SKUS.length, 9);
assert.deepEqual(
  [...ALL_CANONICAL_SKUS].sort(),
  [
    "vyd_business_monthly",
    "vyd_business_quarterly",
    "vyd_business_yearly",
    "vyd_professional_monthly",
    "vyd_professional_quarterly",
    "vyd_professional_yearly",
    "vyd_starter_monthly",
    "vyd_starter_quarterly",
    "vyd_starter_yearly",
  ]
);

// W-1: three Android products, base plans monthly/quarterly/yearly, and
// base plan ids must never contain underscores.
const androidProducts = new Set<string>();
for (const sku of ALL_CANONICAL_SKUS) {
  const e = SUBSCRIPTION_CATALOG[sku];
  assert.equal(e.canonicalSku, sku);
  androidProducts.add(e.android.productId);
  assert.ok(!e.android.basePlanId.includes("_"), `basePlanId has underscore: ${e.android.basePlanId}`);
  assert.ok(["monthly", "quarterly", "yearly"].includes(e.android.basePlanId));
  assert.equal(e.android.productId, `vyd_${e.plan}`);
  assert.equal(e.period, e.android.basePlanId);
  // Money is integer paise.
  assert.ok(Number.isInteger(e.expectedPriceInPaise) && e.expectedPriceInPaise > 0);
}
assert.deepEqual([...androidProducts].sort(), ["vyd_business", "vyd_professional", "vyd_starter"]);

// Owner-locked expected commercial prices (paise).
assert.equal(getCatalogEntry("vyd_starter_monthly").expectedPriceInPaise, 9_900);
assert.equal(getCatalogEntry("vyd_starter_quarterly").expectedPriceInPaise, 24_900);
assert.equal(getCatalogEntry("vyd_starter_yearly").expectedPriceInPaise, 79_900);
assert.equal(getCatalogEntry("vyd_professional_monthly").expectedPriceInPaise, 24_900);
assert.equal(getCatalogEntry("vyd_professional_quarterly").expectedPriceInPaise, 64_900);
assert.equal(getCatalogEntry("vyd_professional_yearly").expectedPriceInPaise, 199_900);
assert.equal(getCatalogEntry("vyd_business_monthly").expectedPriceInPaise, 49_900);
assert.equal(getCatalogEntry("vyd_business_quarterly").expectedPriceInPaise, 129_900);
assert.equal(getCatalogEntry("vyd_business_yearly").expectedPriceInPaise, 399_900);

// Android reverse lookup: exact example from the owner spec, full round-trip,
// and hard-null on unknown combinations (no default plan).
assert.equal(canonicalSkuForAndroid("vyd_professional", "yearly"), "vyd_professional_yearly");
for (const sku of ALL_CANONICAL_SKUS) {
  const e = SUBSCRIPTION_CATALOG[sku];
  assert.equal(canonicalSkuForAndroid(e.android.productId, e.android.basePlanId), sku);
}
assert.equal(canonicalSkuForAndroid("vyd_professional", "yearly_v2"), null);
assert.equal(canonicalSkuForAndroid("vyd_professional_yearly", "yearly"), null);
assert.equal(canonicalSkuForAndroid("com.other.app", "monthly"), null);

// iOS identifiers are unique and round-trip.
const iosIds = new Set(ALL_CANONICAL_SKUS.map((s) => SUBSCRIPTION_CATALOG[s].ios.productId));
assert.equal(iosIds.size, 9);
for (const sku of ALL_CANONICAL_SKUS) {
  assert.equal(canonicalSkuForIos(SUBSCRIPTION_CATALOG[sku].ios.productId), sku);
}
assert.equal(canonicalSkuForIos("com.specialsoftwares.vyaamikk.starter.monthly"), null);

// Plan monthly record limits (mirrored by firestore.rules monthlyRecordCap).
assert.equal(PLAN_MONTHLY_RECORD_LIMITS.free, 25);
assert.equal(PLAN_MONTHLY_RECORD_LIMITS.starter, 100);
assert.equal(PLAN_MONTHLY_RECORD_LIMITS.professional, UNLIMITED_RECORDS);
assert.equal(PLAN_MONTHLY_RECORD_LIMITS.business, UNLIMITED_RECORDS);

console.log("products.unit.test.ts: ok");
