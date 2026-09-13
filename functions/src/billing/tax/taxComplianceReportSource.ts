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
import { creditNoteGstAdjustmentUnconfirmedDefaults, invoiceGstAdjustmentDefaults } from "./gstAdjustment";
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
    ...creditNoteGstAdjustmentUnconfirmedDefaults(),
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
    annualReturnCutoffStatus: "unconfirmed",
    annualReturnFurnishedAt: null,
    annualReturnCutoffReviewedAt: null,
    annualReturnCutoffReviewBasis: null,
    annualReturnCutoffConfirmedThrough: null,
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

export const LEDGER_RECONCILIATION_REASONS = [
  "financial_event_tax_document_missing",
  "financial_event_invoice_mismatch",
  "financial_event_compliance_mismatch",
  "financial_event_month_scope_mismatch",
  "tax_document_financial_event_missing",
  "tax_document_related_financial_event_missing",
  "tax_document_related_financial_event_mismatch",
  "tax_adjustment_disposition_missing",
  "gst_credit_note_missing",
] as const;

export function isLedgerReconciliationReason(reason: string): boolean {
  return (LEDGER_RECONCILIATION_REASONS as readonly string[]).includes(reason);
}

function mergeReasons(existing: string[], extra: string[]): string[] {
  return [...new Set([...existing, ...extra])].sort();
}

function originalSupplyEventType(eventType: BillingEventLedgerDoc["eventType"]): boolean {
  return eventType === "purchase" || eventType === "renewal";
}

function refundLikeEventType(eventType: BillingEventLedgerDoc["eventType"]): boolean {
  return eventType === "refund" || eventType === "chargeback";
}

function invoiceMatchesLedger(
  invoice: SubscriptionInvoiceDoc,
  event: BillingEventLedgerDoc
): boolean {
  return (
    invoice.financialEventId === event.financialEventId &&
    invoice.uid === event.uid &&
    invoice.platform === event.platform &&
    invoice.canonicalSku === event.canonicalSku &&
    invoice.invoiceId === invoiceIdForFinancialEvent(event.financialEventId)
  );
}

function complianceMatchesLedger(
  rec: SubscriptionTaxComplianceDoc,
  event: BillingEventLedgerDoc
): boolean {
  return rec.financialEventId === event.financialEventId && rec.uid === event.uid;
}

interface ReconciliationGap {
  invoiceId: string;
  documentKind: "invoice" | "credit_note";
  financialEventId: string;
  uid: string;
  reasons: string[];
  event: BillingEventLedgerDoc | null;
}

function addGap(
  gaps: Map<string, ReconciliationGap>,
  partial: Omit<ReconciliationGap, "reasons"> & { reasons: string[] }
): void {
  const existing = gaps.get(partial.invoiceId);
  if (!existing) {
    gaps.set(partial.invoiceId, {
      ...partial,
      reasons: mergeReasons([], partial.reasons),
    });
    return;
  }
  existing.reasons = mergeReasons(existing.reasons, partial.reasons);
  if (!existing.event && partial.event) existing.event = partial.event;
}

