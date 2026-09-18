/**
 * Map live IAP + subscription views onto UpgradeSheet presentation props.
 * No fixture prices, no client entitlement writes, no invented eligibility.
 */

import { ALL_CANONICAL_SKUS, getClientCatalogEntry, isCanonicalSku } from "@/billing/iap/iapCatalog";
import type { CanonicalSku, IapView, PurchaseFlowResult } from "@/billing/iap/iapTypes";
import type {
  UpgradeCatalogPeriod,
  UpgradeCatalogState,
  UpgradeOperationState,
  UpgradePlanOffer,
  TranslateFn,
} from "@/components/billing/upgradeTypes";
import { UNLIMITED_RECORDS, type ClientSubscriptionStatus, type VyaamikkPlan } from "@/subscription/types";
import type { SubscriptionFeatures } from "@/subscription/subscriptionFeatures";

const PLAN_NAME_KEYS: Record<VyaamikkPlan, string> = {
  free: "billing.upgrade.freePlanName",
  starter: "billing.upgrade.plans.starter.name",
  professional: "billing.upgrade.plans.professional.name",
  business: "billing.upgrade.plans.business.name",
};

export type QuotaUpsellCatalogSource = Pick<
  IapView,
  "available" | "unavailableReason" | "connected" | "catalog" | "pending" | "lastResult" | "purchaseInFlight"
>;

export type QuotaUpsellSubscriptionSource = {
  status: ClientSubscriptionStatus;
  plan: VyaamikkPlan;
  features: SubscriptionFeatures;
};

export type MappedUpgradeSheetModel = {
  triggerContext: "recordLimitReached";
  currentPlanLabel: string;
  entitlementLabel: string;
  trialEligible: boolean;
  trialActionAvailable: false;
  offers: UpgradePlanOffer[];
  catalogState: UpgradeCatalogState;
  purchaseAvailable: boolean;
  restoreAvailable: boolean;
  purchaseState: UpgradeOperationState;
  restoreState: UpgradeOperationState;
  errorMessage: string | null;
  defaultSku: string | null;
  defaultPeriod: UpgradeCatalogPeriod;
};

export function currentPlanLabel(t: TranslateFn, plan: VyaamikkPlan): string {
  return t(PLAN_NAME_KEYS[plan]);
}

export function entitlementLabel(
  t: TranslateFn,
  input: { status: ClientSubscriptionStatus; features: SubscriptionFeatures }
): string {
  if (!input.status.entitlementActive) return t("billing.upgrade.entitlementInactive");
  if (input.features.monthlyRecordLimit === UNLIMITED_RECORDS) {
    return t("billing.upgrade.entitlementUnlimited");
  }
  return t("billing.upgrade.entitlementLimit", { limit: input.features.monthlyRecordLimit });
}

function offerForSku(
  sku: CanonicalSku,
  catalog: QuotaUpsellCatalogSource["catalog"],
  catalogState: UpgradeCatalogState
): UpgradePlanOffer {
  const entry = getClientCatalogEntry(sku);
  const row = catalog.find((item) => item.canonicalSku === sku);
  if (catalogState === "loading" && (!row || row.displayPrice == null)) {
    return { planId: entry.plan, period: entry.period, sku, offer: { status: "loading" } };
  }
  if (row?.available && row.displayPrice) {
    return {
      planId: entry.plan,
      period: entry.period,
      sku,
      offer: { status: "ready", displayPrice: row.displayPrice },
    };
  }
  return { planId: entry.plan, period: entry.period, sku, offer: { status: "unavailable" } };
}

export function catalogStateFromIap(iap: QuotaUpsellCatalogSource): UpgradeCatalogState {
  if (!iap.available) return "unavailable";
  if (!iap.connected && iap.catalog.length === 0) return "loading";
  if (iap.catalog.length === 0) return "loading";
  if (iap.catalog.some((row) => row.available && row.displayPrice)) return "ready";
  return "unavailable";
}

function operationStateFromIap(
  iap: QuotaUpsellCatalogSource,
  hostState: UpgradeOperationState,
  purchaseLane: boolean
): UpgradeOperationState {
  if (hostState === "loading" || hostState === "pending" || hostState === "unavailable") {
    return hostState;
  }
  if (!iap.available) return "unavailable";
  if (purchaseLane) {
    if (iap.pending && (iap.pending.stage === "store_pending" || iap.pending.stage === "verifying")) {
      return "pending";
    }
    if (iap.purchaseInFlight) return "loading";
  }
  return "idle";
}

export function errorMessageFromPurchaseResult(result: PurchaseFlowResult | null): string | null {
  if (!result) return null;
  if (result.kind === "failed") return result.message;
  return null;
}

export function mapUpgradeSheetModel(input: {
  t: TranslateFn;
  iap: QuotaUpsellCatalogSource;
  subscription: QuotaUpsellSubscriptionSource;
  hostPurchaseState: UpgradeOperationState;
  hostRestoreState: UpgradeOperationState;
  hostErrorMessage: string | null;
}): MappedUpgradeSheetModel {
  const catalogState = catalogStateFromIap(input.iap);
  const offers = ALL_CANONICAL_SKUS.map((sku) => offerForSku(sku, input.iap.catalog, catalogState));
  const anyReady = offers.some((offer) => offer.offer.status === "ready");
  const purchaseAvailable = input.iap.available && anyReady;
  const restoreAvailable = input.iap.available;
  const purchaseState = operationStateFromIap(input.iap, input.hostPurchaseState, true);
  const restoreState = operationStateFromIap(input.iap, input.hostRestoreState, false);
  const iapError = errorMessageFromPurchaseResult(input.iap.lastResult);
  const defaultReady = offers.find((offer) => offer.offer.status === "ready");
  return {
    triggerContext: "recordLimitReached",
    currentPlanLabel: currentPlanLabel(input.t, input.subscription.plan),
    entitlementLabel: entitlementLabel(input.t, input.subscription),
    trialEligible: false,
    trialActionAvailable: false,
    offers,
    catalogState,
    purchaseAvailable,
    restoreAvailable,
    purchaseState,
    restoreState,
    errorMessage: input.hostErrorMessage ?? iapError,
    defaultSku: defaultReady?.sku ?? null,
    defaultPeriod: defaultReady?.period ?? "monthly",
  };
}

export function asCanonicalPurchaseSku(sku: string): CanonicalSku | null {
  return isCanonicalSku(sku) ? sku : null;
}
