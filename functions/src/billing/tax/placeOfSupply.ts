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

import { BillingError } from "../errors";
import type { BuyerClassification, GstTaxType } from "../types";

import { gstStateName, isKnownGstStateCode } from "./gstin";

export interface PlaceOfSupplyInput {
  classification: BuyerClassification;
  /** Verified GSTIN registration State for B2B. */
  verifiedRecipientStateCode: string | null;
  /** Recipient billing-address State when present. */
  recipientAddressStateCode: string | null;
  sellerStateCode: string;
}

export interface PlaceOfSupplyResult {
  placeOfSupplyStateCode: string;
  placeOfSupplyStateName: string;
  taxType: Exclude<GstTaxType, null>;
}

/**
 * Ordinary domestic Vyaamikk services:
 * - B2B: verified recipient GST registration State
 * - B2C with address on record: recipient address State
 * - B2C without address: supplier State
 * Never: missing State → IGST
 */
export function resolvePlaceOfSupply(input: PlaceOfSupplyInput): PlaceOfSupplyResult {
  if (!isKnownGstStateCode(input.sellerStateCode)) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "seller_state_code_unknown",
    });
  }

  let posCode: string;
  if (input.classification === "b2b") {
    if (!input.verifiedRecipientStateCode || !isKnownGstStateCode(input.verifiedRecipientStateCode)) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "b2b_place_of_supply_unresolved",
      });
    }
    posCode = input.verifiedRecipientStateCode;
  } else if (
    input.recipientAddressStateCode &&
    isKnownGstStateCode(input.recipientAddressStateCode)
  ) {
    posCode = input.recipientAddressStateCode;
  } else if (input.recipientAddressStateCode) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "recipient_state_code_unknown",
    });
  } else {
    posCode = input.sellerStateCode;
  }

  const name = gstStateName(posCode);
  if (!name) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "place_of_supply_unresolved",
    });
  }
  return {
    placeOfSupplyStateCode: posCode,
    placeOfSupplyStateName: name,
    taxType: posCode === input.sellerStateCode ? "cgst_sgst" : "igst",
  };
}
