/**
 * Copy and CTA helpers for billing presentation.
 *
 * No store calls, no entitlement writes, no invented live prices.
 * Trial CTA is shown only when the caller passes backend-confirmed eligibility
 * AND a supported client trial-start. The accepted grant is server-only
 * (`grantProfessionalTrial`); there is no client callable.
 */

import {
  UPGRADE_PERIODS,
  type TranslateFn,
  type UpgradeCatalogPeriod,
  type UpgradeCatalogState,
  type UpgradeOperationState,
  type UpgradePlanCardModel,
  type UpgradePlanId,
  type UpgradePlanOffer,
  type UpgradeTriggerContext,
} from "./upgradeTypes";

/**
 * W-9: unsubstantiated social-proof. Must stay false until owner/legal approval.
 * UpgradeSheet must not render this claim while the flag is false.
 */
export const SHOW_TRUSTED_BY_INDIAN_BUSINESS_OWNERS_CLAIM = false;

/**
 * Manual client trial start is not supported. Do not invent a callable.
 * Preview fixtures may pass true only to exercise the trial dispatch path.
 */
export const CLIENT_MANUAL_TRIAL_START_SUPPORTED = false;

/** Forbidden until SHOW_TRUSTED_BY_INDIAN_BUSINESS_OWNERS_CLAIM is approved. */
export const UNAPPROVED_TRUSTED_BY_CLAIM = "TRUSTED BY INDIAN BUSINESS OWNERS";

export const FORBIDDEN_W9_CLAIM_FRAGMENTS = [
  "cannot be backdated",
  "cannot be duplicated",
  "holds in any dispute",
  UNAPPROVED_TRUSTED_BY_CLAIM,
] as const;

export type UpgradeCtaKind =
  | "trial"
  | "subscribe"
  | "unavailable"
  | "pending"
  | "loading"
  | "trialUnavailable";

export type UpgradePrimaryDispatch = "purchase" | "trial" | "none";

export interface UpgradeTriggerCopy {
  title: string;
  subtitle: string;
}

export function upgradeTriggerCopy(t: TranslateFn, triggerContext: UpgradeTriggerContext): UpgradeTriggerCopy {
  switch (triggerContext) {
    case "recordLimitReached":
      return {
        title: t("billing.upgrade.trigger.recordLimitReached.title"),
        subtitle: t("billing.upgrade.trigger.recordLimitReached.subtitle"),
      };
    case "featureLocked":
      return {
        title: t("billing.upgrade.trigger.featureLocked.title"),
        subtitle: t("billing.upgrade.trigger.featureLocked.subtitle"),
      };
    case "trialExpiring":
      return {
        title: t("billing.upgrade.trigger.trialExpiring.title"),
        subtitle: t("billing.upgrade.trigger.trialExpiring.subtitle"),
      };
    case "manualUpgrade":
      return {
        title: t("billing.upgrade.trigger.manualUpgrade.title"),
        subtitle: t("billing.upgrade.trigger.manualUpgrade.subtitle"),
      };
  }
}

export function upgradePeriodLabel(t: TranslateFn, period: UpgradeCatalogPeriod): string {
  switch (period) {
    case "monthly":
      return t("billing.upgrade.periodMonthly");
    case "quarterly":
      return t("billing.upgrade.periodQuarterly");
    case "yearly":
      return t("billing.upgrade.periodYearly");
  }
}

function planCardCopy(
  t: TranslateFn,
  planId: UpgradePlanId
): { name: string; benefits: string[] } {
  switch (planId) {
    case "starter":
      return {
        name: t("billing.upgrade.plans.starter.name"),
        benefits: [
          t("billing.upgrade.plans.starter.b1"),
          t("billing.upgrade.plans.starter.b2"),
        ],
      };
    case "professional":
      return {
        name: t("billing.upgrade.plans.professional.name"),
        benefits: [
          t("billing.upgrade.plans.professional.b1"),
          t("billing.upgrade.plans.professional.b2"),
          t("billing.upgrade.plans.professional.b3"),
        ],
      };
    case "business":
      return {
        name: t("billing.upgrade.plans.business.name"),
        benefits: [
          t("billing.upgrade.plans.business.b1"),
          t("billing.upgrade.plans.business.b2"),
          t("billing.upgrade.plans.business.b3"),
          t("billing.upgrade.plans.business.b4"),
        ],
      };
  }
}

export function buildUpgradePlanCards(
  t: TranslateFn,
  offers: readonly UpgradePlanOffer[],
  period: UpgradeCatalogPeriod
): UpgradePlanCardModel[] {
  const cards: UpgradePlanCardModel[] = [];
  for (const offer of offers) {
    if (offer.period !== period) continue;
    const copy = planCardCopy(t, offer.planId);
    const offerState = offer.offer;
    cards.push({
      sku: offer.sku,
      planId: offer.planId,
      period: offer.period,
      name: copy.name,
      benefits: copy.benefits,
      priceLabel: offerState.status === "ready" ? offerState.displayPrice : null,
      priceState: offerState.status,
    });
  }
  return cards;
}

export function planIdForSku(
  offers: readonly UpgradePlanOffer[],
  sku: string | null
): UpgradePlanId | null {
  if (!sku) return null;
  for (const offer of offers) {
    if (offer.sku === sku) return offer.planId;
  }
  return null;
}

