/**
 * Vyaamikk Diary — Canonical subscription catalog.
 *
 * New purchases: one Play product `vyd_unlimited` with base plans
 * `monthly` (₹136) and `yearly` (₹1,832). Legacy nine SKUs remain for
 * recognition/restore of existing subscribers only — they are not sold.
 *
 * Prices are EXPECTED COMMERCIAL CONFIG in integer paise for tests/marketing
 * copy only. SOURCE expected — not live Play / App Store authority. The
 * purchase UI must always display store-localized pricing.
 *
 * GRIN is included in unlimited and in legacy paid plans. No separate GRIN SKU.
 */

import type { VyaamikkPlan } from "./types";

export type PaidPlan = Exclude<VyaamikkPlan, "free">;

export type BillingPeriod = "monthly" | "quarterly" | "yearly";

/** New-purchase SKUs plus legacy recognition SKUs. */
export type CanonicalSku =
  | "vyd_unlimited_monthly"
  | "vyd_unlimited_yearly"
  | "vyd_starter_monthly"
  | "vyd_starter_quarterly"
  | "vyd_starter_yearly"
  | "vyd_professional_monthly"
  | "vyd_professional_quarterly"
  | "vyd_professional_yearly"
  | "vyd_business_monthly"
  | "vyd_business_quarterly"
  | "vyd_business_yearly";

/** SKUs exposed on selling surfaces. */
export type NewPurchaseSku = "vyd_unlimited_monthly" | "vyd_unlimited_yearly";

export interface AndroidProductMapping {
  productId: "vyd_unlimited" | "vyd_starter" | "vyd_professional" | "vyd_business";
  /** Google Play base plan id — never contains underscores. */
  basePlanId: BillingPeriod;
}

export interface IosProductMapping {
  productId: string;
}

export interface CatalogEntry {
  canonicalSku: CanonicalSku;
  plan: PaidPlan;
  period: BillingPeriod;
  android: AndroidProductMapping;
  ios: IosProductMapping;
  /** Expected INR price in integer paise (config for tests/marketing only). */
  expectedPriceInPaise: number;
  /** False for legacy SKUs — restore/recognition only. */
  availableForNewPurchase: boolean;
}

function unlimitedEntry(
  period: "monthly" | "yearly",
  expectedPriceInPaise: number
): CatalogEntry {
  const canonicalSku = `vyd_unlimited_${period}` as NewPurchaseSku;
  return {
    canonicalSku,
    plan: "unlimited",
    period,
    android: { productId: "vyd_unlimited", basePlanId: period },
    ios: { productId: `com.specialsoftwares.vyaamikkdiary.unlimited.${period}` },
    expectedPriceInPaise,
    availableForNewPurchase: true,
  };
}

function legacyEntry(
  plan: Exclude<PaidPlan, "unlimited">,
  period: BillingPeriod,
  expectedPriceInPaise: number
): CatalogEntry {
  const canonicalSku = `vyd_${plan}_${period}` as CanonicalSku;
  return {
    canonicalSku,
    plan,
    period,
    android: { productId: `vyd_${plan}` as AndroidProductMapping["productId"], basePlanId: period },
    ios: { productId: `com.specialsoftwares.vyaamikkdiary.${plan}.${period}` },
    expectedPriceInPaise,
    availableForNewPurchase: false,
  };
}

/** Canonical catalog — recognition + new purchase. */
export const SUBSCRIPTION_CATALOG: Readonly<Record<CanonicalSku, CatalogEntry>> = {
  vyd_unlimited_monthly: unlimitedEntry("monthly", 13_600),
  vyd_unlimited_yearly: unlimitedEntry("yearly", 183_200),
  vyd_starter_monthly: legacyEntry("starter", "monthly", 9_900),
  vyd_starter_quarterly: legacyEntry("starter", "quarterly", 24_900),
  vyd_starter_yearly: legacyEntry("starter", "yearly", 79_900),
  vyd_professional_monthly: legacyEntry("professional", "monthly", 24_900),
  vyd_professional_quarterly: legacyEntry("professional", "quarterly", 64_900),
  vyd_professional_yearly: legacyEntry("professional", "yearly", 199_900),
  vyd_business_monthly: legacyEntry("business", "monthly", 49_900),
  vyd_business_quarterly: legacyEntry("business", "quarterly", 129_900),
  vyd_business_yearly: legacyEntry("business", "yearly", 399_900),
};

export const ALL_CANONICAL_SKUS = Object.keys(SUBSCRIPTION_CATALOG) as CanonicalSku[];

export const NEW_PURCHASE_SKUS: readonly NewPurchaseSku[] = [
  "vyd_unlimited_monthly",
  "vyd_unlimited_yearly",
];

export const LEGACY_RECOGNITION_SKUS: readonly CanonicalSku[] = ALL_CANONICAL_SKUS.filter(
  (sku) => !SUBSCRIPTION_CATALOG[sku].availableForNewPurchase
);

/** GRIN is bundled into unlimited and legacy paid plans. */
export const GRIN_INCLUDED_IN_EXISTING_PLANS = true as const;

export function getCatalogEntry(sku: CanonicalSku): CatalogEntry {
  return SUBSCRIPTION_CATALOG[sku];
}

export function isCanonicalSku(sku: string): sku is CanonicalSku {
  return Object.prototype.hasOwnProperty.call(SUBSCRIPTION_CATALOG, sku);
}

export function isNewPurchaseSku(sku: string): sku is NewPurchaseSku {
  return sku === "vyd_unlimited_monthly" || sku === "vyd_unlimited_yearly";
}

export function subscriptionDescriptionForSku(sku: CanonicalSku): string {
  const entry = getCatalogEntry(sku);
  if (entry.plan === "unlimited") {
    const period = `${entry.period.charAt(0).toUpperCase()}${entry.period.slice(1)}`;
    return `Vyaamikk Diary Unlimited Subscription (${period})`;
  }
  const plan = `${entry.plan.charAt(0).toUpperCase()}${entry.plan.slice(1)}`;
  const period = `${entry.period.charAt(0).toUpperCase()}${entry.period.slice(1)}`;
  return `Vyaamikk Diary ${plan} Subscription (${period})`;
}

/**
 * Reverse lookup for Android purchase verification. Returns null for unknown
 * combinations (hard failure — never a default plan).
 */
export function canonicalSkuForAndroid(
  productId: string,
  basePlanId: string
): CanonicalSku | null {
  for (const sku of ALL_CANONICAL_SKUS) {
    const e = SUBSCRIPTION_CATALOG[sku];
    if (e.android.productId === productId && e.android.basePlanId === basePlanId) {
      return sku;
    }
  }
  return null;
}

export function canonicalSkuForIos(productId: string): CanonicalSku | null {
  for (const sku of ALL_CANONICAL_SKUS) {
    if (SUBSCRIPTION_CATALOG[sku].ios.productId === productId) {
      return sku;
    }
  }
  return null;
}
