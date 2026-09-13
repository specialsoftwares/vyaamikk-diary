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
import type { TaxPeriodStatus } from "../types";

import { getMonthKey } from "./financialYearUtils";

export function parseGstrMonth(month: string): { year: number; month: number } {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!m) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "invalid_gstr_month",
    });
  }
  return { year: Number(m[1]), month: Number(m[2]) };
}

export function assertGstrMonth(month: string): string {
  parseGstrMonth(month);
  return month;
}

/**
 * GSTR tax period is claimed only when supply and invoice-issue months match.
 * Cross-month/year delay is unresolved until CA policy exists — never guessed.
 */
export function resolveTaxPeriod(input: {
  supplyOccurredAt: number | null;
  invoiceIssuedAt: number | null;
}): { taxPeriodMonth: string | null; taxPeriodStatus: TaxPeriodStatus } {
  if (input.invoiceIssuedAt == null || input.supplyOccurredAt == null) {
    return { taxPeriodMonth: null, taxPeriodStatus: "pending_issue" };
  }
  const supplyMonth = getMonthKey(input.supplyOccurredAt);
  const issueMonth = getMonthKey(input.invoiceIssuedAt);
  if (supplyMonth === issueMonth) {
    return { taxPeriodMonth: issueMonth, taxPeriodStatus: "resolved" };
  }
  return { taxPeriodMonth: null, taxPeriodStatus: "unresolved_cross_period" };
}
