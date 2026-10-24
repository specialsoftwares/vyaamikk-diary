/**
 * Map live IAP + subscription views onto UpgradeSheet presentation props.
 * No fixture prices, no client entitlement writes, no invented eligibility.
 */

import { ALL_CANONICAL_SKUS, getClientCatalogEntry, isCanonicalSku } from "@/billing/iap/iapCatalog";
import type { CanonicalSku, IapView } from "@/billing/iap/iapTypes";
import type {
  UpgradeCatalogPeriod,
  UpgradeCatalogState,
  UpgradeOperationState,
  UpgradePlanOffer,
  TranslateFn,
  UpgradeTriggerContext,
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
  triggerContext: UpgradeTriggerContext;
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
  statusNotice: string | null;
  errorMessage: string | null;
  errorRetryEnabled: boolean;
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
  if (hostState === "unavailable") return "unavailable";
  if (!iap.available) return "unavailable";
  if (purchaseLane) {
    const stage = iap.pending?.stage;
    if (stage === "verifying" || stage === "verified_unfinished_ios") return "verifying";
    if (stage === "store_pending") return "pending";
    if (hostState === "loading" || iap.purchaseInFlight) return "loading";
    if (hostState === "pending") return "pending";
    return "idle";
  }
  if (hostState === "loading" || hostState === "pending" || hostState === "verifying") {
    return hostState;
  }
  return "idle";
}

export function purchaseStatusNotice(
  t: TranslateFn,
  iap: Pick<QuotaUpsellCatalogSource, "pending" | "lastResult" | "purchaseInFlight">
): string | null {
  const stage = iap.pending?.stage;
  if (stage === "verifying" || stage === "verified_unfinished_ios") {
    return t("billing.upgrade.purchaseVerifying");
  }
  if (stage === "store_pending") return t("billing.upgrade.purchasePendingPayment");
  if (iap.purchaseInFlight) return t("billing.upgrade.purchaseLoading");
  if (iap.lastResult?.kind === "verified") return t("billing.upgrade.purchaseVerified");
  return null;
}

export function mapUpgradeSheetModel(input: {
  t: TranslateFn;
  iap: QuotaUpsellCatalogSource;
  subscription: QuotaUpsellSubscriptionSource;
  hostPurchaseState: UpgradeOperationState;
  hostRestoreState: UpgradeOperationState;
  hostErrorMessage: string | null;
  errorRecoverable?: boolean;
  triggerContext?: UpgradeTriggerContext;
}): MappedUpgradeSheetModel {
  const catalogState = catalogStateFromIap(input.iap);
  const offers = ALL_CANONICAL_SKUS.map((sku) => offerForSku(sku, input.iap.catalog, catalogState));
  const anyReady = offers.some((offer) => offer.offer.status === "ready");
  const purchaseAvailable = input.iap.available && anyReady;
  const restoreAvailable = input.iap.available;
  const purchaseState = operationStateFromIap(input.iap, input.hostPurchaseState, true);
  const restoreState = operationStateFromIap(input.iap, input.hostRestoreState, false);
  const defaultReady = offers.find((offer) => offer.offer.status === "ready");
  return {
    triggerContext: input.triggerContext ?? "recordLimitReached",
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
    statusNotice: purchaseStatusNotice(input.t, input.iap),
    errorMessage: input.hostErrorMessage,
    errorRetryEnabled: Boolean(input.hostErrorMessage) && input.errorRecoverable === true,
    defaultSku: defaultReady?.sku ?? null,
    defaultPeriod: defaultReady?.period ?? "monthly",
  };
}

export function asCanonicalPurchaseSku(sku: string): CanonicalSku | null {
  return isCanonicalSku(sku) ? sku : null;
}
