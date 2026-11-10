/**
 * Client mirror of the subscription catalog.
 *
 * Server catalog remains functions/src/billing/products.ts.
 * New purchases: vyd_unlimited monthly/yearly only. Legacy nine SKUs stay for
 * recognition/restore. Expected INR paise is omitted so UI cannot use it.
 */

import type {
  BillingPeriod,
  CanonicalSku,
  ClientCatalogEntry,
  NewPurchaseSku,
  PaidPlan,
} from "./iapTypes";

function unlimitedEntry(period: "monthly" | "yearly"): ClientCatalogEntry {
  const canonicalSku = `vyd_unlimited_${period}` as NewPurchaseSku;
  return {
    canonicalSku,
    plan: "unlimited",
    period,
    android: { productId: "vyd_unlimited", basePlanId: period },
    ios: { productId: `com.specialsoftwares.vyaamikkdiary.unlimited.${period}` },
    availableForNewPurchase: true,
  };
}

function legacyEntry(
  plan: Exclude<PaidPlan, "unlimited">,
  period: BillingPeriod
): ClientCatalogEntry {
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
    availableForNewPurchase: false,
  };
}

export const CLIENT_SUBSCRIPTION_CATALOG: Readonly<
  Record<CanonicalSku, ClientCatalogEntry>
> = {
  vyd_unlimited_monthly: unlimitedEntry("monthly"),
  vyd_unlimited_yearly: unlimitedEntry("yearly"),
  vyd_starter_monthly: legacyEntry("starter", "monthly"),
  vyd_starter_quarterly: legacyEntry("starter", "quarterly"),
  vyd_starter_yearly: legacyEntry("starter", "yearly"),
  vyd_professional_monthly: legacyEntry("professional", "monthly"),
  vyd_professional_quarterly: legacyEntry("professional", "quarterly"),
  vyd_professional_yearly: legacyEntry("professional", "yearly"),
  vyd_business_monthly: legacyEntry("business", "monthly"),
  vyd_business_quarterly: legacyEntry("business", "quarterly"),
  vyd_business_yearly: legacyEntry("business", "yearly"),
};

export const ALL_CANONICAL_SKUS = Object.keys(
  CLIENT_SUBSCRIPTION_CATALOG
) as CanonicalSku[];

export const NEW_PURCHASE_SKUS: readonly NewPurchaseSku[] = [
  "vyd_unlimited_monthly",
  "vyd_unlimited_yearly",
];

export const ANDROID_SUBSCRIPTION_PRODUCT_IDS = [
  "vyd_unlimited",
  "vyd_starter",
  "vyd_professional",
  "vyd_business",
] as const;

/** Product IDs fetched for new-purchase selling surfaces. */
export const ANDROID_NEW_PURCHASE_PRODUCT_IDS = ["vyd_unlimited"] as const;

export const IOS_SUBSCRIPTION_PRODUCT_IDS = ALL_CANONICAL_SKUS.map(
  (sku) => CLIENT_SUBSCRIPTION_CATALOG[sku].ios.productId
);

export const IOS_NEW_PURCHASE_PRODUCT_IDS = NEW_PURCHASE_SKUS.map(
  (sku) => CLIENT_SUBSCRIPTION_CATALOG[sku].ios.productId
);

export function getClientCatalogEntry(sku: CanonicalSku): ClientCatalogEntry {
  return CLIENT_SUBSCRIPTION_CATALOG[sku];
}

export function isCanonicalSku(sku: string): sku is CanonicalSku {
  return Object.prototype.hasOwnProperty.call(CLIENT_SUBSCRIPTION_CATALOG, sku);
}

export function isNewPurchaseSku(sku: string): sku is NewPurchaseSku {
  return sku === "vyd_unlimited_monthly" || sku === "vyd_unlimited_yearly";
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
