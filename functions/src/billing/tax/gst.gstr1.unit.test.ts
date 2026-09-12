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
 * Run: npm run test:billing-gstr1
 */

import assert from "node:assert/strict";

import { applyMarkGstr1Filed } from "../callables/markGstr1Filed";
import { generateGstr1WorkingPapersCore } from "../callables/generateGstr1WorkingPapers";
import { BillingError } from "../errors";
import { MemoryBillingStore } from "../store";
import type { SubscriptionCreditNoteDoc, SubscriptionInvoiceDoc } from "../types";
import { buildGstr1WorkingPapers } from "./gstr1WorkingPapers";
import { MemoryInvoiceObjectStorage } from "./taxDocumentOrchestrator";

function isCause(code: string) {
  return (e: unknown) => e instanceof BillingError && e.causeCode === code;
}

function invoice(partial: Partial<SubscriptionInvoiceDoc> & { invoiceId: string; documentType: SubscriptionInvoiceDoc["documentType"] }): SubscriptionInvoiceDoc {
  return {
    uid: "user-1",
    diagnosticUid: "diag01",
    financialEventId: partial.invoiceId,
    platform: "android",
    canonicalSku: "vyd_professional_yearly",
    plan: "professional",
    billingPeriod: "yearly",
    taxResponsibilityMode: "developer",
    documentNumber: "SS/2026-27/0001",
    financialYear: "2026-27",
    taxPeriodMonth: "2026-09",
    invoiceIssuedAt: 1,
    supplyOccurredAt: 1,
    seller: null,
    buyer: {
      classification: partial.documentType === "tax_invoice_b2b" ? "b2b" : "b2c",
      legalName: "Buyer",
      gstin: partial.documentType === "tax_invoice_b2b" ? "27AAAAA0000A1Z5" : null,
      gstinVerificationStatus: partial.documentType === "tax_invoice_b2b" ? "verified" : "not_provided",
      billingAddress: null,
      stateCode: "27",
      stateName: "Maharashtra",
    },
    placeOfSupplyStateCode: "27",
    placeOfSupplyStateName: "Maharashtra",
    sacCode: "TESTSAC",
    serviceDescription: "Test",
    currency: "INR",
    grossCustomerAmountInPaise: 11800,
    taxableAmountInPaise: 10000,
    gstRateBps: 1800,
    taxType: "igst",
    cgstInPaise: 0,
    sgstInPaise: 0,
    igstInPaise: 1800,
    totalTaxInPaise: 1800,
    totalInPaise: 11800,
    platformCommissionInPaise: 1770,
    ecoReporting: {
      platform: "android",
      operatorIdentifier: "google_play",
      operatorGstin: null,
      taxResponsibilityMode: "developer",
      section52TcsStatus: "requires_tax_review",
      table14ClassificationStatus: "requires_tax_review",
    },
    pdfStatus: "ready",
    invoicePdfStoragePath: "company/invoices/2026-27/x.pdf",
    emailStatus: "accepted",
    emailProviderMessageId: "m",
    invoiceEmailAcceptedAt: 1,
    invoiceEmailDeliveredAt: null,
    gstrReportable: true,
    gstrReportedMonth: null,
    gstrFilingBatchId: null,
    historyEventId: null,
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  };
}

