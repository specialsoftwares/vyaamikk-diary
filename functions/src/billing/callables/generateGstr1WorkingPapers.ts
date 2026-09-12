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
import type { Gstr1ReportManifestDoc } from "../types";
import { assertAdminAuthorized, type AdminAuthContext } from "../tax/adminAuth";
import {
  buildGstr1WorkingPapers,
  persistGstr1ReportManifest,
  workingPapersToCsv,
  type Gstr1WorkingPapers,
} from "../tax/gstr1WorkingPapers";
import type { InvoiceObjectStorage } from "../tax/taxDocumentOrchestrator";
import {
  reportSourceFromBillingStore,
  type TaxComplianceReportSource,
} from "../tax/taxComplianceReportSource";
import { gstr1ReportStoragePath } from "../paths";
import { assertGstrMonth } from "../tax/taxPeriod";

export async function generateGstr1WorkingPapersCore(input: {
  month: string;
  admin: AdminAuthContext;
  storage: InvoiceObjectStorage;
  store: BillingStore;
  generatedByDiagnosticUid: string;
  nowMs: number;
  reportSource?: TaxComplianceReportSource;
}): Promise<{
  papers: Gstr1WorkingPapers;
  manifest: Gstr1ReportManifestDoc;
  jsonPath: string;
  csvPath: string;
  csv: string;
}> {
  assertAdminAuthorized(input.admin);
  assertGstrMonth(input.month);
  const source = input.reportSource ?? reportSourceFromBillingStore(input.store);
  const listed = await source.loadMonthlyScope(input.month);
  const papers = buildGstr1WorkingPapers({
    month: input.month,
    invoices: listed.invoices,
    creditNotes: listed.creditNotes,
    complianceRecords: listed.complianceRecords,
  });
  const jsonPath = gstr1ReportStoragePath(input.month, papers.reportId, "json");
  const csvPath = gstr1ReportStoragePath(input.month, papers.reportId, "csv");
  const csv = workingPapersToCsv(papers);
  await input.storage.putObject({
    path: jsonPath,
    bytes: Buffer.from(JSON.stringify(papers), "utf8"),
    contentType: "application/json; charset=utf-8",
    customMetadata: { reportId: papers.reportId, month: papers.month },
  });
  await input.storage.putObject({
    path: csvPath,
    bytes: Buffer.from(csv, "utf8"),
    contentType: "text/csv; charset=utf-8",
    customMetadata: { reportId: papers.reportId, month: papers.month },
  });
  const manifest = await persistGstr1ReportManifest(input.store, papers, {
    jsonStoragePath: jsonPath,
    csvStoragePath: csvPath,
    generatedAt: input.nowMs,
    generatedByDiagnosticUid: input.generatedByDiagnosticUid,
  });
  return { papers, manifest, jsonPath, csvPath, csv };
}

export const generateGstr1WorkingPapers = onCall({ region: "asia-south1" }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  throw new HttpsError(
    "failed-precondition",
    "GSTR-1 working papers callable is not production-enabled in VYD-40."
  );
});
