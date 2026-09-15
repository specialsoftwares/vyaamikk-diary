/**
 * A, B, O — nine canonical SKU mappings and Android 3×3 base plans.
 * Client catalog must stay in parity with functions/src/billing/products.ts.
 */
import assert from "node:assert/strict";

import {
  ALL_CANONICAL_SKUS as serverSkus,
  SUBSCRIPTION_CATALOG as serverCatalog,
} from "../../../functions/src/billing/products";
import {
  ALL_CANONICAL_SKUS,
  ANDROID_SUBSCRIPTION_PRODUCT_IDS,
  CLIENT_SUBSCRIPTION_CATALOG,
  IOS_SUBSCRIPTION_PRODUCT_IDS,
  canonicalSkuForAndroid,
  canonicalSkuForIos,
} from "./iapCatalog";

function testNineCanonicalSkus() {
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
  assert.equal(ALL_CANONICAL_SKUS.length, 9);
}

function testAndroidThreeByThree() {
  assert.deepEqual([...ANDROID_SUBSCRIPTION_PRODUCT_IDS], [
    "vyd_starter",
    "vyd_professional",
    "vyd_business",
  ]);
  for (const plan of ["starter", "professional", "business"] as const) {
    for (const period of ["monthly", "quarterly", "yearly"] as const) {
      const sku = `vyd_${plan}_${period}` as keyof typeof CLIENT_SUBSCRIPTION_CATALOG;
      const e = CLIENT_SUBSCRIPTION_CATALOG[sku];
      assert.equal(e.android.productId, `vyd_${plan}`);
      assert.equal(e.android.basePlanId, period);
      assert.equal(canonicalSkuForAndroid(e.android.productId, e.android.basePlanId), sku);
    }
  }
}

function testIosProvisionalIds() {
  assert.equal(IOS_SUBSCRIPTION_PRODUCT_IDS.length, 9);
  for (const sku of ALL_CANONICAL_SKUS) {
    const e = CLIENT_SUBSCRIPTION_CATALOG[sku];
    assert.equal(
      e.ios.productId,
      `com.specialsoftwares.vyaamikkdiary.${e.plan}.${e.period}`
    );
    assert.equal(canonicalSkuForIos(e.ios.productId), sku);
  }
}

function testParityWithServerCatalog() {
  assert.deepEqual([...ALL_CANONICAL_SKUS].sort(), [...serverSkus].sort());
  for (const sku of ALL_CANONICAL_SKUS) {
    const client = CLIENT_SUBSCRIPTION_CATALOG[sku];
    const server = serverCatalog[sku];
    assert.equal(client.canonicalSku, server.canonicalSku);
    assert.equal(client.plan, server.plan);
    assert.equal(client.period, server.period);
    assert.equal(client.android.productId, server.android.productId);
    assert.equal(client.android.basePlanId, server.android.basePlanId);
    assert.equal(client.ios.productId, server.ios.productId);
  }
}

function testClientCatalogHasNoDisplayPriceAuthority() {
  const src = JSON.stringify(CLIENT_SUBSCRIPTION_CATALOG);
  assert.equal("expectedPriceInPaise" in CLIENT_SUBSCRIPTION_CATALOG.vyd_starter_monthly, false);
  assert.doesNotMatch(src, /9900|24900|expectedPrice/);
}

function main() {
  testNineCanonicalSkus();
  testAndroidThreeByThree();
  testIosProvisionalIds();
  testParityWithServerCatalog();
  testClientCatalogHasNoDisplayPriceAuthority();
  console.log("iapCatalog.test.ts: ok");
}

main();
