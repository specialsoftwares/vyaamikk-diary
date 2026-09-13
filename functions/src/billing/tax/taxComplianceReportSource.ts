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

import type { Firestore } from "firebase-admin/firestore";

import { BillingError } from "../errors";
import { MemoryBillingStore, type BillingStore } from "../store";
import type {
  BillingEventLedgerDoc,
  SubscriptionCreditNoteDoc,
  SubscriptionInvoiceDoc,
  SubscriptionTaxComplianceDoc,
} from "../types";

import { creditNoteIdForRefundEvent } from "./creditNote";
import { getMonthKey } from "./financialYearUtils";
import { invoiceGstAdjustmentDefaults } from "./gstAdjustment";
import { invoiceIdForFinancialEvent } from "./invoiceAllocation";
import { isInMonthlyComplianceScope } from "./taxCompliance";

export interface TaxComplianceMonthlyScope {
  invoices: SubscriptionInvoiceDoc[];
  creditNotes: SubscriptionCreditNoteDoc[];
  complianceRecords: SubscriptionTaxComplianceDoc[];
  financialEvents: BillingEventLedgerDoc[];
}

export interface TaxComplianceReportSource {
  loadMonthlyScope(month: string): Promise<TaxComplianceMonthlyScope>;
}

export function financialEventTaxBind(event: BillingEventLedgerDoc) {
  return {
    financialEventId: event.financialEventId,
    eventType: event.eventType,
    uid: event.uid,
    platform: event.platform,
    canonicalSku: event.canonicalSku,
    grossAmountInPaise: event.grossAmountInPaise,
    currency: event.currency,
    occurredAt: event.occurredAt,
    relatedFinancialEventId: event.relatedFinancialEventId,
    recordedBy: event.recordedBy,
    monthKey: event.monthKey,
  };
}

function uniqueById<T extends { invoiceId?: string; creditNoteId?: string }>(
  rows: T[],
  idOf: (row: T) => string
): T[] {
  const map = new Map<string, T>();
  for (const row of rows) map.set(idOf(row), row);
  return [...map.values()];
}

function syntheticInvoiceCompliance(
  invoice: SubscriptionInvoiceDoc,
  month: string
): SubscriptionTaxComplianceDoc | null {
  const supplyMonthKey = invoice.supplyOccurredAt ? getMonthKey(invoice.supplyOccurredAt) : null;
  const issueMonthKey = invoice.invoiceIssuedAt ? getMonthKey(invoice.invoiceIssuedAt) : null;
  if (
    supplyMonthKey !== month &&
    issueMonthKey !== month &&
    invoice.taxPeriodMonth !== month
  ) {
    return null;
  }
  return {
    invoiceId: invoice.invoiceId,
    documentKind: "invoice",
    financialEventId: invoice.financialEventId,
    originalInvoiceId: null,
    uid: invoice.uid,
    supplyMonthKey: supplyMonthKey ?? month,
    issueMonthKey,
    reportingTaxPeriodMonth: invoice.taxPeriodMonth,
    taxPeriodDecisionStatus: "requires_tax_review",
    ecoReportingCategory: invoice.ecoReporting.ecoReportingCategory,
    operatorIdentifier: invoice.ecoReporting.operatorIdentifier,
    operatorGstin: invoice.ecoReporting.operatorGstin,
    reviewStatus: "requires_tax_review",
    unresolvedReasons: ["compliance_record_missing"],
    cumulativeCreditReversedInPaise: 0,
    ...invoiceGstAdjustmentDefaults(),
    reviewedAt: null,
    reviewedByDiagnosticUid: null,
    reviewBasis: null,
    reviewVersion: 0,
    previousEcoReportingCategory: null,
    previousReportingTaxPeriodMonth: null,
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
  };
}