export function detectLedgerReconciliationGaps(input: {
  month: string;
  invoices: SubscriptionInvoiceDoc[];
  creditNotes: SubscriptionCreditNoteDoc[];
  complianceRecords: SubscriptionTaxComplianceDoc[];
  financialEvents: BillingEventLedgerDoc[];
}): ReconciliationGap[] {
  const invoiceById = new Map(input.invoices.map((i) => [i.invoiceId, i]));
  const creditNoteById = new Map(input.creditNotes.map((c) => [c.creditNoteId, c]));
  const complianceById = new Map(input.complianceRecords.map((c) => [c.invoiceId, c]));
  const ledgerById = new Map(input.financialEvents.map((e) => [e.financialEventId, e]));
  const inMonth = input.financialEvents.filter((event) => event.monthKey === input.month);
  const gaps = new Map<string, ReconciliationGap>();

  for (const event of inMonth) {
    if (originalSupplyEventType(event.eventType)) {
      const invoiceId = invoiceIdForFinancialEvent(event.financialEventId);
      const invoice = invoiceById.get(invoiceId);
      const compliance = complianceById.get(invoiceId);
      const reasons: string[] = [];
      if (!invoice && !compliance) {
        reasons.push("financial_event_tax_document_missing");
      } else {
        if (!invoice) {
          reasons.push("financial_event_tax_document_missing", "financial_event_invoice_mismatch");
        } else if (!invoiceMatchesLedger(invoice, event)) {
          reasons.push("financial_event_invoice_mismatch");
        }
        if (!compliance) {
          reasons.push("financial_event_compliance_mismatch");
        } else {
          if (!complianceMatchesLedger(compliance, event)) {
            reasons.push("financial_event_compliance_mismatch");
          }
          if (!isInMonthlyComplianceScope(compliance, input.month)) {
            reasons.push("financial_event_month_scope_mismatch");
          }
        }
      }
      if (reasons.length > 0) {
        addGap(gaps, {
          invoiceId,
          documentKind: "invoice",
          financialEventId: event.financialEventId,
          uid: event.uid,
          reasons,
          event,
        });
      }
    } else if (refundLikeEventType(event.eventType)) {
      const creditNoteId = creditNoteIdForRefundEvent(event.financialEventId);
      const note = creditNoteById.get(creditNoteId);
      const compliance = complianceById.get(creditNoteId);
      const reasons: string[] = [];
      if (event.eventType === "refund") {
        if (!note && !compliance) {
          reasons.push(
            "tax_adjustment_disposition_missing",
            "gst_credit_note_missing",
            "gst_adjustment_requires_review"
          );
        } else {
          if (!note) {
            reasons.push("gst_credit_note_missing", "financial_event_tax_document_missing");
          }
          if (!compliance) reasons.push("financial_event_compliance_mismatch");
        }
      } else if (!compliance) {
        reasons.push("gst_adjustment_requires_review", "tax_adjustment_disposition_missing");
      }
      if (note) {
        if (note.refundFinancialEventId !== event.financialEventId || note.uid !== event.uid) {
          reasons.push("financial_event_invoice_mismatch");
        }
      }
      if (compliance) {
        if (!complianceMatchesLedger(compliance, event)) {
          reasons.push("financial_event_compliance_mismatch");
        }
        if (!isInMonthlyComplianceScope(compliance, input.month)) {
          reasons.push("financial_event_month_scope_mismatch");
        }
        if (
          compliance.taxAdjustmentDisposition === "pending" ||
          (event.eventType === "chargeback" && compliance.taxAdjustmentDisposition === "not_applicable")
        ) {
          reasons.push("tax_adjustment_disposition_missing");
        }
      }
      const relatedId = event.relatedFinancialEventId;
      const original = relatedId ? ledgerById.get(relatedId) : undefined;
      if (!relatedId || !original) {
        reasons.push("tax_document_related_financial_event_missing");
      } else if (!originalSupplyEventType(original.eventType)) {
        reasons.push("tax_document_related_financial_event_mismatch");
      } else if (note && note.originalInvoiceId !== invoiceIdForFinancialEvent(original.financialEventId)) {
        reasons.push("tax_document_related_financial_event_mismatch");
      }
      if (reasons.length > 0) {
        addGap(gaps, {
          invoiceId: creditNoteId,
          documentKind: "credit_note",
          financialEventId: event.financialEventId,
          uid: event.uid,
          reasons,
          event,
        });
      }
    }
  }

  for (const invoice of input.invoices) {
    const supplyMonthKey = invoice.supplyOccurredAt ? getMonthKey(invoice.supplyOccurredAt) : null;
    const issueMonthKey = invoice.invoiceIssuedAt ? getMonthKey(invoice.invoiceIssuedAt) : null;
    const compliance = complianceById.get(invoice.invoiceId);
    const inDocMonth =
      supplyMonthKey === input.month ||
      issueMonthKey === input.month ||
      invoice.taxPeriodMonth === input.month ||
      Boolean(compliance && isInMonthlyComplianceScope(compliance, input.month));
    if (!inDocMonth) continue;
    const event = ledgerById.get(invoice.financialEventId);
    const reasons: string[] = [];
    if (!event) {
      reasons.push("tax_document_financial_event_missing");
    } else {
      if (!invoiceMatchesLedger(invoice, event)) reasons.push("financial_event_invoice_mismatch");
      if (compliance && !complianceMatchesLedger(compliance, event)) {
        reasons.push("financial_event_compliance_mismatch");
      }
    }
    if (reasons.length > 0) {
      addGap(gaps, {
        invoiceId: invoice.invoiceId,
        documentKind: "invoice",
        financialEventId: invoice.financialEventId,
        uid: invoice.uid,
        reasons,
        event: event ?? null,
      });
    }
  }

  for (const note of input.creditNotes) {
    const issueMonthKey = note.issuedAt ? getMonthKey(note.issuedAt) : null;
    const compliance = complianceById.get(note.creditNoteId);
    const inDocMonth =
      issueMonthKey === input.month ||
      note.taxPeriodMonth === input.month ||
      Boolean(compliance && isInMonthlyComplianceScope(compliance, input.month));
    if (!inDocMonth) continue;
    const refund = ledgerById.get(note.refundFinancialEventId);
    const reasons: string[] = [];
    if (!refund) {
      reasons.push("tax_document_financial_event_missing");
    } else {
      if (!refundLikeEventType(refund.eventType) || refund.uid !== note.uid) {
        reasons.push("financial_event_invoice_mismatch");
      }
      const original = refund.relatedFinancialEventId
        ? ledgerById.get(refund.relatedFinancialEventId)
        : undefined;
      if (!original) {
        reasons.push("tax_document_related_financial_event_missing");
      } else if (!originalSupplyEventType(original.eventType)) {
        reasons.push("tax_document_related_financial_event_mismatch");
      } else if (note.originalInvoiceId !== invoiceIdForFinancialEvent(original.financialEventId)) {
        reasons.push("tax_document_related_financial_event_mismatch");
      }
    }
    if (reasons.length > 0) {
      addGap(gaps, {
        invoiceId: note.creditNoteId,
        documentKind: "credit_note",
        financialEventId: note.refundFinancialEventId,
        uid: note.uid,
        reasons,
        event: refund ?? null,
      });
    }
  }

  for (const rec of input.complianceRecords) {
    if (!isInMonthlyComplianceScope(rec, input.month) && !gaps.has(rec.invoiceId)) continue;
    const event = ledgerById.get(rec.financialEventId);
    const reasons: string[] = [];
    if (!event) {
      reasons.push("tax_document_financial_event_missing");
    } else {
      if (!complianceMatchesLedger(rec, event)) reasons.push("financial_event_compliance_mismatch");
      if (rec.documentKind === "invoice" && !originalSupplyEventType(event.eventType)) {
        reasons.push("financial_event_compliance_mismatch");
      }
      if (rec.documentKind === "credit_note" && !refundLikeEventType(event.eventType)) {
        reasons.push("financial_event_compliance_mismatch");
      }
    }
    if (reasons.length > 0) {
      addGap(gaps, {
        invoiceId: rec.invoiceId,
        documentKind: rec.documentKind,
        financialEventId: rec.financialEventId,
        uid: rec.uid,
        reasons,
        event: event ?? null,
      });
    }
  }

  return [...gaps.values()];
}

