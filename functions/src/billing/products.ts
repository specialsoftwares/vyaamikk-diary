/**
 * Vyaamikk Diary — Canonical subscription catalog (Phase A).
 *
 * Owner decision W-1:
 * - Google Play uses THREE subscription products (vyd_starter,
 *   vyd_professional, vyd_business), each with base plans monthly /
 *   quarterly / yearly. Base plan ids contain NO underscores.
 * - The app keeps NINE canonical SKU keys; Android maps a canonical SKU to
 *   { productId, basePlanId }.
 * - iOS may map a canonical SKU to a distinct App Store product identifier.
 *   The identifiers below are provisional until App Store Connect products
 *   are created (owner decision W-7 defers live Apple work).
 *
 * Prices are EXPECTED COMMERCIAL CONFIG in integer paise for tests/marketing
 * copy only. The purchase UI must always display store-localized pricing;
 * entitlement logic never depends on these numbers.
 *
 * Pure configuration + lookup helpers. Nothing here performs I/O and no store
 * products are created by this file (W-1: do NOT create store products in
 * Phase A).
 */

import type { VyaamikkPlan } from "./types";

export type PaidPlan = Exclude<VyaamikkPlan, "free">;

export type BillingPeriod = "monthly" | "quarterly" | "yearly";

/** The nine internal canonical SKU keys. */
export type CanonicalSku =
  | "vyd_starter_monthly"
  | "vyd_starter_quarterly"
  | "vyd_starter_yearly"
  | "vyd_professional_monthly"
  | "vyd_professional_quarterly"
  | "vyd_professional_yearly"
  | "vyd_business_monthly"
  | "vyd_business_quarterly"
  | "vyd_business_yearly";

export interface AndroidProductMapping {
  /** Google Play subscription productId (one per plan). */
  productId: "vyd_starter" | "vyd_professional" | "vyd_business";
  /** Google Play base plan id — never contains underscores (W-1). */
  basePlanId: BillingPeriod;
}

export interface IosProductMapping {
  /** App Store product identifier (provisional until ASC products exist). */
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
}

function entry(
  plan: PaidPlan,
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
  };
}

/** Canonical catalog — the single source of truth for SKU ↔ store mapping. */
export const SUBSCRIPTION_CATALOG: Readonly<Record<CanonicalSku, CatalogEntry>> = {
  vyd_starter_monthly: entry("starter", "monthly", 9_900),
  vyd_starter_quarterly: entry("starter", "quarterly", 24_900),
  vyd_starter_yearly: entry("starter", "yearly", 79_900),
  vyd_professional_monthly: entry("professional", "monthly", 24_900),
  vyd_professional_quarterly: entry("professional", "quarterly", 64_900),
  vyd_professional_yearly: entry("professional", "yearly", 199_900),
  vyd_business_monthly: entry("business", "monthly", 49_900),
  vyd_business_quarterly: entry("business", "quarterly", 129_900),
  vyd_business_yearly: entry("business", "yearly", 399_900),
};

export const ALL_CANONICAL_SKUS = Object.keys(SUBSCRIPTION_CATALOG) as CanonicalSku[];

export function getCatalogEntry(sku: CanonicalSku): CatalogEntry {
  return SUBSCRIPTION_CATALOG[sku];
}

export function isCanonicalSku(sku: string): sku is CanonicalSku {
  return Object.prototype.hasOwnProperty.call(SUBSCRIPTION_CATALOG, sku);
}

export function subscriptionDescriptionForSku(sku: CanonicalSku): string {
  const entry = getCatalogEntry(sku);
  const plan = `${entry.plan.charAt(0).toUpperCase()}${entry.plan.slice(1)}`;
  const period = `${entry.period.charAt(0).toUpperCase()}${entry.period.slice(1)}`;
  return `Vyaamikk Diary ${plan} Subscription (${period})`;
}

/**
 * Reverse lookup for Android purchase verification: resolve the canonical SKU
 * from the store-reported productId + basePlanId. Returns null for unknown
 * combinations (verification must treat that as a hard failure, never a
 * default plan).
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

/** Reverse lookup for iOS (provisional identifiers; see IosProductMapping). */
export function canonicalSkuForIos(productId: string): CanonicalSku | null {
  for (const sku of ALL_CANONICAL_SKUS) {
    if (SUBSCRIPTION_CATALOG[sku].ios.productId === productId) {
      return sku;
    }
  }
  return null;
}
