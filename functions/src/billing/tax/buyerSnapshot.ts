/**
 * VYAAMIKK DIARY — INDIA GST TAX-DOCUMENT MODEL
 *
 * This module must not infer GST liability merely from the payment channel.
 *
 * IGST Act section 14 applies to specified OIDAR supplies made from a
 * non-taxable territory to a non-taxable online recipient. It is not a
 * blanket rule making Google Play or Apple the GST supplier for subscriptions
 * sold by an Indian LLP.
 *
 * For India-based Google Play developers, Google's current tax documentation
 * states that the developer remains responsible for determining applicable
 * GST on app / in-app sales; Google separately handles applicable marketplace
 * TDS / GST-TCS obligations.
 *
 * Apple tax treatment must follow the applicable Paid Apps Agreement /
 * Schedule 2, App Store tax settings and India-specific arrangement. Do not
 * assume Apple's tax responsibility until that channel has been formally
 * classified.
 *
 * Therefore tax-document generation is controlled by a verified
 * PlatformTaxPolicy, not merely by whether the buyer supplied a GSTIN.
 *
 * Direct-web/Razorpay sales, when introduced, are developer-direct supplies
 * and have their own explicitly configured GST treatment.
 *
 * Buyer GST registration determines B2B/B2C recipient classification; it
 * does NOT by itself determine whether Special Softwares or a platform is
 * responsible for charging/reporting tax.
 *
 * No tax invoice may be generated from an unconfirmed tax-responsibility
 * policy.
 */

import type { BuyerTaxSnapshot, SubscriptionBillingDetailsDoc } from "../types";

import { gstStateName, isKnownGstStateCode } from "./gstin";

export function isRecipientTaxClassificationPending(
  details: SubscriptionBillingDetailsDoc | null
): boolean {
  return details?.gstinVerificationStatus === "pending_manual_verification";
}

/**
 * Statutory buyer snapshot. Unverified GSTIN is never the recipient GSTIN.
 * Raw entered GSTIN remains on billingDetails for manual review.
 */
export function statutoryBuyerFromDetails(
  details: SubscriptionBillingDetailsDoc | null
): BuyerTaxSnapshot {
  const status = details?.gstinVerificationStatus ?? "not_provided";
  const verified = status === "verified";
  const addressParts = [
    details?.billingAddressLine1,
    details?.billingAddressLine2,
    details?.billingCity,
    details?.billingPostalCode,
  ].filter((p): p is string => Boolean(p && p.trim()));
  const stateCode = verified
    ? details?.verifiedStateCode ?? details?.billingStateCode ?? null
    : details?.billingStateCode ?? null;
  return {
    classification: verified ? "b2b" : "b2c",
    legalName: verified
      ? details?.verifiedLegalName ?? details?.billingBusinessName ?? null
      : details?.billingBusinessName ?? null,
    gstin: verified ? details?.gstin ?? null : null,
    gstinVerificationStatus: status,
    billingAddress: addressParts.length ? addressParts.join(", ") : null,
    stateCode,
    stateName:
      stateCode && isKnownGstStateCode(stateCode)
        ? gstStateName(stateCode)
        : details?.billingStateName ?? null,
  };
}