function upsertComplianceBlocker(
  input: {
    inScope: SubscriptionTaxComplianceDoc[];
    complianceById: Map<string, SubscriptionTaxComplianceDoc>;
  },
  next: SubscriptionTaxComplianceDoc
): void {
  const unresolvedReasons = [...next.unresolvedReasons].sort();
  const stamped: SubscriptionTaxComplianceDoc = {
    ...next,
    unresolvedReasons,
    reviewStatus: unresolvedReasons.length > 0 ? "requires_tax_review" : next.reviewStatus,
  };
  input.complianceById.set(stamped.invoiceId, stamped);
  const idx = input.inScope.findIndex((row) => row.invoiceId === stamped.invoiceId);
  if (idx >= 0) input.inScope[idx] = stamped;
  else input.inScope.push(stamped);
}

function syntheticForGap(
  gap: ReconciliationGap,
  month: string,
  invoiceById: Map<string, SubscriptionInvoiceDoc>,
  creditNoteById: Map<string, SubscriptionCreditNoteDoc>
): SubscriptionTaxComplianceDoc {
  if (gap.event && gap.documentKind === "invoice") {
    return { ...syntheticMissingInvoiceFromLedger(gap.event, month), unresolvedReasons: gap.reasons };
  }
  if (gap.event && gap.documentKind === "credit_note") {
    const synthetic = syntheticMissingTaxAdjustmentFromLedger(gap.event, month);
    return { ...synthetic, unresolvedReasons: mergeReasons(synthetic.unresolvedReasons, gap.reasons) };
  }
  const invoice = invoiceById.get(gap.invoiceId);
  if (invoice) {
    const synthetic = syntheticInvoiceCompliance(invoice, month);
    if (synthetic) {
      return { ...synthetic, unresolvedReasons: mergeReasons(synthetic.unresolvedReasons, gap.reasons) };
    }
  }
  const note = creditNoteById.get(gap.invoiceId);
  if (note) {
    const synthetic = syntheticCreditNoteCompliance(note, month);
    if (synthetic) {
      return { ...synthetic, unresolvedReasons: mergeReasons(synthetic.unresolvedReasons, gap.reasons) };
    }
  }
  return {
    invoiceId: gap.invoiceId,
    documentKind: gap.documentKind,
    financialEventId: gap.financialEventId,
    originalInvoiceId: null,
    uid: gap.uid,
    supplyMonthKey: month,
    issueMonthKey: null,
    reportingTaxPeriodMonth: null,
    taxPeriodDecisionStatus: "requires_tax_review",
    ecoReportingCategory: "requires_tax_review",
    operatorIdentifier: null,
    operatorGstin: null,
    reviewStatus: "requires_tax_review",
    unresolvedReasons: gap.reasons,
    cumulativeCreditReversedInPaise: 0,
    ...(gap.documentKind === "credit_note"
      ? creditNoteGstAdjustmentUnconfirmedDefaults()
      : invoiceGstAdjustmentDefaults()),
    reviewedAt: null,
    reviewedByDiagnosticUid: null,
    reviewBasis: null,
    reviewVersion: 0,
    previousEcoReportingCategory: null,
    previousReportingTaxPeriodMonth: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

function applyLedgerReconciliation(input: {
  month: string;
  invoices: SubscriptionInvoiceDoc[];
  creditNotes: SubscriptionCreditNoteDoc[];
  originalComplianceRecords: SubscriptionTaxComplianceDoc[];
  invoiceById: Map<string, SubscriptionInvoiceDoc>;
  creditNoteById: Map<string, SubscriptionCreditNoteDoc>;
  complianceById: Map<string, SubscriptionTaxComplianceDoc>;
  inScope: SubscriptionTaxComplianceDoc[];
  financialEvents: BillingEventLedgerDoc[];
}): void {
  const gaps = detectLedgerReconciliationGaps({
    month: input.month,
    invoices: input.invoices,
    creditNotes: input.creditNotes,
    complianceRecords: input.originalComplianceRecords,
    financialEvents: input.financialEvents,
  });
  for (const gap of gaps) {
    const existing = input.complianceById.get(gap.invoiceId);
    const base =
      existing ??
      syntheticForGap(gap, input.month, input.invoiceById, input.creditNoteById);
    upsertComplianceBlocker(input, {
      ...base,
      unresolvedReasons: mergeReasons(base.unresolvedReasons, gap.reasons),
    });
  }
}

/**
 * Monthly population (A) plus document-authority dependency closure (B–D).
 * Deduplicated by financialEventId. Unrelated prior-month ledger rows are
 * not pulled in merely because they share a calendar month with a dependency.
 */
export function collectSourceDependencyFinancialEvents(input: {
  month: string;
  invoices: SubscriptionInvoiceDoc[];
  creditNotes: SubscriptionCreditNoteDoc[];
  complianceRecords: SubscriptionTaxComplianceDoc[];
  financialEvents: BillingEventLedgerDoc[];
}): BillingEventLedgerDoc[] {
  const byId = new Map(input.financialEvents.map((e) => [e.financialEventId, e]));
  const ids = new Set<string>();

  for (const event of input.financialEvents) {
    if (event.monthKey === input.month) ids.add(event.financialEventId);
  }
  for (const invoice of input.invoices) {
    ids.add(invoice.financialEventId);
  }
  for (const note of input.creditNotes) {
    ids.add(note.refundFinancialEventId);
    const refund = byId.get(note.refundFinancialEventId);
    if (refund?.relatedFinancialEventId) ids.add(refund.relatedFinancialEventId);
  }
  for (const rec of input.complianceRecords) {
    ids.add(rec.financialEventId);
    if (rec.documentKind === "credit_note" && rec.originalInvoiceId) {
      const originalInvoice = input.invoices.find((i) => i.invoiceId === rec.originalInvoiceId);
      if (originalInvoice) ids.add(originalInvoice.financialEventId);
    }
  }

  return [...ids]
    .map((id) => byId.get(id))
    .filter((event): event is BillingEventLedgerDoc => Boolean(event))
    .sort((a, b) => a.financialEventId.localeCompare(b.financialEventId));
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

  applyLedgerReconciliation({
    month: input.month,
    invoices: input.invoices,
    creditNotes: input.creditNotes,
    originalComplianceRecords: input.complianceRecords,
    invoiceById,
    creditNoteById,
    complianceById,
    inScope,
    financialEvents: input.financialEvents,
  });

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

  const invoices = uniqueById(scopedInvoices, (i) => i.invoiceId).sort((a, b) =>
    a.invoiceId.localeCompare(b.invoiceId)
  );
  const creditNotes = uniqueById(scopedCreditNotes, (c) => c.creditNoteId).sort((a, b) =>
    a.creditNoteId.localeCompare(b.creditNoteId)
  );
  const complianceRecords = uniqueById(inScope, (c) => c.invoiceId).sort((a, b) =>
    a.invoiceId.localeCompare(b.invoiceId)
  );
  const financialEvents = collectSourceDependencyFinancialEvents({
    month: input.month,
    invoices,
    creditNotes,
    complianceRecords,
    financialEvents: input.financialEvents,
  });

  return {
    invoices,
    creditNotes,
    complianceRecords,
    financialEvents,
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
