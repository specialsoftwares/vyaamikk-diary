/**
 * Client catalog parity with functions/src/billing/products.ts.
 * New purchases are unlimited monthly/yearly only; legacy SKUs remain for restore.
 */
import assert from "node:assert/strict";

import {
  ALL_CANONICAL_SKUS as serverSkus,
  NEW_PURCHASE_SKUS as serverNewPurchase,
  SUBSCRIPTION_CATALOG as serverCatalog,
} from "../../../functions/src/billing/products";
import {
  ALL_CANONICAL_SKUS,
  ANDROID_NEW_PURCHASE_PRODUCT_IDS,
  ANDROID_SUBSCRIPTION_PRODUCT_IDS,
  CLIENT_SUBSCRIPTION_CATALOG,
  IOS_NEW_PURCHASE_PRODUCT_IDS,
  IOS_SUBSCRIPTION_PRODUCT_IDS,
  NEW_PURCHASE_SKUS,
  canonicalSkuForAndroid,
  canonicalSkuForIos,
  isNewPurchaseSku,
} from "./iapCatalog";

assert.deepEqual([...NEW_PURCHASE_SKUS], [...serverNewPurchase]);
assert.deepEqual([...ALL_CANONICAL_SKUS].sort(), [...serverSkus].sort());
assert.equal(ALL_CANONICAL_SKUS.length, 11);
assert.equal(isNewPurchaseSku("vyd_unlimited_yearly"), true);
assert.equal(isNewPurchaseSku("vyd_business_monthly"), false);

assert.deepEqual([...ANDROID_NEW_PURCHASE_PRODUCT_IDS], ["vyd_unlimited"]);
assert.ok(ANDROID_SUBSCRIPTION_PRODUCT_IDS.includes("vyd_unlimited"));
assert.ok(ANDROID_SUBSCRIPTION_PRODUCT_IDS.includes("vyd_starter"));

for (const sku of ALL_CANONICAL_SKUS) {
  const client = CLIENT_SUBSCRIPTION_CATALOG[sku];
  const server = serverCatalog[sku];
  assert.equal(client.canonicalSku, server.canonicalSku);
  assert.equal(client.plan, server.plan);
  assert.equal(client.period, server.period);
  assert.equal(client.android.productId, server.android.productId);
  assert.equal(client.android.basePlanId, server.android.basePlanId);
  assert.equal(client.ios.productId, server.ios.productId);
  assert.equal(client.availableForNewPurchase, server.availableForNewPurchase);
  assert.equal(canonicalSkuForAndroid(client.android.productId, client.android.basePlanId), sku);
  assert.equal(canonicalSkuForIos(client.ios.productId), sku);
}

assert.equal(IOS_SUBSCRIPTION_PRODUCT_IDS.length, 11);
assert.equal(IOS_NEW_PURCHASE_PRODUCT_IDS.length, 2);

console.log("iapCatalog.test.ts: ok");
