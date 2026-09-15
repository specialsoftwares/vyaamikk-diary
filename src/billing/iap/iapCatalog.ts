/**
 * Client mirror of the nine canonical subscription SKUs.
 *
 * Server catalog remains functions/src/billing/products.ts.
 * This file duplicates store mappings only — expected INR paise is NOT
 * display-price authority and is intentionally omitted so UI cannot use it.
 *
 * Do not import Firebase Admin or functions runtime from React Native.
 */

import type {
  BillingPeriod,
  CanonicalSku,
  ClientCatalogEntry,
  PaidPlan,
} from "./iapTypes";

function entry(plan: PaidPlan, period: BillingPeriod): ClientCatalogEntry {
  const canonicalSku = `vyd_${plan}_${period}` as CanonicalSku;
  return {
    canonicalSku,
    plan,
    period,
    android: {
      productId: `vyd_${plan}` as ClientCatalogEntry["android"]["productId"],
      basePlanId: period,
    },
    ios: {
      productId: `com.specialsoftwares.vyaamikkdiary.${plan}.${period}`,
    },
  };
}

export const CLIENT_SUBSCRIPTION_CATALOG: Readonly<
  Record<CanonicalSku, ClientCatalogEntry>
> = {
  vyd_starter_monthly: entry("starter", "monthly"),
  vyd_starter_quarterly: entry("starter", "quarterly"),
  vyd_starter_yearly: entry("starter", "yearly"),
  vyd_professional_monthly: entry("professional", "monthly"),
  vyd_professional_quarterly: entry("professional", "quarterly"),
  vyd_professional_yearly: entry("professional", "yearly"),
  vyd_business_monthly: entry("business", "monthly"),
  vyd_business_quarterly: entry("business", "quarterly"),
  vyd_business_yearly: entry("business", "yearly"),
};

export const ALL_CANONICAL_SKUS = Object.keys(
  CLIENT_SUBSCRIPTION_CATALOG
) as CanonicalSku[];

export const ANDROID_SUBSCRIPTION_PRODUCT_IDS = [
  "vyd_starter",
  "vyd_professional",
  "vyd_business",
] as const;

export const IOS_SUBSCRIPTION_PRODUCT_IDS = ALL_CANONICAL_SKUS.map(
  (sku) => CLIENT_SUBSCRIPTION_CATALOG[sku].ios.productId
);

export function getClientCatalogEntry(sku: CanonicalSku): ClientCatalogEntry {
  return CLIENT_SUBSCRIPTION_CATALOG[sku];
}

export function isCanonicalSku(sku: string): sku is CanonicalSku {
  return Object.prototype.hasOwnProperty.call(CLIENT_SUBSCRIPTION_CATALOG, sku);
}

export function canonicalSkuForAndroid(
  productId: string,
  basePlanId: string
): CanonicalSku | null {
  for (const sku of ALL_CANONICAL_SKUS) {
    const e = CLIENT_SUBSCRIPTION_CATALOG[sku];
    if (e.android.productId === productId && e.android.basePlanId === basePlanId) {
      return sku;
    }
  }
  return null;
}

export function canonicalSkuForIos(productId: string): CanonicalSku | null {
  for (const sku of ALL_CANONICAL_SKUS) {
    if (CLIENT_SUBSCRIPTION_CATALOG[sku].ios.productId === productId) {
      return sku;
    }
  }
  return null;
}
