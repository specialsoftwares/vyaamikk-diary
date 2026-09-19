/**
 * Presentation contracts for UpgradeSheet / BenefitEducationScreen.
 *
 * These types are display-only. They do not grant entitlement, start IAP,
 * or write subscription/status. Callers pass already-resolved labels, store
 * prices, and backend trial eligibility.
 */

export const UPGRADE_TRIGGER_CONTEXTS = [
  "recordLimitReached",
  "featureLocked",
  "trialExpiring",
  "manualUpgrade",
] as const;

export type UpgradeTriggerContext = (typeof UPGRADE_TRIGGER_CONTEXTS)[number];

export const UPGRADE_PLAN_IDS = ["starter", "professional", "business"] as const;
export type UpgradePlanId = (typeof UPGRADE_PLAN_IDS)[number];

export const UPGRADE_PERIODS = ["monthly", "quarterly", "yearly"] as const;
export type UpgradeCatalogPeriod = (typeof UPGRADE_PERIODS)[number];

export type UpgradeOfferStatus = "ready" | "loading" | "unavailable";
export type UpgradeCatalogState = "loading" | "ready" | "unavailable";
export type UpgradeOperationState = "idle" | "loading" | "pending" | "unavailable";

export interface UpgradePlanOffer {
  planId: UpgradePlanId;
  period: UpgradeCatalogPeriod;
  sku: string;
  offer: { status: "ready"; displayPrice: string } | { status: "loading" } | { status: "unavailable" };
}

export interface UpgradePlanCardModel {
  sku: string;
  planId: UpgradePlanId;
  period: UpgradeCatalogPeriod;
  name: string;
  benefits: string[];
  priceLabel: string | null;
  priceState: UpgradeOfferStatus;
}

export type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;
