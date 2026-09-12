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

import { MemoryBillingStore } from "../store";
import type { SubscriptionCreditNoteDoc, SubscriptionInvoiceDoc } from "../types";
import { assertAdminAuthorized, type AdminAuthContext } from "../tax/adminAuth";
import {
  buildGstr1WorkingPapers,
  workingPapersToCsv,
  type Gstr1WorkingPapers,
} from "../tax/gstr1WorkingPapers";
import type { InvoiceObjectStorage } from "../tax/taxDocumentOrchestrator";
import { gstr1ReportStoragePath } from "../paths";

export function listTaxDocumentsFromMemory(
  store: MemoryBillingStore,
  month: string
): { invoices: SubscriptionInvoiceDoc[]; creditNotes: SubscriptionCreditNoteDoc[] } {
  const invoices: SubscriptionInvoiceDoc[] = [];
  const creditNotes: SubscriptionCreditNoteDoc[] = [];
  for (const [path, data] of store.docs) {
    if (path.startsWith("_subscriptionInvoices/")) {
      invoices.push(data as unknown as SubscriptionInvoiceDoc);
    }
    if (path.startsWith("_subscriptionCreditNotes/")) {
      creditNotes.push(data as unknown as SubscriptionCreditNoteDoc);
    }
  }
  return {
    invoices: invoices.filter((i) => i.taxPeriodMonth === month),
    creditNotes: creditNotes.filter((c) => c.taxPeriodMonth === month),
  };
}

export async function generateGstr1WorkingPapersCore(input: {
  month: string;
  admin: AdminAuthContext;
  invoices: SubscriptionInvoiceDoc[];
  creditNotes: SubscriptionCreditNoteDoc[];
  storage: InvoiceObjectStorage;
}): Promise<{ papers: Gstr1WorkingPapers; jsonPath: string; csvPath: string; csv: string }> {
  assertAdminAuthorized(input.admin);
  const papers = buildGstr1WorkingPapers({
    month: input.month,
    invoices: input.invoices,
    creditNotes: input.creditNotes,
  });
  const jsonPath = gstr1ReportStoragePath(input.month, papers.reportId, "json");
  const csvPath = gstr1ReportStoragePath(input.month, papers.reportId, "csv");
  const csv = workingPapersToCsv(papers);
  await input.storage.uploadPdf(jsonPath, Buffer.from(JSON.stringify(papers), "utf8"), {
    invoiceNumber: papers.reportId,
    plan: "gstr1",
    financialEventId: papers.reportId,
  });
  await input.storage.uploadPdf(csvPath, Buffer.from(csv, "utf8"), {
    invoiceNumber: papers.reportId,
    plan: "gstr1",
    financialEventId: papers.reportId,
  });
  return { papers, jsonPath, csvPath, csv };
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
