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
 *
 * Run:
 *   cd <repo> && firebase emulators:exec --only firestore --project demo-vyaamikk \
 *     "npx --yes tsx functions/src/billing/tax/gst.compliance.emulator.test.ts"
 */
import assert from "node:assert/strict";

import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { BillingError } from "../errors";
import { FirestoreBillingStore } from "../firestoreBillingStore";
import { billingDetailsPath, financialLedgerPath, subscriptionTaxCompliancePath } from "../paths";
import type { BillingEventLedgerDoc, SubscriptionInvoiceDoc, SubscriptionTaxComplianceDoc } from "../types";
import { istWallClockToEpochMs } from "./financialYearUtils";
import { notApplicableChannelEco, unreviewedChannelEco, type SellerIdentityConfig } from "./sellerIdentity";
import { finalizeUnissuedInvoice } from "./taxDocumentFinalization";
import { applyReviewTaxCompliance } from "./taxCompliance";
import { AdminFirestoreTaxComplianceReportSource } from "./taxComplianceReportSource";
import { buildGstr1WorkingPapers } from "./gstr1WorkingPapers";

const NOW = istWallClockToEpochMs("2026-09-12T12:00:00");
const SELLER_GSTIN = "09AAAAA0000A1Z5";
const SYNTHETIC_OPERATOR_GSTIN = "29AAAAA0000A1Z5";

function sellerConfig(): SellerIdentityConfig {
  return {
    companyGstin: SELLER_GSTIN,
    companyLegalName: "SPECIAL SOFTWARES LLP (TEST — CERTIFICATE UNCONFIRMED)",
    companyTradeName: "Vyaamikk Diary",
    companyGstRegisteredAddress:
      "TEST REGISTERED ADDRESS PLACEHOLDER — not copied from a GST certificate.",
    configuredStateCode: "09",
    serviceSacCode: "TESTSAC",
    serviceSacDescription: "Test software subscription service (CA approval required)",
    gstRateBps: 1800,
    priceIncludesGst: true,
    reverseChargeMode: "no",
    appleTaxResponsibilityMode: "unconfirmed",
    googleTaxResponsibilityMode: "developer",
    directWebTaxResponsibilityMode: "developer",
    googleEco: unreviewedChannelEco("google_play"),
    appleEco: unreviewedChannelEco("apple_app_store"),
    directWebEco: notApplicableChannelEco(null),
    billingEmailFromAddress: "billing@example.test",
    invoiceRendererUrl: "https://renderer.example.test",
    adminIdentityProvisioned: true,
    gstrFilingFrequency: "monthly",
  };
}

function ledger(financialEventId: string, platform: "android" | "ios" = "android"): BillingEventLedgerDoc {
  return {
    financialEventId,
    platform,
    uid: "emu-gst-1",
    canonicalSku: "vyd_professional_yearly",
    eventType: "purchase",
    grossAmountInPaise: 11800,
    currency: "INR",
    actualPlatformCommissionInPaise: 1770,
    estimatedPlatformCommissionInPaise: null,
    occurredAt: NOW,
    monthKey: "2026-09",
    relatedFinancialEventId: null,
    recordedAt: NOW,
    recordedBy: "androidValidation",
  };
}

