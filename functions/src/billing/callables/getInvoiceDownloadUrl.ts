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

import { BillingError } from "../errors";
import { subscriptionInvoicePath } from "../paths";
import type { BillingStore } from "../store";
import type { SubscriptionInvoiceDoc } from "../types";
import type { InvoiceObjectStorage } from "../tax/taxDocumentOrchestrator";

const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

export async function createInvoiceDownloadUrl(
  store: BillingStore,
  storage: InvoiceObjectStorage,
  input: { taxDocumentId: string; uid: string }
): Promise<{ url: string; expiresInMs: number }> {
  if (!input.uid) {
    throw new BillingError({ clientCode: "not_entitled", causeCode: "unauthenticated" });
  }
  if (!input.taxDocumentId || input.taxDocumentId.includes("/")) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "tax_document_id_invalid",
    });
  }
  const snap = await store.runTransaction(async (tx) =>
    tx.get(subscriptionInvoicePath(input.taxDocumentId))
  );
  if (!snap.exists) {
    throw new BillingError({ clientCode: "not_entitled", causeCode: "invoice_not_found" });
  }
  const invoice = snap.data() as unknown as SubscriptionInvoiceDoc;
  if (invoice.uid !== input.uid) {
    throw new BillingError({ clientCode: "not_entitled", causeCode: "invoice_not_owned" });
  }
  if (invoice.pdfStatus !== "ready" || !invoice.invoicePdfStoragePath) {
    throw new BillingError({ clientCode: "not_entitled", causeCode: "invoice_pdf_not_ready" });
  }
  const url = await storage.getSignedDownloadUrl(
    invoice.invoicePdfStoragePath,
    SIGNED_URL_TTL_MS
  );
  return { url, expiresInMs: SIGNED_URL_TTL_MS };
}

export const getInvoiceDownloadUrl = onCall({ region: "asia-south1" }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  throw new HttpsError(
    "failed-precondition",
    "Invoice download callable is not production-enabled in VYD-40."
  );
});
