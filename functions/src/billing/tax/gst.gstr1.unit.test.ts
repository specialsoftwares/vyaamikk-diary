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
import { gstr1ReportManifestPath, financialLedgerPath } from "../paths";
import { MemoryBillingStore } from "../store";
import type {
  BillingEventLedgerDoc,
  SubscriptionCreditNoteDoc,
  SubscriptionInvoiceDoc,
  SubscriptionTaxComplianceDoc,
} from "../types";
import { buildGstr1WorkingPapers, workingPapersToCsv } from "./gstr1WorkingPapers";
import { MemoryInvoiceObjectStorage } from "./taxDocumentOrchestrator";
import { parseGstrMonth } from "./taxPeriod";
import { istWallClockToEpochMs } from "./financialYearUtils";
import { applyReviewTaxCompliance } from "./taxCompliance";
import { MemoryTaxComplianceReportSource } from "./taxComplianceReportSource";
import { invoiceIdForFinancialEvent } from "./invoiceAllocation";
import { creditNoteIdForRefundEvent } from "./creditNote";

function isCause(code: string) {
  return (e: unknown) => e instanceof BillingError && e.causeCode === code;
}

const SYNTHETIC_OPERATOR_GSTIN = "29AAAAA0000A1Z5";
const SEP_SUPPLY = istWallClockToEpochMs("2026-09-12T12:00:00");
const B2B_EVENT_ID = "evt-gstr-b2b";
const B2B_INVOICE_ID = invoiceIdForFinancialEvent(B2B_EVENT_ID);
const B2C_EVENT_ID = "evt-gstr-b2c";
const B2C_INVOICE_ID = invoiceIdForFinancialEvent(B2C_EVENT_ID);
const FILED_EVENT_ID = "evt-gstr-filed";
const FILED_INVOICE_ID = invoiceIdForFinancialEvent(FILED_EVENT_ID);
const APPLE_EVENT_ID = "evt-gstr-apple";
const APPLE_INVOICE_ID = invoiceIdForFinancialEvent(APPLE_EVENT_ID);
const REVIEW_EVENT_ID = "evt-gstr-review";
const REVIEW_INVOICE_ID = invoiceIdForFinancialEvent(REVIEW_EVENT_ID);
const TABLE14B_EVENT_ID = "evt-gstr-14b";
const TABLE14B_INVOICE_ID = invoiceIdForFinancialEvent(TABLE14B_EVENT_ID);
const MISSING_OP_EVENT_ID = "evt-gstr-missing-op";
const MISSING_OP_INVOICE_ID = invoiceIdForFinancialEvent(MISSING_OP_EVENT_ID);
const INJECT_EVENT_ID = "evt-gstr-inject";
const INJECT_INVOICE_ID = invoiceIdForFinancialEvent(INJECT_EVENT_ID);
const CN_REFUND_EVENT_ID = "evt-gstr-refund-1";
const CN_ID = creditNoteIdForRefundEvent(CN_REFUND_EVENT_ID);

function filingEco(platform: "android" | "ios" = "android"): SubscriptionInvoiceDoc["ecoReporting"] {
  return {
    platform,
    operatorIdentifier: platform === "android" ? "google_play" : "apple_app_store",
    operatorGstin: SYNTHETIC_OPERATOR_GSTIN,
    taxResponsibilityMode: "developer",
    ecoReportingCategory: "section52_table14a",
  };
}

function unresolvedEco(platform: "android" | "ios" = "android"): SubscriptionInvoiceDoc["ecoReporting"] {
  return {
    platform,
    operatorIdentifier: platform === "android" ? "google_play" : "apple_app_store",
    operatorGstin: null,
    taxResponsibilityMode: platform === "ios" ? "unconfirmed" : "developer",
    ecoReportingCategory: "requires_tax_review",
  };
}

