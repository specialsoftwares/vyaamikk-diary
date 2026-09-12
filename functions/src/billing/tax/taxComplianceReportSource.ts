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
  SubscriptionCreditNoteDoc,
  SubscriptionInvoiceDoc,
  SubscriptionTaxComplianceDoc,
} from "../types";

import { getMonthKey } from "./financialYearUtils";
import { isInMonthlyComplianceScope } from "./taxCompliance";

export interface TaxComplianceMonthlyScope {
  invoices: SubscriptionInvoiceDoc[];
  creditNotes: SubscriptionCreditNoteDoc[];
  complianceRecords: SubscriptionTaxComplianceDoc[];
}

export interface TaxComplianceReportSource {
  loadMonthlyScope(month: string): Promise<TaxComplianceMonthlyScope>;
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

function assembleScope(input: {
  month: string;
  invoices: SubscriptionInvoiceDoc[];
  creditNotes: SubscriptionCreditNoteDoc[];
  complianceRecords: SubscriptionTaxComplianceDoc[];
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
  };
}

export class MemoryTaxComplianceReportSource implements TaxComplianceReportSource {
  constructor(private readonly store: MemoryBillingStore) {}

  async loadMonthlyScope(month: string): Promise<TaxComplianceMonthlyScope> {
    const invoices: SubscriptionInvoiceDoc[] = [];
    const creditNotes: SubscriptionCreditNoteDoc[] = [];
    const complianceRecords: SubscriptionTaxComplianceDoc[] = [];
    for (const [path, data] of this.store.docs) {
      if (path.startsWith("_subscriptionInvoices/")) {
        invoices.push(data as unknown as SubscriptionInvoiceDoc);
      } else if (path.startsWith("_subscriptionCreditNotes/")) {
        creditNotes.push(data as unknown as SubscriptionCreditNoteDoc);
      } else if (path.startsWith("_subscriptionTaxCompliance/")) {
        complianceRecords.push(data as unknown as SubscriptionTaxComplianceDoc);
      }
    }
    return assembleScope({ month, invoices, creditNotes, complianceRecords });
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
    const [invSnap, cnSnap, compSnap] = await Promise.all([
      this.db.collection("_subscriptionInvoices").get(),
      this.db.collection("_subscriptionCreditNotes").get(),
      this.db.collection("_subscriptionTaxCompliance").get(),
    ]);
    const invoices = invSnap.docs.map((d) => d.data() as SubscriptionInvoiceDoc);
    const creditNotes = cnSnap.docs.map((d) => d.data() as SubscriptionCreditNoteDoc);
    const complianceRecords = compSnap.docs.map((d) => d.data() as SubscriptionTaxComplianceDoc);
    return assembleScope({ month, invoices, creditNotes, complianceRecords });
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