async function main(): Promise<void> {
  const b2b = invoice({ invoiceId: "inv-b2b", documentType: "tax_invoice_b2b", documentNumber: "SS/2026-27/0001" });
  const b2c = invoice({
    invoiceId: "inv-b2c",
    documentType: "tax_invoice_b2c",
    documentNumber: "SS/2026-27/0002",
    placeOfSupplyStateCode: "09",
    buyer: {
      classification: "b2c",
      legalName: null,
      gstin: null,
      gstinVerificationStatus: "not_provided",
      billingAddress: null,
      stateCode: "09",
      stateName: "Uttar Pradesh",
    },
  });
  const filed = invoice({
    invoiceId: "inv-filed",
    documentType: "tax_invoice_b2c",
    gstrReportedMonth: "2026-09",
    gstrReportable: true,
  });
  const apple = invoice({
    invoiceId: "inv-apple",
    documentType: "compliance_review_required",
    platform: "ios",
    gstrReportable: false,
    taxResponsibilityMode: "unconfirmed",
    ecoReporting: {
      platform: "ios",
      operatorIdentifier: "apple_app_store",
      operatorGstin: null,
      taxResponsibilityMode: "unconfirmed",
      section52TcsStatus: "requires_tax_review",
      table14ClassificationStatus: "requires_tax_review",
    },
  });
  const cn: SubscriptionCreditNoteDoc = {
    creditNoteId: "cn-1",
    originalInvoiceId: "inv-b2b",
    originalDocumentNumber: "SS/2026-27/0001",
    refundFinancialEventId: "refund-1",
    uid: "user-1",
    diagnosticUid: "diag01",
    documentNumber: "CN/2026-27/0001",
    financialYear: "2026-27",
    taxPeriodMonth: "2026-09",
    issuedAt: 1,
    taxResponsibilityMode: "developer",
    taxableAmountReversedInPaise: 10000,
    cgstReversedInPaise: 0,
    sgstReversedInPaise: 0,
    igstReversedInPaise: 1800,
    totalTaxReversedInPaise: 1800,
    totalReversedInPaise: 11800,
    gstrReportable: true,
    gstrReportedMonth: null,
    gstrFilingBatchId: null,
    createdAt: 1,
    updatedAt: 1,
  };

  const papers = buildGstr1WorkingPapers({
    month: "2026-09",
    invoices: [b2b, b2c, filed, apple],
    creditNotes: [cn],
  });
  assert.equal(papers.b2b.length, 1);
  assert.equal(papers.b2b[0]?.invoiceId, "inv-b2b");
  assert.equal(papers.b2cSummary.length, 1);
  assert.equal(papers.b2cSummary[0]?.invoiceCount, 1);
  assert.ok(papers.hsnSacSummary.some((r) => r.sacCode === "TESTSAC"));
  assert.ok(papers.documentSeries.some((s) => s.documentType === "tax_invoice_b2b"));
  assert.equal(papers.creditNotes.length, 1);
  assert.equal(papers.creditNotes[0]?.originalInvoiceId, "inv-b2b");
  assert.equal(papers.excludedAlreadyFiled.includes("inv-filed"), true);
  assert.equal(papers.reportableInvoiceIds.includes("inv-filed"), false);
  assert.ok(papers.ecoTable14.some((r) => r.table14ClassificationStatus === "requires_tax_review"));
  assert.ok(papers.ecoTable14.some((r) => r.note.includes("not fabricated")));

  const admin = { uid: "admin-1", tokenAdmin: true, adminIdentityProvisioned: true };
  const storage = new MemoryInvoiceObjectStorage();
  const generated = await generateGstr1WorkingPapersCore({
    month: "2026-09",
    admin,
    invoices: [b2b, b2c, filed, apple],
    creditNotes: [cn],
    storage,
  });
  assert.match(generated.jsonPath, /^company\/gstr1-reports\/2026-09\//);
  assert.match(generated.csvPath, /\.csv$/);
  assert.match(generated.csv, /b2b/);

  await assert.rejects(
    generateGstr1WorkingPapersCore({
      month: "2026-09",
      admin: { ...admin, adminIdentityProvisioned: false },
      invoices: [b2b],
      creditNotes: [],
      storage,
    }),
    isCause("admin_identity_unprovisioned")
  );

  const store = new MemoryBillingStore();
  store.docs.set(`_subscriptionInvoices/${b2b.invoiceId}`, { ...b2b });
  store.docs.set(`_subscriptionInvoices/${b2c.invoiceId}`, { ...b2c });
  store.docs.set(`_subscriptionInvoices/${filed.invoiceId}`, { ...filed });
  store.docs.set(`_subscriptionCreditNotes/${cn.creditNoteId}`, { ...cn });

  await assert.rejects(
    applyMarkGstr1Filed(store, {
      admin,
      adminDiagnosticUid: "admindiag01",
      month: "2026-09",
      papers,
      acknowledgement: "   ",
      nowMs: 9,
    }),
    isCause("gstr_acknowledgement_required")
  );

  const batch = await applyMarkGstr1Filed(store, {
    admin,
    adminDiagnosticUid: "admindiag01",
    month: "2026-09",
    papers,
    acknowledgement: "ACK-1",
    nowMs: 10,
  });
  assert.deepEqual(batch.invoiceIds.sort(), ["inv-b2b", "inv-b2c"].sort());
  assert.equal(batch.creditNoteIds[0], "cn-1");
  const markedB2b = store.docs.get(`_subscriptionInvoices/${b2b.invoiceId}`) as SubscriptionInvoiceDoc;
  const markedFiled = store.docs.get(`_subscriptionInvoices/${filed.invoiceId}`) as SubscriptionInvoiceDoc;
  assert.equal(markedB2b.gstrReportedMonth, "2026-09");
  assert.equal(markedB2b.gstrFilingBatchId, `gstr1batch_${papers.reportId}`);
  assert.equal(markedFiled.gstrFilingBatchId, null);
  const markedCn = store.docs.get(`_subscriptionCreditNotes/${cn.creditNoteId}`) as SubscriptionCreditNoteDoc;
  assert.equal(markedCn.gstrReportedMonth, "2026-09");

  console.log("gst.gstr1.unit.test.ts: ok");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
