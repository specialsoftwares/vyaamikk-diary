/**
 * Android standard base-plan offer selection and iOS store-offer rejection.
 *
 * Never pick offers[0]. Never trust Purchase.currentPlanId.
 * Vyaamikk's 14-day Professional trial is server-controlled — store trials
 * and promotional / installment / commitment offers fail closed.
 */

import type {
  AndroidOfferSelection,
  AndroidSubscriptionOfferLike,
  StoreProductLike,
} from "./iapTypes";

/** Google Play BillingLibrary.RecurrenceMode.INFINITE_RECURRING */
const INFINITE_RECURRING = 1;

function nonempty(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

function isTrialOrPromoOffer(offer: AndroidSubscriptionOfferLike): boolean {
  if (offer.type === "introductory" || offer.type === "promotional") return true;
  if (offer.paymentMode === "free-trial") return true;
  const phases = offer.pricingPhasesAndroid?.pricingPhaseList ?? [];
  if (phases.length === 0) return true;
  if (phases.length !== 1) return true;
  const phase = phases[0];
  if (phase.recurrenceMode !== INFINITE_RECURRING) return true;
  if (phase.billingCycleCount > 0) return true;
  if (phase.priceAmountMicros === "0" || phase.formattedPrice === "0") return true;
  return false;
}

function isInstallmentOffer(offer: AndroidSubscriptionOfferLike): boolean {
  const details = offer.installmentPlanDetailsAndroid;
  if (!details) return false;
  return (
    details.commitmentPaymentsCount > 0 ||
    details.subsequentCommitmentPaymentsCount > 0
  );
}

function rejectUnsupported(
  offer: AndroidSubscriptionOfferLike
): AndroidOfferSelection | null {
  if (isInstallmentOffer(offer)) {
    return { ok: false, reason: "installment" };
  }
  if (isTrialOrPromoOffer(offer)) {
    return { ok: false, reason: "trial_or_promo" };
  }
  if (!nonempty(offer.displayPrice)) {
    return { ok: false, reason: "unsupported" };
  }
  return null;
}

/**
 * Select the exact STANDARD base-plan offer for `expectedBasePlanId`.
 *
 * OpenIAP invariant used here:
 *   candidate.basePlanIdAndroid === expectedBasePlanId
 *   AND candidate.id === candidate.basePlanIdAndroid
 *   AND candidate.offerTokenAndroid is non-empty
 */
export function selectStandardAndroidOffer(args: {
  offers: AndroidSubscriptionOfferLike[] | null | undefined;
  expectedBasePlanId: string;
}): AndroidOfferSelection {
  const offers = args.offers;
  if (!Array.isArray(offers) || offers.length === 0) {
    return { ok: false, reason: "missing" };
  }

  const forPlan = offers.filter(
    (offer) => offer.basePlanIdAndroid === args.expectedBasePlanId
  );
  if (forPlan.length === 0) {
    return { ok: false, reason: "missing" };
  }

  const standardShaped = forPlan.filter(
    (offer) => offer.id === offer.basePlanIdAndroid
  );
  if (standardShaped.length === 0) {
    return { ok: false, reason: "missing" };
  }
  if (standardShaped.length > 1) {
    return { ok: false, reason: "ambiguous" };
  }

  const candidate = standardShaped[0];
  if (!nonempty(candidate.offerTokenAndroid)) {
    return { ok: false, reason: "missing_token" };
  }

  const rejected = rejectUnsupported(candidate);
  if (rejected) return rejected;

  return {
    ok: true,
    offer: {
      offerToken: candidate.offerTokenAndroid,
      displayPrice: candidate.displayPrice,
      currency: candidate.currency ?? candidate.pricingPhasesAndroid?.pricingPhaseList[0]?.priceCurrencyCode ?? "",
      basePlanId: candidate.basePlanIdAndroid ?? args.expectedBasePlanId,
    },
  };
}

export function iosProductAllowsPlainPurchase(product: StoreProductLike): boolean {
  const introMode = product.introductoryPricePaymentModeIOS;
  if (
    introMode === "free-trial" ||
    introMode === "pay-as-you-go" ||
    introMode === "pay-up-front"
  ) {
    return false;
  }
  if (nonempty(product.introductoryPriceIOS ?? null)) {
    return false;
  }
  const offers = product.subscriptionOffers ?? [];
  for (const offer of offers) {
    if (offer.type === "introductory" || offer.type === "promotional") {
      return false;
    }
  }
  const terms = product.pricingTermsIOS ?? [];
  for (const term of terms) {
    if (term.billingPlanType === "monthly") {
      return false;
    }
  }
  return true;
}