async function main(): Promise<void> {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST required");
  if (getApps().length === 0) {
    initializeApp({ projectId: "demo-vyaamikk" });
  }
  const db = getFirestore();
  const store = new FirestoreBillingStore(db);

  await db.doc(financialLedgerPath("emu-gst-google")).set(ledger("emu-gst-google"));
  await db.doc(billingDetailsPath("emu-gst-1")).set({
    gstin: null,
    billingRecipientName: "Emulator Recipient",
    billingBusinessName: null,
    billingAddressLine1: "1 Test Street",
    billingAddressLine2: null,
    billingCity: "Lucknow",
    billingPostalCode: "226001",
    billingStateCode: "09",
    billingStateName: "Uttar Pradesh",
    gstinVerificationStatus: "not_provided",
    verifiedLegalName: null,
    verifiedStateCode: null,
    verifiedAt: null,
    verifiedByDiagnosticUid: null,
    updatedAt: NOW,
  });

  const issued = await finalizeUnissuedInvoice(store, {
    financialEventId: "emu-gst-google",
    config: sellerConfig(),
    diagnosticUidFor: () => "emu-diag",
    nowMs: NOW,
  });
  assert.match(issued.invoice.documentNumber ?? "", /^SS\/2026-27\//);
  const complianceSnap = await db.doc(subscriptionTaxCompliancePath(issued.invoice.invoiceId)).get();
  assert.equal(complianceSnap.exists, true);
  const compliance = complianceSnap.data() as SubscriptionTaxComplianceDoc;
  assert.equal(compliance.supplyMonthKey, "2026-09");
  assert.equal(compliance.ecoReportingCategory, "requires_tax_review");

  const source = new AdminFirestoreTaxComplianceReportSource(db);
  const scoped = await source.loadMonthlyScope("2026-09");
  assert.ok(scoped.invoices.some((i) => i.invoiceId === issued.invoice.invoiceId));
  assert.ok(scoped.complianceRecords.some((c) => c.invoiceId === issued.invoice.invoiceId));
  const papers = buildGstr1WorkingPapers({
    month: "2026-09",
    invoices: scoped.invoices,
    creditNotes: scoped.creditNotes,
    complianceRecords: scoped.complianceRecords,
  });
  assert.equal(papers.reviewStatus, "requires_tax_review");

  const reviewed = await applyReviewTaxCompliance(store, {
    invoiceId: issued.invoice.invoiceId,
    admin: { uid: "admin-1", tokenAdmin: true, adminIdentityProvisioned: true },
    reviewedByDiagnosticUid: "emu-admin-diag",
    reviewBasis: "emulator Table 14(a) synthetic operator",
    nowMs: NOW + 1,
    ecoReportingCategory: "section52_table14a",
    operatorGstin: SYNTHETIC_OPERATOR_GSTIN,
    operatorIdentifier: "google_play",
  });
  assert.equal(reviewed.ecoReportingCategory, "section52_table14a");
  const invoiceAfter = (await db.doc(`_subscriptionInvoices/${issued.invoice.invoiceId}`).get()).data() as SubscriptionInvoiceDoc;
  assert.equal(invoiceAfter.ecoReporting.ecoReportingCategory, "requires_tax_review");
  assert.equal(invoiceAfter.documentNumber, issued.invoice.documentNumber);

  const scopedAfter = await source.loadMonthlyScope("2026-09");
  const papersAfter = buildGstr1WorkingPapers({
    month: "2026-09",
    invoices: scopedAfter.invoices,
    creditNotes: scopedAfter.creditNotes,
    complianceRecords: scopedAfter.complianceRecords,
  });
  assert.equal(papersAfter.reviewStatus, "ready_to_file");
  assert.equal(papersAfter.table14a[0]?.operatorGstin, SYNTHETIC_OPERATOR_GSTIN);

  await db.doc(financialLedgerPath("emu-gst-apple")).set(ledger("emu-gst-apple", "ios"));
  const apple = await finalizeUnissuedInvoice(store, {
    financialEventId: "emu-gst-apple",
    config: sellerConfig(),
    diagnosticUidFor: () => "emu-diag",
    nowMs: NOW,
  });
  assert.equal(apple.invoice.documentNumber, null);
  assert.equal(apple.invoice.taxPeriodMonth, null);
  const appleScope = await source.loadMonthlyScope("2026-09");
  assert.ok(appleScope.complianceRecords.some((c) => c.invoiceId === apple.invoice.invoiceId && c.supplyMonthKey === "2026-09"));

  await assert.rejects(
    applyReviewTaxCompliance(store, {
      invoiceId: issued.invoice.invoiceId,
      admin: { uid: "admin-1", tokenAdmin: true, adminIdentityProvisioned: false },
      reviewedByDiagnosticUid: "emu-admin-diag",
      reviewBasis: "should fail",
      nowMs: NOW + 2,
    }),
    (err: unknown) => err instanceof BillingError && err.causeCode === "admin_identity_unprovisioned"
  );

  const apps = getApps();
  await Promise.all(apps.map((app) => deleteApp(app)));
  console.log("gst.compliance.emulator.test.ts: ok");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