function invoice(
  partial: Partial<SubscriptionInvoiceDoc> & {
    invoiceId: string;
    documentType: SubscriptionInvoiceDoc["documentType"];
  }
): SubscriptionInvoiceDoc {
  return {
    uid: "user-1",
    diagnosticUid: "diag01",
    financialEventId: partial.invoiceId,
    platform: "android",
    canonicalSku: "vyd_professional_yearly",
    plan: "professional",
    billingPeriod: "yearly",
    subscriptionDescription: "Vyaamikk Diary Professional Subscription (Yearly)",
    taxResponsibilityMode: "developer",
    documentNumber: "SS/2026-27/0001",
    financialYear: "2026-27",
    taxPeriodMonth: "2026-09",
    taxPeriodStatus: "resolved",
    invoiceIssuedAt: SEP_SUPPLY,
    invoiceIssuedOnIst: "12-09-2026",
    supplyOccurredAt: SEP_SUPPLY,
    issueStatus: "issued",
    issueHoldReason: null,
    reverseChargeMode: "no",
    seller: {
      legalName: "SPECIAL SOFTWARES LLP (TEST — CERTIFICATE UNCONFIRMED)",
      tradeName: "Vyaamikk Diary",
      gstin: "09AAAAA0000A1Z5",
      registeredAddress: "TEST REGISTERED ADDRESS PLACEHOLDER",
      stateCode: "09",
      stateName: "Uttar Pradesh",
    },
    buyer: {
      classification: partial.documentType === "tax_invoice_b2b" ? "b2b" : "b2c",
      legalName: "Buyer",
      gstin: partial.documentType === "tax_invoice_b2b" ? "27AAAAA0000A1Z5" : null,
      gstinVerificationStatus: partial.documentType === "tax_invoice_b2b" ? "verified" : "not_provided",
      billingAddress: "12 MG Road, Mumbai, 400001",
      postalCode: "400001",
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
    ecoReporting: filingEco(),
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
    invoiceIssueDueAt: null,
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  };
}

function complianceFor(
  inv: SubscriptionInvoiceDoc,
  patch: Partial<SubscriptionTaxComplianceDoc> = {}
): SubscriptionTaxComplianceDoc {
  const open =
    inv.issueStatus !== "issued" ||
    inv.ecoReporting.ecoReportingCategory === "requires_tax_review" ||
    inv.taxPeriodStatus !== "resolved";
  const reasons: string[] = [];
  if (inv.issueStatus !== "issued") reasons.push("document_unissued");
  if (inv.taxResponsibilityMode === "unconfirmed") reasons.push("tax_responsibility_unconfirmed");
  if (inv.ecoReporting.ecoReportingCategory === "requires_tax_review") {
    reasons.push("eco_reporting_requires_tax_review");
  }
  if (inv.taxPeriodStatus === "unresolved_cross_period") reasons.push("tax_period_unresolved_cross_period");
  return {
    invoiceId: inv.invoiceId,
    documentKind: "invoice",
    financialEventId: inv.financialEventId,
    originalInvoiceId: null,
    uid: inv.uid,
    supplyMonthKey: "2026-09",
    issueMonthKey: inv.invoiceIssuedAt ? "2026-09" : null,
    reportingTaxPeriodMonth: inv.taxPeriodMonth,
    taxPeriodDecisionStatus: inv.taxPeriodStatus === "resolved" ? "resolved" : inv.issueStatus === "issued" ? "unresolved_cross_period" : "pending_issue",
    ecoReportingCategory: inv.ecoReporting.ecoReportingCategory,
    operatorIdentifier: inv.ecoReporting.operatorIdentifier,
    operatorGstin: inv.ecoReporting.operatorGstin,
    reviewStatus: open ? "requires_tax_review" : "ready_to_file",
    unresolvedReasons: reasons.sort(),
    cumulativeCreditReversedInPaise: 0,
    gstAdjustmentEligibility: "not_applicable",
    recipientItcReversalEvidenceStatus: "not_applicable",
    taxIncidenceConditionStatus: "not_applicable",
    section34OuterLimitAt: null,
    annualReturnCutoffStatus: "not_applicable",
    annualReturnFurnishedAt: null,
    annualReturnCutoffReviewedAt: null,
    annualReturnCutoffReviewBasis: null,
    taxAdjustmentDisposition: "not_applicable",
    reviewedAt: open ? null : 1,
    reviewedByDiagnosticUid: open ? null : "admindiag01",
    reviewBasis: open ? null : "fixture",
    reviewVersion: open ? 0 : 1,
    previousEcoReportingCategory: null,
    previousReportingTaxPeriodMonth: null,
    createdAt: 1,
    updatedAt: 1,
    ...patch,
  };
}

function complianceForCn(
  cn: SubscriptionCreditNoteDoc,
  original: SubscriptionInvoiceDoc
): SubscriptionTaxComplianceDoc {
  return {
    invoiceId: cn.creditNoteId,
    documentKind: "credit_note",
    financialEventId: cn.refundFinancialEventId,
    originalInvoiceId: original.invoiceId,
    uid: cn.uid,
    supplyMonthKey: "2026-09",
    issueMonthKey: cn.taxPeriodMonth,
    reportingTaxPeriodMonth: cn.taxPeriodMonth,
    taxPeriodDecisionStatus: "resolved",
    ecoReportingCategory: original.ecoReporting.ecoReportingCategory,
    operatorIdentifier: original.ecoReporting.operatorIdentifier,
    operatorGstin: original.ecoReporting.operatorGstin,
    reviewStatus: "ready_to_file",
    unresolvedReasons: [],
    cumulativeCreditReversedInPaise: 0,
    gstAdjustmentEligibility: "eligible",
    recipientItcReversalEvidenceStatus: "confirmed",
    taxIncidenceConditionStatus: "not_applicable",
    section34OuterLimitAt: istWallClockToEpochMs("2027-11-30T23:59:59"),
    annualReturnCutoffStatus: "not_furnished_as_of_review",
    annualReturnFurnishedAt: null,
    annualReturnCutoffReviewedAt: 1,
    annualReturnCutoffReviewBasis: "fixture",
    taxAdjustmentDisposition: "credit_note_issued",
    reviewedAt: 1,
    reviewedByDiagnosticUid: "admindiag01",
    reviewBasis: "fixture",
    reviewVersion: 1,
    previousEcoReportingCategory: null,
    previousReportingTaxPeriodMonth: null,
    createdAt: 1,
    updatedAt: 1,
  };
}

function seedDocs(
  store: InstanceType<typeof MemoryBillingStore>,
  invoices: SubscriptionInvoiceDoc[],
  creditNotes: SubscriptionCreditNoteDoc[] = [],
  extras: SubscriptionTaxComplianceDoc[] = []
): void {
  for (const inv of invoices) {
    store.docs.set(`_subscriptionInvoices/${inv.invoiceId}`, { ...inv });
    store.docs.set(`_subscriptionTaxCompliance/${inv.invoiceId}`, { ...complianceFor(inv) });
    store.docs.set(
      financialLedgerPath(inv.financialEventId),
      {
        ...ledgerEvent({
          financialEventId: inv.financialEventId,
          uid: inv.uid,
          platform: inv.platform === "web" ? "android" : inv.platform,
          canonicalSku: inv.canonicalSku ?? "vyd_professional_yearly",
          occurredAt: inv.supplyOccurredAt ?? SEP_SUPPLY,
          monthKey: "2026-09",
        }),
      }
    );
  }
  for (const cn of creditNotes) {
    store.docs.set(`_subscriptionCreditNotes/${cn.creditNoteId}`, { ...cn });
    const original = invoices.find((i) => i.invoiceId === cn.originalInvoiceId);
    if (original) {
      store.docs.set(`_subscriptionTaxCompliance/${cn.creditNoteId}`, { ...complianceForCn(cn, original) });
    }
    store.docs.set(
      financialLedgerPath(cn.refundFinancialEventId),
      {
        ...ledgerEvent({
          financialEventId: cn.refundFinancialEventId,
          eventType: "refund",
          relatedFinancialEventId: original?.financialEventId ?? null,
          uid: cn.uid,
          platform: original && original.platform !== "web" ? original.platform : "android",
          canonicalSku: original?.canonicalSku ?? "vyd_professional_yearly",
          occurredAt: cn.issuedAt ?? SEP_SUPPLY,
          monthKey: cn.taxPeriodMonth ?? "2026-09",
        }),
      }
    );
  }
  for (const rec of extras) {
    store.docs.set(`_subscriptionTaxCompliance/${rec.invoiceId}`, { ...rec });
  }
}

function ledgerEvent(
  patch: Partial<BillingEventLedgerDoc> & { financialEventId: string }
): BillingEventLedgerDoc {
  return {
    platform: "android",
    uid: "user-1",
    canonicalSku: "vyd_professional_yearly",
    eventType: "purchase",
    grossAmountInPaise: 11800,
    currency: "INR",
    actualPlatformCommissionInPaise: 1770,
    estimatedPlatformCommissionInPaise: null,
    occurredAt: SEP_SUPPLY,
    monthKey: "2026-09",
    relatedFinancialEventId: null,
    recordedAt: 1,
    recordedBy: "androidValidation",
    ...patch,
  };
}

function eventsFor(
  invoices: SubscriptionInvoiceDoc[],
  creditNotes: SubscriptionCreditNoteDoc[] = []
): BillingEventLedgerDoc[] {
  const events = invoices.map((inv) =>
    ledgerEvent({
      financialEventId: inv.financialEventId,
      uid: inv.uid,
      platform: inv.platform === "web" ? "android" : inv.platform,
      canonicalSku: inv.canonicalSku ?? "vyd_professional_yearly",
      occurredAt: inv.supplyOccurredAt ?? SEP_SUPPLY,
      monthKey: "2026-09",
    })
  );
  for (const cn of creditNotes) {
    const original = invoices.find((i) => i.invoiceId === cn.originalInvoiceId);
    events.push(
      ledgerEvent({
        financialEventId: cn.refundFinancialEventId,
        eventType: "refund",
        relatedFinancialEventId: original?.financialEventId ?? null,
        uid: cn.uid,
        platform: original && original.platform !== "web" ? original.platform : "android",
        canonicalSku: original?.canonicalSku ?? "vyd_professional_yearly",
        occurredAt: cn.issuedAt ?? SEP_SUPPLY,
        monthKey: cn.taxPeriodMonth ?? "2026-09",
      })
    );
  }
  return events;
}

async function testRound4LedgerCompletenessAndDrift(
  admin: { uid: string; tokenAdmin: boolean; adminIdentityProvisioned: boolean },
  storage: MemoryInvoiceObjectStorage
): Promise<void> {
  const orphanPurchase = new MemoryBillingStore();
  orphanPurchase.docs.set(
    financialLedgerPath("evt-orphan-purchase"),
    { ...ledgerEvent({ financialEventId: "evt-orphan-purchase" }) }
  );
  const purchaseScope = await new MemoryTaxComplianceReportSource(orphanPurchase).loadMonthlyScope("2026-09");
  assert.ok(
    purchaseScope.complianceRecords.some((c) =>
      c.unresolvedReasons.includes("financial_event_tax_document_missing")
    )
  );
  const purchasePapers = buildGstr1WorkingPapers({ month: "2026-09", ...purchaseScope });
  assert.equal(purchasePapers.reviewStatus, "requires_tax_review");
  assert.ok(purchasePapers.sourceFinancialEventIds.includes("evt-orphan-purchase"));

  const orphanRenewal = new MemoryBillingStore();
  orphanRenewal.docs.set(
    financialLedgerPath("evt-orphan-renewal"),
    { ...ledgerEvent({ financialEventId: "evt-orphan-renewal", eventType: "renewal" }) }
  );
  const renewalPapers = buildGstr1WorkingPapers({
    month: "2026-09",
    ...(await new MemoryTaxComplianceReportSource(orphanRenewal).loadMonthlyScope("2026-09")),
  });
  assert.equal(renewalPapers.reviewStatus, "requires_tax_review");
  assert.ok(
    renewalPapers.complianceOpenItems.some((i) =>
      i.unresolvedReasons.includes("financial_event_tax_document_missing")
    )
  );

  const originalEventId = "evt-b2b-oct";
  const original = invoice({
    invoiceId: invoiceIdForFinancialEvent(originalEventId),
    financialEventId: originalEventId,
    documentType: "tax_invoice_b2b",
  });
  const orphanRefund = new MemoryBillingStore();
  orphanRefund.docs.set(`_subscriptionInvoices/${original.invoiceId}`, { ...original });
  orphanRefund.docs.set(`_subscriptionTaxCompliance/${original.invoiceId}`, { ...complianceFor(original) });
  orphanRefund.docs.set(
    financialLedgerPath("evt-orphan-refund"),
    {
      ...ledgerEvent({
        financialEventId: "evt-orphan-refund",
        eventType: "refund",
        relatedFinancialEventId: original.financialEventId,
        occurredAt: istWallClockToEpochMs("2026-10-05T12:00:00"),
        monthKey: "2026-10",
      }),
    }
  );
  const octPapers = buildGstr1WorkingPapers({
    month: "2026-10",
    ...(await new MemoryTaxComplianceReportSource(orphanRefund).loadMonthlyScope("2026-10")),
  });
  assert.equal(octPapers.reviewStatus, "requires_tax_review");
  assert.ok(octPapers.taxAdjustments.some((row) => row.financialEventId === "evt-orphan-refund"));
  assert.ok(
    octPapers.complianceOpenItems.some((i) => i.unresolvedReasons.includes("tax_adjustment_disposition_missing"))
  );
  assert.equal(octPapers.table14a.every((row) => row.creditNoteIds.length === 0), true);

  const unresolvedCn = {
    ...cnFixtureEligible(original),
    gstAdjustmentEligibility: "requires_review" as const,
    recipientItcReversalEvidenceStatus: "unconfirmed" as const,
  };
  const unresolvedPapers = buildGstr1WorkingPapers({
    month: "2026-09",
    invoices: [original],
    creditNotes: [unresolvedCn],
    complianceRecords: [
      complianceFor(original),
      { ...complianceForCn(unresolvedCn, original), gstAdjustmentEligibility: "requires_review", unresolvedReasons: ["gst_adjustment_requires_review"], reviewStatus: "requires_tax_review" },
    ],
  });
  assert.equal(unresolvedPapers.reviewStatus, "requires_tax_review");
  assert.equal(unresolvedPapers.creditNotes[0]?.outputTaxReductionIncluded, false);
  assert.equal(
    unresolvedPapers.table14a[0]?.creditNoteIds.includes(unresolvedCn.creditNoteId) ?? false,
    false
  );

  const appearStore = new MemoryBillingStore();
  seedDocs(appearStore, [original]);
  const appeared = await generateGstr1WorkingPapersCore({
    month: "2026-09",
    admin,
    storage,
    store: appearStore,
    generatedByDiagnosticUid: "admindiag01",
    nowMs: 40,
  });
  assert.deepEqual(appeared.papers.sourceFinancialEventIds, [originalEventId]);
  appearStore.docs.set(
    financialLedgerPath("evt-late-purchase"),
    { ...ledgerEvent({ financialEventId: "evt-late-purchase" }) }
  );
  await assert.rejects(
    applyMarkGstr1Filed(appearStore, {
      admin,
      adminDiagnosticUid: "admindiag01",
      reportId: appeared.papers.reportId,
      acknowledgement: "ACK-LATE",
      nowMs: 41,
    }),
    isCause("gstr_report_source_drift")
  );

  const matchedEventId = "evt-matched-purchase";
  const matchedInvoiceId = invoiceIdForFinancialEvent(matchedEventId);
  const matched = invoice({
    invoiceId: matchedInvoiceId,
    financialEventId: matchedEventId,
    documentType: "tax_invoice_b2b",
    documentNumber: "SS/2026-27/0008",
  });
  const mutateStore = new MemoryBillingStore();
  seedDocs(mutateStore, [matched]);
  mutateStore.docs.set(
    financialLedgerPath(matchedEventId),
    { ...ledgerEvent({ financialEventId: matchedEventId }) }
  );
  const mutatedGenerated = await generateGstr1WorkingPapersCore({
    month: "2026-09",
    admin,
    storage,
    store: mutateStore,
    generatedByDiagnosticUid: "admindiag01",
    nowMs: 42,
  });
  assert.equal(mutatedGenerated.papers.reviewStatus, "ready_to_file");
  assert.ok(mutatedGenerated.papers.sourceFinancialEventIds.includes(matchedEventId));
  mutateStore.docs.set(financialLedgerPath(matchedEventId), {
    ...ledgerEvent({ financialEventId: matchedEventId, grossAmountInPaise: 1 }),
  });
  await assert.rejects(
    applyMarkGstr1Filed(mutateStore, {
      admin,
      adminDiagnosticUid: "admindiag01",
      reportId: mutatedGenerated.papers.reportId,
      acknowledgement: "ACK-MUTATE",
      nowMs: 43,
    }),
    isCause("gstr_report_source_drift")
  );
  mutateStore.docs.delete(financialLedgerPath(matchedEventId));
  await assert.rejects(
    applyMarkGstr1Filed(mutateStore, {
      admin,
      adminDiagnosticUid: "admindiag01",
      reportId: mutatedGenerated.papers.reportId,
      acknowledgement: "ACK-GONE",
      nowMs: 44,
    }),
    isCause("gstr_report_source_drift")
  );
}

function openReasonsOf(
  papers: ReturnType<typeof buildGstr1WorkingPapers>,
  invoiceId: string
): string[] {
  return papers.complianceOpenItems.find((item) => item.invoiceId === invoiceId)?.unresolvedReasons ?? [];
}

async function testRound5BidirectionalTaxMathAndCutoff(
  admin: { uid: string; tokenAdmin: boolean; adminIdentityProvisioned: boolean },
  storage: MemoryInvoiceObjectStorage
): Promise<void> {
  const sourceOf = (store: MemoryBillingStore) => new MemoryTaxComplianceReportSource(store);

  const caseA = new MemoryBillingStore();
  const aEvent = "evt-r5-a";
  caseA.docs.set(financialLedgerPath(aEvent), { ...ledgerEvent({ financialEventId: aEvent }) });
  const papersA = buildGstr1WorkingPapers({
    month: "2026-09",
    ...(await sourceOf(caseA).loadMonthlyScope("2026-09")),
  });
  assert.equal(papersA.reviewStatus, "requires_tax_review");
  assert.ok(
    papersA.complianceOpenItems.some((item) =>
      item.unresolvedReasons.includes("financial_event_tax_document_missing")
    )
  );

  const caseB = new MemoryBillingStore();
  const bEvent = "evt-r5-b";
  const bInvoiceId = invoiceIdForFinancialEvent(bEvent);
  const bInv = invoice({
    invoiceId: bInvoiceId,
    financialEventId: bEvent,
    documentType: "tax_invoice_b2b",
    documentNumber: "SS/2026-27/0102",
  });
  caseB.docs.set(financialLedgerPath(bEvent), { ...ledgerEvent({ financialEventId: bEvent }) });
  caseB.docs.set(`_subscriptionTaxCompliance/${bInvoiceId}`, { ...complianceFor(bInv) });
  const papersB = buildGstr1WorkingPapers({
    month: "2026-09",
    ...(await sourceOf(caseB).loadMonthlyScope("2026-09")),
  });
  assert.equal(papersB.reviewStatus, "requires_tax_review");
  const bReasons = openReasonsOf(papersB, bInvoiceId);
  assert.ok(bReasons.includes("financial_event_tax_document_missing"));
  assert.ok(bReasons.includes("financial_event_invoice_mismatch"));

  const caseC = new MemoryBillingStore();
  const cEvent = "evt-r5-c";
  const cInv = invoice({
    invoiceId: invoiceIdForFinancialEvent(cEvent),
    financialEventId: cEvent,
    documentType: "tax_invoice_b2b",
    documentNumber: "SS/2026-27/0103",
  });
  caseC.docs.set(financialLedgerPath(cEvent), { ...ledgerEvent({ financialEventId: cEvent }) });
  caseC.docs.set(`_subscriptionInvoices/${cInv.invoiceId}`, { ...cInv });
  const papersC = buildGstr1WorkingPapers({
    month: "2026-09",
    ...(await sourceOf(caseC).loadMonthlyScope("2026-09")),
  });
  assert.equal(papersC.reviewStatus, "requires_tax_review");
  assert.ok(openReasonsOf(papersC, cInv.invoiceId).includes("financial_event_compliance_mismatch"));

  const caseD = new MemoryBillingStore();
  const dEvent = "evt-r5-d";
  const dInv = invoice({
    invoiceId: invoiceIdForFinancialEvent(dEvent),
    financialEventId: dEvent,
    documentType: "tax_invoice_b2b",
    documentNumber: "SS/2026-27/0104",
  });
  caseD.docs.set(financialLedgerPath(dEvent), { ...ledgerEvent({ financialEventId: dEvent }) });
  caseD.docs.set(`_subscriptionInvoices/${dInv.invoiceId}`, { ...dInv });
  caseD.docs.set(`_subscriptionTaxCompliance/${dInv.invoiceId}`, {
    ...complianceFor(dInv),
    supplyMonthKey: "2026-08",
    issueMonthKey: "2026-08",
    reportingTaxPeriodMonth: "2026-08",
  });
  const papersD = buildGstr1WorkingPapers({
    month: "2026-09",
    ...(await sourceOf(caseD).loadMonthlyScope("2026-09")),
  });
  assert.equal(papersD.reviewStatus, "requires_tax_review");
  assert.ok(openReasonsOf(papersD, dInv.invoiceId).includes("financial_event_month_scope_mismatch"));

  const caseE = new MemoryBillingStore();
  const eEvent = "evt-r5-e";
  const eInv = invoice({
    invoiceId: invoiceIdForFinancialEvent(eEvent),
    financialEventId: eEvent,
    documentType: "tax_invoice_b2b",
    documentNumber: "SS/2026-27/0105",
  });
  caseE.docs.set(`_subscriptionInvoices/${eInv.invoiceId}`, { ...eInv });
  caseE.docs.set(`_subscriptionTaxCompliance/${eInv.invoiceId}`, { ...complianceFor(eInv) });
  const papersE = buildGstr1WorkingPapers({
    month: "2026-09",
    ...(await sourceOf(caseE).loadMonthlyScope("2026-09")),
  });
  assert.equal(papersE.reviewStatus, "requires_tax_review");
  assert.ok(openReasonsOf(papersE, eInv.invoiceId).includes("tax_document_financial_event_missing"));

  const caseF = new MemoryBillingStore();
  const fEvent = "evt-r5-f";
  const fInv = invoice({
    invoiceId: invoiceIdForFinancialEvent(fEvent),
    financialEventId: "evt-r5-f-wrong",
    documentType: "tax_invoice_b2b",
    documentNumber: "SS/2026-27/0106",
  });
  caseF.docs.set(financialLedgerPath(fEvent), { ...ledgerEvent({ financialEventId: fEvent }) });
  caseF.docs.set(`_subscriptionInvoices/${fInv.invoiceId}`, { ...fInv });
  caseF.docs.set(`_subscriptionTaxCompliance/${fInv.invoiceId}`, {
    ...complianceFor(fInv),
    financialEventId: fEvent,
  });
  const papersF = buildGstr1WorkingPapers({
    month: "2026-09",
    ...(await sourceOf(caseF).loadMonthlyScope("2026-09")),
  });
  assert.equal(papersF.reviewStatus, "requires_tax_review");
  assert.ok(openReasonsOf(papersF, fInv.invoiceId).includes("financial_event_invoice_mismatch"));

  const caseG = new MemoryBillingStore();
  const gEvent = "evt-r5-g";
  const gInv = invoice({
    invoiceId: invoiceIdForFinancialEvent(gEvent),
    financialEventId: gEvent,
    documentType: "tax_invoice_b2b",
    documentNumber: "SS/2026-27/0107",
    uid: "other-user",
    platform: "ios",
    canonicalSku: "vyd_professional_monthly",
  });
  caseG.docs.set(financialLedgerPath(gEvent), { ...ledgerEvent({ financialEventId: gEvent }) });
  caseG.docs.set(`_subscriptionInvoices/${gInv.invoiceId}`, { ...gInv });
  caseG.docs.set(`_subscriptionTaxCompliance/${gInv.invoiceId}`, { ...complianceFor(gInv) });
  const papersG = buildGstr1WorkingPapers({
    month: "2026-09",
    ...(await sourceOf(caseG).loadMonthlyScope("2026-09")),
  });
  assert.equal(papersG.reviewStatus, "requires_tax_review");
  assert.ok(openReasonsOf(papersG, gInv.invoiceId).includes("financial_event_invoice_mismatch"));

  const caseH = new MemoryBillingStore();
  const hPurchase = "evt-r5-h-purchase";
  const hRefund = "evt-r5-h-refund";
  const hInv = invoice({
    invoiceId: invoiceIdForFinancialEvent(hPurchase),
    financialEventId: hPurchase,
    documentType: "tax_invoice_b2b",
    documentNumber: "SS/2026-27/0108",
  });
  const hCnId = creditNoteIdForRefundEvent(hRefund);
  const hCn: SubscriptionCreditNoteDoc = {
    ...cnFixtureEligible(hInv),
    creditNoteId: hCnId,
    refundFinancialEventId: hRefund,
    gstAdjustmentEligibility: "eligible",
    recipientItcReversalEvidenceStatus: "confirmed",
    annualReturnCutoffStatus: "not_furnished_as_of_review",
    annualReturnCutoffReviewedAt: 1,
    annualReturnCutoffReviewBasis: "fixture",
  };
  caseH.docs.set(financialLedgerPath(hPurchase), { ...ledgerEvent({ financialEventId: hPurchase }) });
  caseH.docs.set(`_subscriptionInvoices/${hInv.invoiceId}`, { ...hInv });
  caseH.docs.set(`_subscriptionTaxCompliance/${hInv.invoiceId}`, { ...complianceFor(hInv) });
  caseH.docs.set(`_subscriptionCreditNotes/${hCnId}`, { ...hCn });
  caseH.docs.set(`_subscriptionTaxCompliance/${hCnId}`, { ...complianceForCn(hCn, hInv) });
  const papersH = buildGstr1WorkingPapers({
    month: "2026-09",
    ...(await sourceOf(caseH).loadMonthlyScope("2026-09")),
  });
  assert.equal(papersH.reviewStatus, "requires_tax_review");
  assert.ok(openReasonsOf(papersH, hCnId).includes("tax_document_financial_event_missing"));

  const caseI = new MemoryBillingStore();
  const iPurchase = "evt-r5-i-purchase";
  const iRefund = "evt-r5-i-refund";
  const iInv = invoice({
    invoiceId: invoiceIdForFinancialEvent(iPurchase),
    financialEventId: iPurchase,
    documentType: "tax_invoice_b2b",
    documentNumber: "SS/2026-27/0109",
  });
  const iCnId = creditNoteIdForRefundEvent(iRefund);
  const iCn: SubscriptionCreditNoteDoc = {
    ...cnFixtureEligible(iInv),
    creditNoteId: iCnId,
    refundFinancialEventId: iRefund,
    gstAdjustmentEligibility: "eligible",
    recipientItcReversalEvidenceStatus: "confirmed",
    annualReturnCutoffStatus: "not_furnished_as_of_review",
    annualReturnCutoffReviewedAt: 1,
    annualReturnCutoffReviewBasis: "fixture",
  };
  caseI.docs.set(financialLedgerPath(iPurchase), { ...ledgerEvent({ financialEventId: iPurchase }) });
  caseI.docs.set(
    financialLedgerPath(iRefund),
    {
      ...ledgerEvent({
        financialEventId: iRefund,
        eventType: "refund",
        relatedFinancialEventId: "evt-r5-i-not-original",
      }),
    }
  );
  caseI.docs.set(`_subscriptionInvoices/${iInv.invoiceId}`, { ...iInv });
  caseI.docs.set(`_subscriptionTaxCompliance/${iInv.invoiceId}`, { ...complianceFor(iInv) });
  caseI.docs.set(`_subscriptionCreditNotes/${iCnId}`, { ...iCn });
  caseI.docs.set(`_subscriptionTaxCompliance/${iCnId}`, { ...complianceForCn(iCn, iInv) });
  const papersI = buildGstr1WorkingPapers({
    month: "2026-09",
    ...(await sourceOf(caseI).loadMonthlyScope("2026-09")),
  });
  assert.equal(papersI.reviewStatus, "requires_tax_review");
  const iReasons = openReasonsOf(papersI, iCnId);
  assert.ok(
    iReasons.includes("tax_document_related_financial_event_missing") ||
      iReasons.includes("tax_document_related_financial_event_mismatch")
  );

  const igstPurchase = "evt-r5-igst";
  const igstRefund = "evt-r5-igst-refund";
  const igstInv = invoice({
    invoiceId: invoiceIdForFinancialEvent(igstPurchase),
    financialEventId: igstPurchase,
    documentType: "tax_invoice_b2b",
    documentNumber: "SS/2026-27/0110",
    taxableAmountInPaise: 10000,
    igstInPaise: 1800,
    cgstInPaise: 0,
    sgstInPaise: 0,
    totalTaxInPaise: 1800,
    totalInPaise: 11800,
  });
  const igstCn: SubscriptionCreditNoteDoc = {
    ...cnFixtureEligible(igstInv),
    creditNoteId: creditNoteIdForRefundEvent(igstRefund),
    refundFinancialEventId: igstRefund,
    issuedAt: SEP_SUPPLY,
    issuedOnIst: "12-09-2026",
    taxableAmountReversedInPaise: 10000,
    igstReversedInPaise: 1800,
    cgstReversedInPaise: 0,
    sgstReversedInPaise: 0,
    totalTaxReversedInPaise: 1800,
    totalReversedInPaise: 11800,
    gstAdjustmentEligibility: "eligible",
    recipientItcReversalEvidenceStatus: "confirmed",
    annualReturnCutoffStatus: "not_furnished_as_of_review",
    annualReturnCutoffReviewedAt: 1,
    annualReturnCutoffReviewBasis: "fixture",
  };
  const igstStore = new MemoryBillingStore();
  seedDocs(igstStore, [igstInv], [igstCn]);
  const igstPapers = buildGstr1WorkingPapers({
    month: "2026-09",
    ...(await sourceOf(igstStore).loadMonthlyScope("2026-09")),
  });
  assert.equal(igstPapers.reviewStatus, "ready_to_file");
  const igstAdj = igstPapers.taxAdjustments.find((row) => row.financialEventId === igstRefund);
  assert.equal(igstAdj?.taxableValueReductionInPaise, 10000);
  assert.equal(igstAdj?.outputTaxReductionInPaise, 1800);
  assert.equal(igstAdj?.grossReversalInPaise, 11800);
  const igstCsv = workingPapersToCsv(igstPapers);
  const igstCsvRow = igstCsv.split("\n").find((line) => line.includes(igstRefund));
  assert.ok(igstCsvRow);
  assert.match(igstCsvRow ?? "", /"10000"/);
  assert.match(igstCsvRow ?? "", /"1800"/);
  assert.match(igstCsvRow ?? "", /"11800"/);
  assert.equal(igstCsvRow?.includes('"10000"') && igstCsvRow.includes('"1800"'), true);

  const cgstPurchase = "evt-r5-cgst";
  const cgstRefund = "evt-r5-cgst-refund";
  const cgstInv = invoice({
    invoiceId: invoiceIdForFinancialEvent(cgstPurchase),
    financialEventId: cgstPurchase,
    documentType: "tax_invoice_b2b",
    documentNumber: "SS/2026-27/0111",
    taxType: "cgst_sgst",
    taxableAmountInPaise: 10000,
    cgstInPaise: 900,
    sgstInPaise: 900,
    igstInPaise: 0,
    totalTaxInPaise: 1800,
    totalInPaise: 11800,
    placeOfSupplyStateCode: "09",
    placeOfSupplyStateName: "Uttar Pradesh",
  });
  const cgstCn: SubscriptionCreditNoteDoc = {
    ...cnFixtureEligible(cgstInv),
    creditNoteId: creditNoteIdForRefundEvent(cgstRefund),
    refundFinancialEventId: cgstRefund,
    taxType: "cgst_sgst",
    taxableAmountReversedInPaise: 10000,
    cgstReversedInPaise: 900,
    sgstReversedInPaise: 900,
    igstReversedInPaise: 0,
    totalTaxReversedInPaise: 1800,
    totalReversedInPaise: 11800,
    gstAdjustmentEligibility: "eligible",
    recipientItcReversalEvidenceStatus: "confirmed",
    annualReturnCutoffStatus: "not_furnished_as_of_review",
    annualReturnCutoffReviewedAt: 1,
    annualReturnCutoffReviewBasis: "fixture",
  };
  const cgstStore = new MemoryBillingStore();
  seedDocs(cgstStore, [cgstInv], [cgstCn]);
  const cgstPapers = buildGstr1WorkingPapers({
    month: "2026-09",
    ...(await sourceOf(cgstStore).loadMonthlyScope("2026-09")),
  });
  assert.equal(cgstPapers.reviewStatus, "ready_to_file");
  const cgstAdj = cgstPapers.taxAdjustments.find((row) => row.financialEventId === cgstRefund);
  assert.equal(cgstAdj?.taxableValueReductionInPaise, 10000);
  assert.equal(cgstAdj?.outputTaxReductionInPaise, 1800);
  assert.equal(cgstAdj?.cgstReductionInPaise, 900);
  assert.equal(cgstAdj?.sgstReductionInPaise, 900);
  const cgstCsvRow = workingPapersToCsv(cgstPapers)
    .split("\n")
    .find((line) => line.includes(cgstRefund));
  assert.ok(cgstCsvRow);
  assert.match(cgstCsvRow ?? "", /"1800"/);

  const cutoffStore = new MemoryBillingStore();
  seedDocs(cutoffStore, [igstInv], [igstCn]);
  const generatedCutoff = await generateGstr1WorkingPapersCore({
    month: "2026-09",
    admin,
    storage,
    store: cutoffStore,
    generatedByDiagnosticUid: "admindiag01",
    nowMs: 80,
  });
  assert.equal(generatedCutoff.papers.reviewStatus, "ready_to_file");
  const cnCompPath = `_subscriptionTaxCompliance/${igstCn.creditNoteId}`;
  const liveCnComp = cutoffStore.docs.get(cnCompPath) as SubscriptionTaxComplianceDoc;
  cutoffStore.docs.set(cnCompPath, {
    ...liveCnComp,
    annualReturnCutoffStatus: "unconfirmed",
    annualReturnCutoffReviewedAt: null,
    annualReturnCutoffReviewBasis: null,
    reviewVersion: liveCnComp.reviewVersion + 1,
  });
  await assert.rejects(
    applyMarkGstr1Filed(cutoffStore, {
      admin,
      adminDiagnosticUid: "admindiag01",
      reportId: generatedCutoff.papers.reportId,
      acknowledgement: "ACK-CUTOFF-DRIFT",
      nowMs: 81,
    }),
    isCause("gstr_report_source_drift")
  );

  await assert.rejects(
    applyReviewTaxCompliance(igstStore, {
      invoiceId: igstCn.creditNoteId,
      admin,
      reviewedByDiagnosticUid: "admindiag01",
      reviewBasis: "attempt eligible without annual-return cutoff",
      nowMs: 82,
      gstAdjustmentEligibility: "eligible",
      recipientItcReversalEvidenceStatus: "confirmed",
      annualReturnCutoffStatus: "unconfirmed",
    }),
    isCause("gst_adjustment_annual_return_cutoff_unconfirmed")
  );

  await assert.rejects(
    applyReviewTaxCompliance(igstStore, {
      invoiceId: igstCn.creditNoteId,
      admin,
      reviewedByDiagnosticUid: "admindiag01",
      reviewBasis: "GSTR-9 furnished 01-09-2026, earlier than CN issue",
      nowMs: 83,
      gstAdjustmentEligibility: "eligible",
      recipientItcReversalEvidenceStatus: "confirmed",
      annualReturnCutoffStatus: "furnished",
      annualReturnFurnishedAt: istWallClockToEpochMs("2026-09-01T00:00:00"),
    }),
    isCause("gst_adjustment_section34_deadline_passed")
  );

  const ceiling = await applyReviewTaxCompliance(igstStore, {
    invoiceId: igstCn.creditNoteId,
    admin,
    reviewedByDiagnosticUid: "admindiag01",
    reviewBasis: "annual return not furnished as of review; 30-Nov ceiling remains",
    nowMs: 84,
    gstAdjustmentEligibility: "eligible",
    recipientItcReversalEvidenceStatus: "confirmed",
    annualReturnCutoffStatus: "not_furnished_as_of_review",
    annualReturnFurnishedAt: null,
  });
  assert.equal(ceiling.annualReturnCutoffStatus, "not_furnished_as_of_review");
  assert.equal(ceiling.gstAdjustmentEligibility, "eligible");
  assert.equal(ceiling.section34OuterLimitAt, istWallClockToEpochMs("2027-11-30T23:59:59"));

  const furnishedAfterIssue = await applyReviewTaxCompliance(igstStore, {
    invoiceId: igstCn.creditNoteId,
    admin,
    reviewedByDiagnosticUid: "admindiag01",
    reviewBasis: "GSTR-9 furnished 01-12-2026, still earlier than 30-Nov-2027",
    nowMs: 85,
    gstAdjustmentEligibility: "eligible",
    recipientItcReversalEvidenceStatus: "confirmed",
    annualReturnCutoffStatus: "furnished",
    annualReturnFurnishedAt: istWallClockToEpochMs("2026-12-01T00:00:00"),
  });
  assert.equal(furnishedAfterIssue.annualReturnCutoffStatus, "furnished");
  assert.equal(furnishedAfterIssue.gstAdjustmentEligibility, "eligible");
  assert.equal(furnishedAfterIssue.section34OuterLimitAt, istWallClockToEpochMs("2026-12-01T00:00:00"));
}

function cnFixtureEligible(original: SubscriptionInvoiceDoc): SubscriptionCreditNoteDoc {
  return {
    creditNoteId: "cn-unresolved",
    originalInvoiceId: original.invoiceId,
    originalDocumentNumber: original.documentNumber,
    refundFinancialEventId: "refund-unresolved",
    uid: original.uid,
    diagnosticUid: "diag01",
    documentNumber: "CN/2026-27/0009",
    financialYear: "2026-27",
    taxPeriodMonth: "2026-09",
    taxPeriodStatus: "resolved",
    issuedAt: 1,
    issuedOnIst: "12-09-2026",
    nature: "CREDIT NOTE",
    seller: original.seller,
    buyer: original.buyer,
    buyerGstin: original.buyer.gstin,
    buyerClassification: original.buyer.classification,
    originalInvoiceIssuedAt: original.invoiceIssuedAt,
    originalInvoiceIssuedOnIst: original.invoiceIssuedOnIst,
    placeOfSupplyStateCode: original.placeOfSupplyStateCode,
    placeOfSupplyStateName: original.placeOfSupplyStateName,
    gstRateBps: original.gstRateBps,
    taxType: original.taxType,
    taxResponsibilityMode: original.taxResponsibilityMode,
    taxableAmountReversedInPaise: original.taxableAmountInPaise,
    cgstReversedInPaise: original.cgstInPaise,
    sgstReversedInPaise: original.sgstInPaise,
    igstReversedInPaise: original.igstInPaise,
    totalTaxReversedInPaise: original.totalTaxInPaise,
    totalReversedInPaise: original.totalInPaise,
    gstAdjustmentEligibility: "requires_review",
    recipientItcReversalEvidenceStatus: "unconfirmed",
    taxIncidenceConditionStatus: "not_applicable",
    section34OuterLimitAt: istWallClockToEpochMs("2027-11-30T23:59:59"),
    annualReturnCutoffStatus: "unconfirmed",
    annualReturnFurnishedAt: null,
    annualReturnCutoffReviewedAt: null,
    annualReturnCutoffReviewBasis: null,
    taxAdjustmentDisposition: "credit_note_issued",
    gstrReportable: true,
    gstrReportedMonth: null,
    gstrFilingBatchId: null,
    createdAt: 1,
    updatedAt: 1,
  };
}

async function main(): Promise<void> {
  assert.deepEqual(parseGstrMonth("2026-09"), { year: 2026, month: 9 });
  assert.throws(() => parseGstrMonth("2026-00"), isCause("invalid_gstr_month"));
  assert.throws(() => parseGstrMonth("2026-13"), isCause("invalid_gstr_month"));
  assert.throws(
    () => buildGstr1WorkingPapers({ month: "2026-13", invoices: [], creditNotes: [], complianceRecords: [] }),
    isCause("invalid_gstr_month")
  );

  const b2b = invoice({
    invoiceId: B2B_INVOICE_ID,
    financialEventId: B2B_EVENT_ID,
    documentType: "tax_invoice_b2b",
    documentNumber: "SS/2026-27/0001",
  });
  const b2c = invoice({
    invoiceId: B2C_INVOICE_ID,
    financialEventId: B2C_EVENT_ID,
    documentType: "tax_invoice_b2c",
    documentNumber: "SS/2026-27/0002",
    placeOfSupplyStateCode: "09",
    buyer: {
      classification: "b2c",
      legalName: "Test Recipient",
      gstin: null,
      gstinVerificationStatus: "not_provided",
      billingAddress: "1 Test Street, Lucknow, 226001",
      postalCode: "226001",
      stateCode: "09",
      stateName: "Uttar Pradesh",
    },
  });
  const filed = invoice({
    invoiceId: FILED_INVOICE_ID,
    financialEventId: FILED_EVENT_ID,
    documentType: "tax_invoice_b2c",
    gstrReportedMonth: "2026-09",
    gstrReportable: true,
  });
  const apple = invoice({
    invoiceId: APPLE_INVOICE_ID,
    financialEventId: APPLE_EVENT_ID,
    documentType: "compliance_review_required",
    platform: "ios",
    gstrReportable: false,
    taxResponsibilityMode: "unconfirmed",
    documentNumber: null,
    invoiceIssuedAt: null,
    taxPeriodMonth: null,
    taxPeriodStatus: "pending_issue",
    issueStatus: "unissued_draft",
    ecoReporting: unresolvedEco("ios"),
  });
  const reviewB2b = invoice({
    invoiceId: REVIEW_INVOICE_ID,
    financialEventId: REVIEW_EVENT_ID,
    documentType: "tax_invoice_b2b",
    documentNumber: "SS/2026-27/0009",
    ecoReporting: unresolvedEco(),
  });
  const cn: SubscriptionCreditNoteDoc = {
    creditNoteId: CN_ID,
    originalInvoiceId: B2B_INVOICE_ID,
    originalDocumentNumber: "SS/2026-27/0001",
    refundFinancialEventId: CN_REFUND_EVENT_ID,
    uid: "user-1",
    diagnosticUid: "diag01",
    documentNumber: "CN/2026-27/0001",
    financialYear: "2026-27",
    taxPeriodMonth: "2026-09",
    taxPeriodStatus: "resolved",
    issuedAt: 1,
    issuedOnIst: "12-09-2026",
    nature: "CREDIT NOTE",
    seller: {
      legalName: "SPECIAL SOFTWARES LLP (TEST — CERTIFICATE UNCONFIRMED)",
      tradeName: "Vyaamikk Diary",
      gstin: "09AAAAA0000A1Z5",
      registeredAddress: "TEST REGISTERED ADDRESS PLACEHOLDER",
      stateCode: "09",
      stateName: "Uttar Pradesh",
    },
    buyer: {
      classification: "b2b",
      legalName: "Buyer",
      gstin: "27AAAAA0000A1Z5",
      gstinVerificationStatus: "verified",
      billingAddress: "12 MG Road, Mumbai, 400001",
      postalCode: "400001",
      stateCode: "27",
      stateName: "Maharashtra",
    },
    buyerGstin: "27AAAAA0000A1Z5",
    buyerClassification: "b2b",
    originalInvoiceIssuedAt: SEP_SUPPLY,
    originalInvoiceIssuedOnIst: "12-09-2026",
    placeOfSupplyStateCode: "27",
    placeOfSupplyStateName: "Maharashtra",
    gstRateBps: 1800,
    taxType: "igst",
    taxResponsibilityMode: "developer",
    taxableAmountReversedInPaise: 10000,
    cgstReversedInPaise: 0,
    sgstReversedInPaise: 0,
    igstReversedInPaise: 1800,
    totalTaxReversedInPaise: 1800,
    totalReversedInPaise: 11800,
    gstAdjustmentEligibility: "eligible",
    recipientItcReversalEvidenceStatus: "confirmed",
    taxIncidenceConditionStatus: "not_applicable",
    section34OuterLimitAt: istWallClockToEpochMs("2027-11-30T23:59:59"),
    annualReturnCutoffStatus: "not_furnished_as_of_review",
    annualReturnFurnishedAt: null,
    annualReturnCutoffReviewedAt: 1,
    annualReturnCutoffReviewBasis: "fixture",
    taxAdjustmentDisposition: "credit_note_issued",
    gstrReportable: true,
    gstrReportedMonth: null,
    gstrFilingBatchId: null,
    createdAt: 1,
    updatedAt: 1,
  };

  const appleComp = complianceFor(apple);
  const papersWithApple = buildGstr1WorkingPapers({
    month: "2026-09",
    invoices: [b2b, b2c, filed, apple],
    creditNotes: [cn],
    complianceRecords: [
      complianceFor(b2b),
      complianceFor(b2c),
      complianceFor(filed),
      appleComp,
      complianceForCn(cn, b2b),
    ],
  });
  assert.ok(papersWithApple.complianceOpenItems.some((i) => i.invoiceId === APPLE_INVOICE_ID));
  assert.equal(apple.taxPeriodMonth, null);
  assert.equal(papersWithApple.reviewStatus, "requires_tax_review");
  assert.ok(papersWithApple.unresolvedReviewReasons.includes("gstr_tax_review_unresolved"));

  const papers = buildGstr1WorkingPapers({
    month: "2026-09",
    invoices: [b2b, b2c, filed],
    creditNotes: [cn],
    complianceRecords: [
      complianceFor(b2b),
      complianceFor(b2c),
      complianceFor(filed),
      complianceForCn(cn, b2b),
    ],
    financialEvents: eventsFor([b2b, b2c, filed], [cn]),
  });
  assert.equal(papers.b2b.length, 1);
  assert.equal(papers.b2b[0]?.invoiceId, B2B_INVOICE_ID);
  assert.equal(papers.b2b[0]?.recipientGstin, "27AAAAA0000A1Z5");
  assert.equal(papers.b2b[0]?.invoiceDateIst, "12-09-2026");
  assert.equal(papers.b2b[0]?.invoiceValueInclusiveInPaise, 11800);
  assert.equal(papers.b2cSummary.length, 1);
  assert.equal(papers.b2cSummary[0]?.invoiceCount, 1);
  assert.equal(papers.b2cSummary[0]?.taxableValueInPaise, 10000);
  assert.ok(papers.hsnSacSummary.some((r) => r.sacCode === "TESTSAC" && r.totalTaxInPaise === 3600));
  assert.ok(papers.documentSeries.some((s) => s.documentType === "tax_invoice_b2b"));
  assert.equal(papers.creditNotes.length, 1);
  assert.equal(papers.creditNotes[0]?.originalInvoiceId, B2B_INVOICE_ID);
  assert.equal(papers.creditNotes[0]?.recipientGstin, "27AAAAA0000A1Z5");
  assert.equal(papers.creditNotes[0]?.taxableReversalInPaise, 10000);
  assert.equal(papers.excludedAlreadyFiled.includes(FILED_INVOICE_ID), true);
  assert.equal(papers.reportableInvoiceIds.includes(FILED_INVOICE_ID), false);
  assert.equal(papers.table14a.length, 1);
  assert.equal(papers.table14a[0]?.operatorGstin, SYNTHETIC_OPERATOR_GSTIN);
  assert.equal(papers.table14a[0]?.fileReady, true);
  assert.ok(papers.table14a[0]?.sourceInvoiceIds.includes(B2B_INVOICE_ID));
  assert.equal(papers.table14a[0]?.creditNoteIds.includes(CN_ID), true);
  assert.equal(papers.reviewStatus, "ready_to_file");
  assert.deepEqual(papers.unresolvedReviewReasons, []);
  assert.deepEqual(
    papers.sourceFinancialEventIds,
    [B2B_EVENT_ID, B2C_EVENT_ID, FILED_EVENT_ID, CN_REFUND_EVENT_ID].sort()
  );
  assert.equal(papers.taxAdjustments[0]?.taxableValueReductionInPaise, 10000);
  assert.equal(papers.taxAdjustments[0]?.outputTaxReductionInPaise, 1800);
  assert.equal(papers.taxAdjustments[0]?.grossReversalInPaise, 11800);

  const csv = workingPapersToCsv(papers);
  assert.match(csv, /GSTR-1 working papers for manual filing/);
  assert.doesNotMatch(csv, /^section,id,amountInPaise$/m);
  assert.match(csv, /recipientGstin/);
  assert.match(csv, /27AAAAA0000A1Z5/);
  assert.match(csv, /b2c_summary/);
  assert.match(csv, /credit_note/);
  assert.match(csv, /section52_table14a/);
  const injectInv = invoice({
    invoiceId: INJECT_INVOICE_ID,
    financialEventId: INJECT_EVENT_ID,
    documentType: "tax_invoice_b2b",
    documentNumber: "=1+1",
    buyer: {
      classification: "b2b",
      legalName: "=HYPERLINK(1)",
      gstin: "27AAAAA0000A1Z5",
      gstinVerificationStatus: "verified",
      billingAddress: "x",
      postalCode: "400001",
      stateCode: "27",
      stateName: "Maharashtra",
    },
  });
  const injectionPapers = buildGstr1WorkingPapers({
    month: "2026-09",
    invoices: [injectInv],
    creditNotes: [],
    complianceRecords: [complianceFor(injectInv)],
  });
  assert.match(workingPapersToCsv(injectionPapers), /"'=1\+1/);

  const reviewPapers = buildGstr1WorkingPapers({
    month: "2026-09",
    invoices: [reviewB2b],
    creditNotes: [],
    complianceRecords: [complianceFor(reviewB2b)],
  });
  assert.equal(reviewPapers.reviewStatus, "requires_tax_review");
  assert.ok(reviewPapers.unresolvedReviewReasons.includes("gstr_tax_review_unresolved"));

  const table14bInv = invoice({
    invoiceId: TABLE14B_INVOICE_ID,
    financialEventId: TABLE14B_EVENT_ID,
    documentType: "tax_invoice_b2c",
    documentNumber: "SS/2026-27/0014",
    ecoReporting: {
      ...filingEco(),
      ecoReportingCategory: "section9_5_table14b",
    },
  });
  const table14bPapers = buildGstr1WorkingPapers({
    month: "2026-09",
    invoices: [table14bInv],
    creditNotes: [],
    complianceRecords: [complianceFor(table14bInv)],
  });
  assert.equal(table14bPapers.table14b.length, 1);
  assert.equal(table14bPapers.table14b[0]?.category, "section9_5_table14b");
  assert.equal(table14bPapers.table14b[0]?.operatorGstin, SYNTHETIC_OPERATOR_GSTIN);
  assert.equal(table14bPapers.table14b[0]?.fileReady, true);

  const missingGstinInv = invoice({
    invoiceId: MISSING_OP_INVOICE_ID,
    financialEventId: MISSING_OP_EVENT_ID,
    documentType: "tax_invoice_b2c",
    documentNumber: "SS/2026-27/0015",
    ecoReporting: {
      ...filingEco(),
      operatorGstin: null,
    },
  });
  const missingGstinPapers = buildGstr1WorkingPapers({
    month: "2026-09",
    invoices: [missingGstinInv],
    creditNotes: [],
    complianceRecords: [complianceFor(missingGstinInv)],
  });
  assert.equal(missingGstinPapers.table14a[0]?.fileReady, false);
  assert.equal(missingGstinPapers.reviewStatus, "requires_tax_review");

  const admin = { uid: "admin-1", tokenAdmin: true, adminIdentityProvisioned: true };
  const storage = new MemoryInvoiceObjectStorage();
  const store = new MemoryBillingStore();
  seedDocs(store, [b2b, b2c, filed], [cn]);
  const generated = await generateGstr1WorkingPapersCore({
    month: "2026-09",
    admin,
    storage,
    store,
    generatedByDiagnosticUid: "admindiag01",
    nowMs: 5,
  });
  assert.match(generated.jsonPath, /^company\/gstr1-reports\/2026-09\//);
  assert.match(generated.csvPath, /\.csv$/);
  assert.equal(storage.contentTypes.get(generated.jsonPath), "application/json; charset=utf-8");
  assert.equal(storage.contentTypes.get(generated.csvPath), "text/csv; charset=utf-8");
  assert.ok(store.docs.has(gstr1ReportManifestPath(generated.papers.reportId)));
  assert.match(generated.csv, /b2b/);

  await assert.rejects(
    generateGstr1WorkingPapersCore({
      month: "2026-09",
      admin: { ...admin, adminIdentityProvisioned: false },
      storage,
      store,
      generatedByDiagnosticUid: "admindiag01",
      nowMs: 6,
    }),
    isCause("admin_identity_unprovisioned")
  );

  await assert.rejects(
    applyMarkGstr1Filed(store, {
      admin,
      adminDiagnosticUid: "admindiag01",
      reportId: generated.papers.reportId,
      acknowledgement: "   ",
      nowMs: 9,
    }),
    isCause("gstr_acknowledgement_required")
  );

  await assert.rejects(
    applyMarkGstr1Filed(store, {
      admin,
      adminDiagnosticUid: "admindiag01",
      reportId: generated.papers.reportId,
      month: "2026-10",
      acknowledgement: "ACK-1",
      nowMs: 10,
    }),
    isCause("gstr_month_report_mismatch")
  );

  const reviewStore = new MemoryBillingStore();
  seedDocs(reviewStore, [reviewB2b]);
  const reviewGenerated = await generateGstr1WorkingPapersCore({
    month: "2026-09",
    admin,
    storage,
    store: reviewStore,
    generatedByDiagnosticUid: "admindiag01",
    nowMs: 11,
  });
  await assert.rejects(
    applyMarkGstr1Filed(reviewStore, {
      admin,
      adminDiagnosticUid: "admindiag01",
      reportId: reviewGenerated.papers.reportId,
      acknowledgement: "ACK-REVIEW",
      nowMs: 12,
    }),
    isCause("gstr_tax_review_unresolved")
  );

  const appleBlockStore = new MemoryBillingStore();
  seedDocs(appleBlockStore, [b2b, apple]);
  const appleBlocked = await generateGstr1WorkingPapersCore({
    month: "2026-09",
    admin,
    storage,
    store: appleBlockStore,
    generatedByDiagnosticUid: "admindiag01",
    nowMs: 13,
  });
  assert.equal(appleBlocked.papers.reviewStatus, "requires_tax_review");
  assert.ok(appleBlocked.papers.unresolvedReviewReasons.includes("gstr_tax_review_unresolved"));
  await assert.rejects(
    applyMarkGstr1Filed(appleBlockStore, {
      admin,
      adminDiagnosticUid: "admindiag01",
      reportId: appleBlocked.papers.reportId,
      acknowledgement: "ACK-APPLE",
      nowMs: 14,
    }),
    isCause("gstr_tax_review_unresolved")
  );

  const driftStore = new MemoryBillingStore();
  seedDocs(driftStore, [b2b, b2c, filed], [cn]);
  const driftGenerated = await generateGstr1WorkingPapersCore({
    month: "2026-09",
    admin,
    storage,
    store: driftStore,
    generatedByDiagnosticUid: "admindiag01",
    nowMs: 15,
  });
  assert.ok(driftGenerated.papers.sourceInvoiceIds.includes(B2B_INVOICE_ID));
  driftStore.docs.set(`_subscriptionInvoices/${b2b.invoiceId}`, {
    ...b2b,
    taxableAmountInPaise: 1,
    buyer: { ...b2b.buyer, gstin: "24AAAAA0000A1Z5" },
  });
  await assert.rejects(
    applyMarkGstr1Filed(driftStore, {
      admin,
      adminDiagnosticUid: "admindiag01",
      reportId: driftGenerated.papers.reportId,
      acknowledgement: "ACK-DRIFT",
      nowMs: 16,
    }),
    isCause("gstr_report_source_drift")
  );

  const complianceDriftStore = new MemoryBillingStore();
  seedDocs(complianceDriftStore, [b2b, b2c], [cn]);
  const complianceDriftGenerated = await generateGstr1WorkingPapersCore({
    month: "2026-09",
    admin,
    storage,
    store: complianceDriftStore,
    generatedByDiagnosticUid: "admindiag01",
    nowMs: 17,
  });
  await applyReviewTaxCompliance(complianceDriftStore, {
    invoiceId: b2b.invoiceId,
    admin,
    reviewedByDiagnosticUid: "admindiag01",
    reviewBasis: "reclassify after report generation",
    nowMs: 18,
    ecoReportingCategory: "section9_5_table14b",
    operatorGstin: SYNTHETIC_OPERATOR_GSTIN,
  });
  await assert.rejects(
    applyMarkGstr1Filed(complianceDriftStore, {
      admin,
      adminDiagnosticUid: "admindiag01",
      reportId: complianceDriftGenerated.papers.reportId,
      acknowledgement: "ACK-COMP-DRIFT",
      nowMs: 19,
    }),
    isCause("gstr_report_source_drift")
  );

  const batch = await applyMarkGstr1Filed(store, {
    admin,
    adminDiagnosticUid: "admindiag01",
    reportId: generated.papers.reportId,
    acknowledgement: "ACK-1",
    nowMs: 10,
  });
  assert.deepEqual(batch.invoiceIds.sort(), [B2B_INVOICE_ID, B2C_INVOICE_ID].sort());
  assert.equal(batch.creditNoteIds[0], CN_ID);
  assert.equal(batch.month, "2026-09");
  assert.equal(batch.reportHash, generated.papers.contentHash);
  const markedB2b = store.docs.get(`_subscriptionInvoices/${b2b.invoiceId}`) as SubscriptionInvoiceDoc;
  const markedFiled = store.docs.get(`_subscriptionInvoices/${filed.invoiceId}`) as SubscriptionInvoiceDoc;
  assert.equal(markedB2b.gstrReportedMonth, "2026-09");
  assert.equal(markedB2b.gstrFilingBatchId, `gstr1batch_${generated.papers.reportId}`);
  assert.equal(markedFiled.gstrFilingBatchId, null);
  const markedCn = store.docs.get(`_subscriptionCreditNotes/${cn.creditNoteId}`) as SubscriptionCreditNoteDoc;
  assert.equal(markedCn.gstrReportedMonth, "2026-09");

  const replay = await applyMarkGstr1Filed(store, {
    admin,
    adminDiagnosticUid: "admindiag01",
    reportId: generated.papers.reportId,
    acknowledgement: "ACK-1",
    nowMs: 99,
  });
  assert.equal(replay.filedAt, 10);
  assert.equal(replay.filingAcknowledgementReference, "ACK-1");

  await assert.rejects(
    applyMarkGstr1Filed(store, {
      admin,
      adminDiagnosticUid: "admindiag01",
      reportId: generated.papers.reportId,
      acknowledgement: "ACK-OTHER",
      nowMs: 100,
    }),
    isCause("gstr_filing_batch_conflict")
  );

  await testRound4LedgerCompletenessAndDrift(admin, storage);
  await testRound5BidirectionalTaxMathAndCutoff(admin, storage);

  console.log("gst.gstr1.unit.test.ts: ok");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
