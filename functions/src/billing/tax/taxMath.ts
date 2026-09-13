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
import type { GstTaxType } from "../types";

export interface TaxMathInput {
  totalInPaise: number;
  gstRateBps: number;
  priceIncludesGst: boolean;
  taxType: Exclude<GstTaxType, null>;
  currency: "INR";
}

export interface TaxMathResult {
  taxableAmountInPaise: number;
  cgstInPaise: number;
  sgstInPaise: number;
  igstInPaise: number;
  totalTaxInPaise: number;
  totalInPaise: number;
  gstRateBps: number;
  taxType: Exclude<GstTaxType, null>;
}

/**
 * Inclusive GST:
 *   taxable = round(total * 10000 / (10000 + rateBps))
 *   tax = total - taxable
 * CGST/SGST split (deterministic):
 *   cgst = floor(totalTax / 2)
 *   sgst = totalTax - cgst
 * so cgst + sgst == totalTax even on odd paisa.
 */
export function calculateGst(input: TaxMathInput): TaxMathResult {
  if (input.currency !== "INR") {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "unsupported_invoice_currency",
    });
  }
  if (!Number.isInteger(input.totalInPaise) || input.totalInPaise < 0) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "invalid_paise_amount",
    });
  }
  if (!Number.isInteger(input.gstRateBps) || input.gstRateBps <= 0 || input.gstRateBps > 10000) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "invalid_gst_rate_bps",
    });
  }
  if (typeof input.priceIncludesGst !== "boolean") {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "price_includes_gst_unconfirmed",
    });
  }

  let taxable: number;
  let totalTax: number;
  let total = input.totalInPaise;
  if (input.priceIncludesGst) {
    taxable = Math.round((input.totalInPaise * 10000) / (10000 + input.gstRateBps));
    totalTax = input.totalInPaise - taxable;
  } else {
    taxable = input.totalInPaise;
    totalTax = Math.round((input.totalInPaise * input.gstRateBps) / 10000);
    total = taxable + totalTax;
  }

  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  if (input.taxType === "igst") {
    igst = totalTax;
  } else {
    cgst = Math.floor(totalTax / 2);
    sgst = totalTax - cgst;
  }

  const result: TaxMathResult = {
    taxableAmountInPaise: taxable,
    cgstInPaise: cgst,
    sgstInPaise: sgst,
    igstInPaise: igst,
    totalTaxInPaise: totalTax,
    totalInPaise: total,
    gstRateBps: input.gstRateBps,
    taxType: input.taxType,
  };
  if (!isPaiseCalculationValid(result)) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "tax_math_invariant_broken",
    });
  }
  return result;
}

export function isPaiseCalculationValid(parts: {
  taxableAmountInPaise: number;
  cgstInPaise: number;
  sgstInPaise: number;
  igstInPaise: number;
  totalInPaise: number;
}): boolean {
  const fields = [
    parts.taxableAmountInPaise,
    parts.cgstInPaise,
    parts.sgstInPaise,
    parts.igstInPaise,
    parts.totalInPaise,
  ];
  if (fields.some((n) => !Number.isInteger(n) || n < 0)) return false;
  return (
    parts.taxableAmountInPaise +
      parts.cgstInPaise +
      parts.sgstInPaise +
      parts.igstInPaise ===
    parts.totalInPaise
  );
}