function syntheticCreditNoteCompliance(
  note: SubscriptionCreditNoteDoc,
  month: string
): SubscriptionTaxComplianceDoc | null {
  const issueMonthKey = note.issuedAt ? getMonthKey(note.issuedAt) : null;
  if (issueMonthKey !== month && note.taxPeriodMonth !== month) return null;
  return {
    invoiceId: note.creditNoteId,
    documentKind: "credit_note",
    financialEventId: note.refundFinancialEventId,
    originalInvoiceId: note.originalInvoiceId,
    uid: note.uid,
    supplyMonthKey: issueMonthKey ?? month,
    issueMonthKey,
    reportingTaxPeriodMonth: note.taxPeriodMonth,
    taxPeriodDecisionStatus: "requires_tax_review",
    ecoReportingCategory: "requires_tax_review",
    operatorIdentifier: null,
    operatorGstin: null,
    reviewStatus: "requires_tax_review",
    unresolvedReasons: ["compliance_record_missing"],
    cumulativeCreditReversedInPaise: 0,
    ...invoiceGstAdjustmentDefaults(),
    reviewedAt: null,
    reviewedByDiagnosticUid: null,
    reviewBasis: null,
    reviewVersion: 0,
    previousEcoReportingCategory: null,
    previousReportingTaxPeriodMonth: null,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

function syntheticMissingInvoiceFromLedger(
  event: BillingEventLedgerDoc,
  month: string
): SubscriptionTaxComplianceDoc {
  const invoiceId = invoiceIdForFinancialEvent(event.financialEventId);
  return {
    invoiceId,
    documentKind: "invoice",
    financialEventId: event.financialEventId,
    originalInvoiceId: null,
    uid: event.uid,
    supplyMonthKey: event.monthKey || month,
    issueMonthKey: null,
    reportingTaxPeriodMonth: null,
    taxPeriodDecisionStatus: "requires_tax_review",
    ecoReportingCategory: "requires_tax_review",
    operatorIdentifier: null,
    operatorGstin: null,
    reviewStatus: "requires_tax_review",
    unresolvedReasons: ["financial_event_tax_document_missing"],
    cumulativeCreditReversedInPaise: 0,
    ...invoiceGstAdjustmentDefaults(),
    reviewedAt: null,
    reviewedByDiagnosticUid: null,
    reviewBasis: null,
    reviewVersion: 0,
    previousEcoReportingCategory: null,
    previousReportingTaxPeriodMonth: null,
    createdAt: event.recordedAt,
    updatedAt: event.recordedAt,
  };
}

function syntheticMissingTaxAdjustmentFromLedger(
  event: BillingEventLedgerDoc,
  month: string
): SubscriptionTaxComplianceDoc {
  const creditNoteId = creditNoteIdForRefundEvent(event.financialEventId);
  const reasons =
    event.eventType === "chargeback"
      ? ["gst_adjustment_requires_review", "tax_adjustment_disposition_missing"]
      : ["tax_adjustment_disposition_missing", "gst_credit_note_missing", "gst_adjustment_requires_review"];
  return {
    invoiceId: creditNoteId,
    documentKind: "credit_note",
    financialEventId: event.financialEventId,
    originalInvoiceId: event.relatedFinancialEventId
      ? invoiceIdForFinancialEvent(event.relatedFinancialEventId)
      : null,
    uid: event.uid,
    supplyMonthKey: event.monthKey || month,
    issueMonthKey: null,
    reportingTaxPeriodMonth: null,
    taxPeriodDecisionStatus: "requires_tax_review",
    ecoReportingCategory: "requires_tax_review",
    operatorIdentifier: null,
    operatorGstin: null,
    reviewStatus: "requires_tax_review",
    unresolvedReasons: reasons.sort(),
    cumulativeCreditReversedInPaise: 0,
    gstAdjustmentEligibility: "requires_review",
    recipientItcReversalEvidenceStatus: "unconfirmed",
    taxIncidenceConditionStatus: "unconfirmed",
    section34OuterLimitAt: null,
    taxAdjustmentDisposition: event.eventType === "chargeback" ? "requires_review" : "pending",
    reviewedAt: null,
    reviewedByDiagnosticUid: null,
    reviewBasis: null,
    reviewVersion: 0,
    previousEcoReportingCategory: null,
    previousReportingTaxPeriodMonth: null,
    createdAt: event.recordedAt,
    updatedAt: event.recordedAt,
  };
}

function reconcileLedgerEvents(input: {
  month: string;
  invoiceById: Map<string, SubscriptionInvoiceDoc>;
  creditNoteById: Map<string, SubscriptionCreditNoteDoc>;
  complianceById: Map<string, SubscriptionTaxComplianceDoc>;
  inScope: SubscriptionTaxComplianceDoc[];
  financialEvents: BillingEventLedgerDoc[];
}): BillingEventLedgerDoc[] {
  const inMonth = input.financialEvents
    .filter((event) => event.monthKey === input.month)
    .sort((a, b) => a.financialEventId.localeCompare(b.financialEventId));
  for (const event of inMonth) {
    if (event.eventType === "purchase" || event.eventType === "renewal") {
      const invoiceId = invoiceIdForFinancialEvent(event.financialEventId);
      const invoice = input.invoiceById.get(invoiceId);
      const compliance = input.complianceById.get(invoiceId);
      if (!invoice || !compliance) {
        if (input.complianceById.has(invoiceId)) continue;
        const synthetic = syntheticMissingInvoiceFromLedger(event, input.month);
        input.inScope.push(synthetic);
        input.complianceById.set(synthetic.invoiceId, synthetic);
      }
    } else if (event.eventType === "refund" || event.eventType === "chargeback") {
      const creditNoteId = creditNoteIdForRefundEvent(event.financialEventId);
      const note = input.creditNoteById.get(creditNoteId);
      const compliance = input.complianceById.get(creditNoteId);
      if (note && compliance) continue;
      if (input.complianceById.has(creditNoteId) && note) continue;
      if (compliance && !compliance.unresolvedReasons.includes("tax_adjustment_disposition_missing")) {
        continue;
      }
      if (!input.complianceById.has(creditNoteId)) {
        const synthetic = syntheticMissingTaxAdjustmentFromLedger(event, input.month);
        input.inScope.push(synthetic);
        input.complianceById.set(synthetic.invoiceId, synthetic);
      }
    }
  }
  return inMonth;
}

function assembleScope(input: {
  month: string;
  invoices: SubscriptionInvoiceDoc[];
  creditNotes: SubscriptionCreditNoteDoc[];
  complianceRecords: SubscriptionTaxComplianceDoc[];
  financialEvents: BillingEventLedgerDoc[];
}): TaxComplianceMonthlyScope {
  const invoiceById = new Map(input.invoices.map((i) => [i.invoiceId, i]));
  const creditNoteById = new Map(input.creditNotes.map((c) => [c.creditNoteId, c]));
  const complianceById = new Map(input.complianceRecords.map((c) => [c.invoiceId, c]));

  const inScope = input.complianceRecords.filter((c) =>
    isInMonthlyComplianceScope(c, input.month)
  );
  for (const invoice of input.invoices) {
    if (complianceById.has(invoice.invoiceId)) continue;
    const synthetic = syntheticInvoiceCompliance(invoice, input.month);
    if (synthetic) {
      inScope.push(synthetic);
      complianceById.set(synthetic.invoiceId, synthetic);
    }
  }
  for (const note of input.creditNotes) {
    if (complianceById.has(note.creditNoteId)) continue;
    const synthetic = syntheticCreditNoteCompliance(note, input.month);
    if (synthetic) {
      inScope.push(synthetic);
      complianceById.set(synthetic.invoiceId, synthetic);
    }
  }

  const scopedInvoices: SubscriptionInvoiceDoc[] = [];
  const scopedCreditNotes: SubscriptionCreditNoteDoc[] = [];
  for (const rec of inScope) {
    if (rec.documentKind === "credit_note") {
      const note = creditNoteById.get(rec.invoiceId);
      if (note) scopedCreditNotes.push(note);
    } else {
      const inv = invoiceById.get(rec.invoiceId);
      if (inv) scopedInvoices.push(inv);
    }
  }

  for (const note of scopedCreditNotes) {
    const original = invoiceById.get(note.originalInvoiceId);
    if (original && !scopedInvoices.some((i) => i.invoiceId === original.invoiceId)) {
      scopedInvoices.push(original);
    }
    const originalCompliance = complianceById.get(note.originalInvoiceId);
    if (originalCompliance && !inScope.some((c) => c.invoiceId === originalCompliance.invoiceId)) {
      inScope.push(originalCompliance);
    }
  }

  const scopedFinancialEvents = reconcileLedgerEvents({
    month: input.month,
    invoiceById,
    creditNoteById,
    complianceById,
    inScope,
    financialEvents: input.financialEvents,
  });

  return {
    invoices: uniqueById(scopedInvoices, (i) => i.invoiceId).sort((a, b) =>
      a.invoiceId.localeCompare(b.invoiceId)
    ),
    creditNotes: uniqueById(scopedCreditNotes, (c) => c.creditNoteId).sort((a, b) =>
      a.creditNoteId.localeCompare(b.creditNoteId)
    ),
    complianceRecords: uniqueById(inScope, (c) => c.invoiceId).sort((a, b) =>
      a.invoiceId.localeCompare(b.invoiceId)
    ),
    financialEvents: uniqueById(
      scopedFinancialEvents as Array<BillingEventLedgerDoc & { invoiceId?: string }>,
      (e) => e.financialEventId
    ).sort((a, b) => a.financialEventId.localeCompare(b.financialEventId)),
  };
}

export class MemoryTaxComplianceReportSource implements TaxComplianceReportSource {
  constructor(private readonly store: MemoryBillingStore) {}

  async loadMonthlyScope(month: string): Promise<TaxComplianceMonthlyScope> {
    const invoices: SubscriptionInvoiceDoc[] = [];
    const creditNotes: SubscriptionCreditNoteDoc[] = [];
    const complianceRecords: SubscriptionTaxComplianceDoc[] = [];
    const financialEvents: BillingEventLedgerDoc[] = [];
    for (const [path, data] of this.store.docs) {
      if (path.startsWith("_subscriptionInvoices/")) {
        invoices.push(data as unknown as SubscriptionInvoiceDoc);
      } else if (path.startsWith("_subscriptionCreditNotes/")) {
        creditNotes.push(data as unknown as SubscriptionCreditNoteDoc);
      } else if (path.startsWith("_subscriptionTaxCompliance/")) {
        complianceRecords.push(data as unknown as SubscriptionTaxComplianceDoc);
      } else if (path.startsWith("_billingEventLedger/")) {
        financialEvents.push(data as unknown as BillingEventLedgerDoc);
      }
    }
    return assembleScope({ month, invoices, creditNotes, complianceRecords, financialEvents });
  }
}

/**
 * Admin SDK collection scan. Correctness over query optimization for the
 * initial ~50-subscriber manual workflow. Does not filter solely by
 * taxPeriodMonth.
 */
export class AdminFirestoreTaxComplianceReportSource implements TaxComplianceReportSource {
  constructor(private readonly db: Firestore) {}

  async loadMonthlyScope(month: string): Promise<TaxComplianceMonthlyScope> {
    const [invSnap, cnSnap, compSnap, ledgerSnap] = await Promise.all([
      this.db.collection("_subscriptionInvoices").get(),
      this.db.collection("_subscriptionCreditNotes").get(),
      this.db.collection("_subscriptionTaxCompliance").get(),
      this.db.collection("_billingEventLedger").get(),
    ]);
    const invoices = invSnap.docs.map((d) => d.data() as SubscriptionInvoiceDoc);
    const creditNotes = cnSnap.docs.map((d) => d.data() as SubscriptionCreditNoteDoc);
    const complianceRecords = compSnap.docs.map((d) => d.data() as SubscriptionTaxComplianceDoc);
    const financialEvents = ledgerSnap.docs.map((d) => d.data() as BillingEventLedgerDoc);
    return assembleScope({ month, invoices, creditNotes, complianceRecords, financialEvents });
  }
}

export function reportSourceFromBillingStore(store: BillingStore): TaxComplianceReportSource {
  if (store instanceof MemoryBillingStore) {
    return new MemoryTaxComplianceReportSource(store);
  }
  throw new BillingError({
    clientCode: "internal_error",
    causeCode: "gstr_store_scan_unsupported",
  });
}
