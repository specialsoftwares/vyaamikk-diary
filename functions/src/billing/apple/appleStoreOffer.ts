/**
 * App Store applied-offer gate (VYD-33).
 *
 * Inspects types exported by `@apple/app-store-server-library@3.1.0`:
 * `JWSTransactionDecodedPayload` / `JWSRenewalInfoDecodedPayload`
 * `offerType` (`OfferType`: INTRODUCTORY_OFFER=1, PROMOTIONAL_OFFER=2,
 * OFFER_CODE=3, WIN_BACK_OFFER=4), `offerIdentifier`, and
 * `offerDiscountType` (`OfferDiscountType`: FREE_TRIAL, PAY_AS_YOU_GO,
 * PAY_UP_FRONT, ONE_TIME).
 *
 * Vyaamikk does not use App Store-managed introductory, trial,
 * promotional, offer-code, or win-back offers. The 14-day Professional
 * trial is server-controlled `trialGrant` logic. Any applied store-offer
 * field fails closed before mutation. Informational eligibility such as
 * `eligibleWinBackOfferIds` is not applied-offer state.
 */

import type {
  JWSRenewalInfoDecodedPayload,
  JWSTransactionDecodedPayload,
} from "@apple/app-store-server-library";

import { BillingError } from "../errors";

function unsupportedStoreOffer(): BillingError {
  return new BillingError({
    clientCode: "verification_failed",
    causeCode: "unsupported_ios_store_offer",
  });
}

function hasAppliedStoreOffer(payload: {
  offerType?: unknown;
  offerIdentifier?: unknown;
  offerDiscountType?: unknown;
}): boolean {
  if (payload.offerType != null) return true;
  if (payload.offerDiscountType != null) return true;
  if (payload.offerIdentifier == null) return false;
  if (typeof payload.offerIdentifier === "string") {
    return payload.offerIdentifier.length > 0;
  }
  return true;
}

export function assertIosStoreOfferUnsupported(
  transaction: JWSTransactionDecodedPayload,
  renewal?: JWSRenewalInfoDecodedPayload
): void {
  if (hasAppliedStoreOffer(transaction)) {
    throw unsupportedStoreOffer();
  }
  if (renewal && hasAppliedStoreOffer(renewal)) {
    throw unsupportedStoreOffer();
  }
}
