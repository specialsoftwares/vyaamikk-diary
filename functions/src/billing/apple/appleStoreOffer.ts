/**
 * App Store applied-offer gate (VYD-33).
 *
 * Inspects types exported by `@apple/app-store-server-library@3.1.0`:
 * `JWSTransactionDecodedPayload` / `JWSRenewalInfoDecodedPayload`
 * applied-offer fields:
 * `offerType` (`OfferType`: INTRODUCTORY_OFFER=1, PROMOTIONAL_OFFER=2,
 * OFFER_CODE=3, WIN_BACK_OFFER=4), `offerIdentifier`,
 * `offerDiscountType` (`OfferDiscountType`: FREE_TRIAL, PAY_AS_YOU_GO,
 * PAY_UP_FRONT, ONE_TIME), and `offerPeriod` (ISO-8601 duration of the
 * applied offer; App Store Server API / Notifications 1.15).
 *
 * Vyaamikk does not use App Store-managed introductory, trial,
 * promotional, offer-code, or win-back offers. The 14-day Professional
 * trial is server-controlled `trialGrant` logic. Any non-null
 * `offerType` / `offerDiscountType` / `offerPeriod`, or any non-empty
 * `offerIdentifier`, fails closed before mutation. Duration is not
 * parsed. Informational eligibility such as `eligibleWinBackOfferIds`
 * is not applied-offer state.
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
  offerPeriod?: unknown;
}): boolean {
  if (payload.offerType != null) return true;
  if (payload.offerDiscountType != null) return true;
  if (payload.offerPeriod != null) return true;
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
