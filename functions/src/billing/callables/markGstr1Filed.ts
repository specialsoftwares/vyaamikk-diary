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

import { HttpsError, onCall } from "firebase-functions/v2/https";

import type { BillingStore } from "../store";
import { assertAdminAuthorized, type AdminAuthContext } from "../tax/adminAuth";
import { markGstr1FiledExact } from "../tax/gstr1WorkingPapers";
import { reportSourceFromBillingStore, type TaxComplianceReportSource } from "../tax/taxComplianceReportSource";

export async function applyMarkGstr1Filed(
  store: BillingStore,
  input: {
    admin: AdminAuthContext;
    adminDiagnosticUid: string;
    reportId: string;
    acknowledgement: string;
    nowMs: number;
    month?: string;
    reportSource?: TaxComplianceReportSource;
  }
) {
  assertAdminAuthorized(input.admin);
  return markGstr1FiledExact(store, {
    reportId: input.reportId,
    acknowledgement: input.acknowledgement,
    filedByDiagnosticUid: input.adminDiagnosticUid,
    nowMs: input.nowMs,
    month: input.month,
    reportSource: input.reportSource ?? reportSourceFromBillingStore(store),
  });
}

export const markGstr1Filed = onCall({ region: "asia-south1" }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  throw new HttpsError(
    "failed-precondition",
    "GSTR-1 filing-batch callable is not production-enabled in VYD-40."
  );
});