export function resolveUpgradeCta(input: {
  trialEligible: boolean;
  trialActionAvailable: boolean;
  selectedPlanId: UpgradePlanId | null;
  purchaseAvailable: boolean;
  purchaseState: UpgradeOperationState;
  catalogState: UpgradeCatalogState;
  hasError?: boolean;
}): { kind: UpgradeCtaKind; enabled: boolean; labelKey: string; dispatch: UpgradePrimaryDispatch } {
  if (input.catalogState === "loading" || input.purchaseState === "loading") {
    return {
      kind: "loading",
      enabled: false,
      labelKey: "billing.upgrade.purchaseLoading",
      dispatch: "none",
    };
  }
  if (input.purchaseState === "pending") {
    return {
      kind: "pending",
      enabled: false,
      labelKey: "billing.upgrade.purchasePending",
      dispatch: "none",
    };
  }
  if (
    !input.purchaseAvailable ||
    input.purchaseState === "unavailable" ||
    input.catalogState === "unavailable"
  ) {
    return {
      kind: "unavailable",
      enabled: false,
      labelKey: "billing.upgrade.purchaseUnavailable",
      dispatch: "none",
    };
  }

  const professionalTrialSelected =
    input.trialEligible === true && input.selectedPlanId === "professional";

  if (professionalTrialSelected) {
    if (input.trialActionAvailable !== true) {
      return {
        kind: "trialUnavailable",
        enabled: false,
        labelKey: "billing.upgrade.ctaTrialUnavailable",
        dispatch: "none",
      };
    }
    if (input.hasError) {
      return {
        kind: "trial",
        enabled: false,
        labelKey: "billing.upgrade.ctaTrial",
        dispatch: "none",
      };
    }
    return {
      kind: "trial",
      enabled: true,
      labelKey: "billing.upgrade.ctaTrial",
      dispatch: "trial",
    };
  }

  return {
    kind: "subscribe",
    enabled: !input.hasError,
    labelKey: "billing.upgrade.ctaSubscribe",
    dispatch: input.hasError ? "none" : "purchase",
  };
}

export function chooseUpgradePrimaryPress(input: {
  dispatch: UpgradePrimaryDispatch;
  enabled: boolean;
  selectedSku: string | null;
}): { type: "purchase"; sku: string } | { type: "trial" } | { type: "none" } {
  if (!input.enabled || input.dispatch === "none") return { type: "none" };
  if (input.dispatch === "trial") return { type: "trial" };
  if (input.dispatch === "purchase" && input.selectedSku) {
    return { type: "purchase", sku: input.selectedSku };
  }
  return { type: "none" };
}

export function canDispatchPurchase(input: {
  ctaEnabled: boolean;
  dispatch: UpgradePrimaryDispatch;
  selectedSku: string | null;
  selectedOfferReady: boolean;
}): boolean {
  return (
    input.ctaEnabled &&
    input.dispatch === "purchase" &&
    Boolean(input.selectedSku) &&
    input.selectedOfferReady
  );
}

export function canDispatchTrial(input: {
  ctaEnabled: boolean;
  dispatch: UpgradePrimaryDispatch;
  trialActionAvailable: boolean;
}): boolean {
  return input.ctaEnabled && input.dispatch === "trial" && input.trialActionAvailable;
}

export function canDispatchRestore(input: {
  restoreAvailable: boolean;
  restoreState: UpgradeOperationState;
}): boolean {
  if (!input.restoreAvailable) return false;
  if (input.restoreState === "loading" || input.restoreState === "pending") return false;
  if (input.restoreState === "unavailable") return false;
  return true;
}

export function restoreCtaLabel(
  t: TranslateFn,
  input: { restoreAvailable: boolean; restoreState: UpgradeOperationState }
): string {
  if (input.restoreState === "loading") return t("billing.upgrade.restoreLoading");
  if (input.restoreState === "pending") return t("billing.upgrade.restorePending");
  if (!input.restoreAvailable || input.restoreState === "unavailable") {
    return t("billing.upgrade.restoreUnavailable");
  }
  return t("billing.upgrade.ctaRestore");
}

export function selectedOfferIsReady(
  offers: readonly UpgradePlanOffer[],
  sku: string | null
): boolean {
  if (!sku) return false;
  for (const offer of offers) {
    if (offer.sku === sku) return offer.offer.status === "ready";
  }
  return false;
}

export function defaultSelectedSku(
  cards: readonly UpgradePlanCardModel[],
  currentSku: string | null
): string | null {
  if (currentSku) {
    for (const card of cards) {
      if (card.sku === currentSku) return currentSku;
    }
  }
  for (const card of cards) {
    if (card.priceState === "ready") return card.sku;
  }
  return cards[0]?.sku ?? null;
}

export const UPGRADE_PERIOD_ORDER: readonly UpgradeCatalogPeriod[] = UPGRADE_PERIODS;

/** Illustrative paper estimate only — not measured product savings. */
export const ESTIMATE_SHEETS_PER_RECORD = 1;

export function estimateSheetsSaved(records: number, sheetsPerRecord = ESTIMATE_SHEETS_PER_RECORD): number {
  if (!Number.isFinite(records) || records < 0) return 0;
  if (!Number.isFinite(sheetsPerRecord) || sheetsPerRecord < 0) return 0;
  return Math.floor(records * sheetsPerRecord);
}

export function shouldShowTrustedByClaim(): boolean {
  return SHOW_TRUSTED_BY_INDIAN_BUSINESS_OWNERS_CLAIM;
}
