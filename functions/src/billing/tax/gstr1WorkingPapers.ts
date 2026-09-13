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

import { createHash } from "node:crypto";

import { BillingError } from "../errors";
import {
  gstr1FilingBatchPath,
  gstr1ReportManifestPath,
  financialLedgerPath,
  subscriptionCreditNotePath,
  subscriptionInvoicePath,
  subscriptionTaxCompliancePath,
} from "../paths";
import type { BillingStore } from "../store";
import type {
  BillingEventLedgerDoc,
  Gstr1FilingBatchDoc,
  Gstr1ReportManifestDoc,
  Gstr1ReviewStatus,
  SubscriptionCreditNoteDoc,
  SubscriptionInvoiceDoc,
  SubscriptionTaxComplianceDoc,
} from "../types";

import { formatIstCalendarDate } from "./financialYearUtils";
import { isValidGstinFormat } from "./gstin";
import { outputTaxReductionIncluded } from "./gstAdjustment";
import { mayIssueDeveloperTaxInvoice } from "./platformTaxPolicy";
import {
  complianceStatutoryBind,
  isInMonthlyComplianceScope,
  unresolvedReasonsForCreditNote,
  unresolvedReasonsForInvoice,
} from "./taxCompliance";
import {
  financialEventTaxBind,
  reportSourceFromBillingStore,
  type TaxComplianceReportSource,
} from "./taxComplianceReportSource";
import { assertGstrMonth } from "./taxPeriod";

export interface Gstr1B2bWorkingRow {
  invoiceId: string;
  recipientGstin: string | null;
  documentNumber: string | null;
  invoiceDateIst: string | null;
  invoiceValueInclusiveInPaise: number | null;
  placeOfSupplyStateCode: string | null;
  gstRateBps: number | null;
  taxableValueInPaise: number | null;
  igstInPaise: number | null;
  cgstInPaise: number | null;
  sgstInPaise: number | null;
  documentType: string;
  ecoReviewStatus: string;
}

export interface Gstr1B2cWorkingRow {
  placeOfSupplyStateCode: string;
  gstRateBps: number;
  taxableValueInPaise: number;
  igstInPaise: number;
  cgstInPaise: number;
  sgstInPaise: number;
  totalTaxInPaise: number;
  invoiceCount: number;
}

export interface Gstr1HsnWorkingRow {
  sacCode: string;
  taxableValueInPaise: number;
  igstInPaise: number;
  cgstInPaise: number;
  sgstInPaise: number;
  totalTaxInPaise: number;
  invoiceCount: number;
}

export interface Gstr1CreditNoteWorkingRow {
  creditNoteId: string;
  documentNumber: string | null;
  creditNoteDateIst: string | null;
  originalInvoiceId: string;
  originalDocumentNumber: string | null;
  recipientGstin: string | null;
  recipientClassification: string | null;
  taxableReversalInPaise: number | null;
  taxReversalInPaise: number | null;
  totalReversalInPaise: number | null;
  gstAdjustmentEligibility: string;
  outputTaxReductionIncluded: boolean;
}

export interface Gstr1TaxAdjustmentWorkingRow {
  financialEventId: string;
  eventType: string;
  creditNoteId: string | null;
  gstAdjustmentEligibility: string;
  taxAdjustmentDisposition: string;
  outputTaxReductionInPaise: number | null;
}

export interface Gstr1Table14WorkingRow {
  category: "section52_table14a" | "section9_5_table14b";
  operatorGstin: string | null;
  operatorIdentifier: string | null;
  taxableValueInPaise: number;
  netSupplyValueInPaise: number;
  sourceInvoiceIds: string[];
  creditNoteIds: string[];
  creditNoteReversalInPaise: number;
  fileReady: boolean;
  blockingReasons: string[];
}

export interface Gstr1ComplianceOpenItem {
  invoiceId: string;
  documentKind: string;
  financialEventId: string;
  supplyMonthKey: string;
  issueMonthKey: string | null;
  reportingTaxPeriodMonth: string | null;
  taxPeriodMonth: string | null;
  ecoReportingCategory: string;
  unresolvedReasons: string[];
  reviewStatus: Gstr1ReviewStatus;
}

export interface Gstr1WorkingPapers {
  month: string;
  reportId: string;
  contentHash: string;
  b2b: Gstr1B2bWorkingRow[];
  b2cSummary: Gstr1B2cWorkingRow[];
  hsnSacSummary: Gstr1HsnWorkingRow[];
  documentSeries: Array<{
    documentType: string;
    fromNumber: string | null;
    toNumber: string | null;
    count: number;
  }>;
  creditNotes: Gstr1CreditNoteWorkingRow[];
  taxAdjustments: Gstr1TaxAdjustmentWorkingRow[];
  table14a: Gstr1Table14WorkingRow[];
  table14b: Gstr1Table14WorkingRow[];
  complianceOpenItems: Gstr1ComplianceOpenItem[];
  excludedAlreadyFiled: string[];
  reportableInvoiceIds: string[];
  reportableCreditNoteIds: string[];
  sourceInvoiceIds: string[];
  sourceCreditNoteIds: string[];
  sourceComplianceIds: string[];
  sourceFinancialEventIds: string[];
  unresolvedReviewReasons: string[];
  reviewStatus: Gstr1ReviewStatus;
}

function invoiceDateIst(inv: SubscriptionInvoiceDoc): string | null {
  if (inv.invoiceIssuedOnIst) return inv.invoiceIssuedOnIst;
  if (inv.invoiceIssuedAt != null) return formatIstCalendarDate(inv.invoiceIssuedAt);
  return null;
}

function creditNoteDateIst(note: SubscriptionCreditNoteDoc): string | null {
  if (note.issuedOnIst) return note.issuedOnIst;
  if (note.issuedAt != null) return formatIstCalendarDate(note.issuedAt);
  return null;
}

function uniqueSorted(ids: string[]): string[] {
  return [...new Set(ids)].sort();
}

function sameIdSet(a: string[], b: string[]): boolean {
  return JSON.stringify(uniqueSorted(a)) === JSON.stringify(uniqueSorted(b));
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  const rec = value as Record<string, unknown>;
  const keys = Object.keys(rec).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(rec[k])}`).join(",")}}`;
}

function ecoUnresolved(category: string): boolean {
  return category === "requires_tax_review";
}

function invoiceStatutoryBind(inv: SubscriptionInvoiceDoc) {
  return {
    invoiceId: inv.invoiceId,
    documentNumber: inv.documentNumber,
    invoiceDateIst: invoiceDateIst(inv),
    recipientGstin: inv.buyer.gstin,
    recipientClassification: inv.buyer.classification,
    placeOfSupplyStateCode: inv.placeOfSupplyStateCode,
    gstRateBps: inv.gstRateBps,
    taxableAmountInPaise: inv.taxableAmountInPaise,
    cgstInPaise: inv.cgstInPaise,
    sgstInPaise: inv.sgstInPaise,
    igstInPaise: inv.igstInPaise,
    totalInPaise: inv.totalInPaise,
    documentType: inv.documentType,
    ecoReportingCategory: inv.ecoReporting.ecoReportingCategory,
  };
}

function creditNoteStatutoryBind(note: SubscriptionCreditNoteDoc) {
  return {
    creditNoteId: note.creditNoteId,
    documentNumber: note.documentNumber,
    creditNoteDateIst: creditNoteDateIst(note),
    recipientGstin: note.buyerGstin,
    recipientClassification: note.buyerClassification,
    placeOfSupplyStateCode: note.placeOfSupplyStateCode,
    gstRateBps: note.gstRateBps,
    taxableReversalInPaise: note.taxableAmountReversedInPaise,
    cgstReversedInPaise: note.cgstReversedInPaise,
    sgstReversedInPaise: note.sgstReversedInPaise,
    igstReversedInPaise: note.igstReversedInPaise,
    taxReversalInPaise: note.totalTaxReversedInPaise,
    totalReversalInPaise: note.totalReversedInPaise,
    originalInvoiceId: note.originalInvoiceId,
    gstAdjustmentEligibility: note.gstAdjustmentEligibility,
    sellerGstin: note.seller?.gstin ?? null,
    recipientName: note.buyer?.legalName ?? null,
    recipientAddress: note.buyer?.billingAddress ?? null,
  };
}

export function buildGstr1WorkingPapers(input: {
  month: string;
  invoices: SubscriptionInvoiceDoc[];
  creditNotes: SubscriptionCreditNoteDoc[];
  complianceRecords: SubscriptionTaxComplianceDoc[];
  financialEvents?: BillingEventLedgerDoc[];
}): Gstr1WorkingPapers {
  assertGstrMonth(input.month);
  const invoices = [...input.invoices].sort((a, b) => a.invoiceId.localeCompare(b.invoiceId));
  const creditNoteDocs = [...input.creditNotes].sort((a, b) =>
    a.creditNoteId.localeCompare(b.creditNoteId)
  );
  const complianceById = new Map(input.complianceRecords.map((c) => [c.invoiceId, c]));
  const invoiceById = new Map(invoices.map((i) => [i.invoiceId, i]));

  const excludedAlreadyFiled: string[] = [];
  const eligible = invoices.filter((inv) => {
    const compliance = complianceById.get(inv.invoiceId);
    const reportingMonth = compliance?.reportingTaxPeriodMonth ?? null;
    if (reportingMonth !== input.month) return false;
    if (inv.gstrReportedMonth) {
      excludedAlreadyFiled.push(inv.invoiceId);
      return false;
    }
    return (
      inv.issueStatus === "issued" &&
      Boolean(inv.documentNumber) &&
      mayIssueDeveloperTaxInvoice(inv.documentType)
    );
  });

  const b2b = eligible
    .filter((i) => i.documentType === "tax_invoice_b2b")
    .map((i) => ({
      invoiceId: i.invoiceId,
      recipientGstin: i.buyer.gstin,
      documentNumber: i.documentNumber,
      invoiceDateIst: invoiceDateIst(i),
      invoiceValueInclusiveInPaise: i.totalInPaise,
      placeOfSupplyStateCode: i.placeOfSupplyStateCode,
      gstRateBps: i.gstRateBps,
      taxableValueInPaise: i.taxableAmountInPaise,
      igstInPaise: i.igstInPaise,
      cgstInPaise: i.cgstInPaise,
      sgstInPaise: i.sgstInPaise,
      documentType: i.documentType,
      ecoReviewStatus: (complianceById.get(i.invoiceId)?.ecoReportingCategory ??
        i.ecoReporting.ecoReportingCategory) as string,
    }));

  const b2cMap = new Map<string, Gstr1B2cWorkingRow>();
  for (const i of eligible.filter((x) => x.documentType === "tax_invoice_b2c")) {
    const key = `${i.placeOfSupplyStateCode ?? "unknown"}:${i.gstRateBps ?? 0}`;
    const row = b2cMap.get(key) ?? {
      placeOfSupplyStateCode: i.placeOfSupplyStateCode ?? "unknown",
      gstRateBps: i.gstRateBps ?? 0,
      taxableValueInPaise: 0,
      igstInPaise: 0,
      cgstInPaise: 0,
      sgstInPaise: 0,
      totalTaxInPaise: 0,
      invoiceCount: 0,
    };
    row.taxableValueInPaise += i.taxableAmountInPaise ?? 0;
    row.igstInPaise += i.igstInPaise ?? 0;
    row.cgstInPaise += i.cgstInPaise ?? 0;
    row.sgstInPaise += i.sgstInPaise ?? 0;
    row.totalTaxInPaise += i.totalTaxInPaise ?? 0;
    row.invoiceCount += 1;
    b2cMap.set(key, row);
  }

  const hsnMap = new Map<string, Gstr1HsnWorkingRow>();
  for (const i of eligible) {
    const sac = i.sacCode ?? "unspecified";
    const row = hsnMap.get(sac) ?? {
      sacCode: sac,
      taxableValueInPaise: 0,
      igstInPaise: 0,
      cgstInPaise: 0,
      sgstInPaise: 0,
      totalTaxInPaise: 0,
      invoiceCount: 0,
    };
    row.taxableValueInPaise += i.taxableAmountInPaise ?? 0;
    row.igstInPaise += i.igstInPaise ?? 0;
    row.cgstInPaise += i.cgstInPaise ?? 0;
    row.sgstInPaise += i.sgstInPaise ?? 0;
    row.totalTaxInPaise += i.totalTaxInPaise ?? 0;
    row.invoiceCount += 1;
    hsnMap.set(sac, row);
  }

  const seriesMap = new Map<string, string[]>();
  for (const i of eligible) {
    const list = seriesMap.get(i.documentType) ?? [];
    if (i.documentNumber) list.push(i.documentNumber);
    seriesMap.set(i.documentType, list);
  }
  const documentSeries = [...seriesMap.entries()].map(([documentType, nums]) => {
    const sorted = [...nums].sort();
    return {
      documentType,
      fromNumber: sorted[0] ?? null,
      toNumber: sorted[sorted.length - 1] ?? null,
      count: sorted.length,
    };
  });

  const creditNotes = creditNoteDocs
    .filter((c) => {
      const compliance = complianceById.get(c.creditNoteId);
      const reporting = compliance?.reportingTaxPeriodMonth ?? c.taxPeriodMonth;
      return reporting === input.month && c.gstrReportable && !c.gstrReportedMonth;
    })
    .map((c) => {
      const eligibility =
        complianceById.get(c.creditNoteId)?.gstAdjustmentEligibility ?? c.gstAdjustmentEligibility;
      return {
        creditNoteId: c.creditNoteId,
        documentNumber: c.documentNumber,
        creditNoteDateIst: creditNoteDateIst(c),
        originalInvoiceId: c.originalInvoiceId,
        originalDocumentNumber: c.originalDocumentNumber,
        recipientGstin: c.buyerGstin,
        recipientClassification: c.buyerClassification,
        taxableReversalInPaise: c.taxableAmountReversedInPaise,
        taxReversalInPaise: c.totalTaxReversedInPaise,
        totalReversalInPaise: c.totalReversedInPaise,
        gstAdjustmentEligibility: eligibility,
        outputTaxReductionIncluded: outputTaxReductionIncluded(eligibility),
      };
    });

  type Table14Bucket = Gstr1Table14WorkingRow;
  const table14aMap = new Map<string, Table14Bucket>();
  const table14bMap = new Map<string, Table14Bucket>();
  function table14Bucket(
    map: Map<string, Table14Bucket>,
    category: "section52_table14a" | "section9_5_table14b",
    operatorGstin: string | null,
    operatorIdentifier: string | null
  ): Table14Bucket {
    const key = `${operatorGstin ?? "missing"}:${operatorIdentifier ?? ""}`;
    const existing = map.get(key);
    if (existing) return existing;
    const blockingReasons: string[] = [];
    if (!operatorGstin || !isValidGstinFormat(operatorGstin)) {
      blockingReasons.push("eco_operator_gstin_required");
    }
    const created: Table14Bucket = {
      category,
      operatorGstin,
      operatorIdentifier,
      taxableValueInPaise: 0,
      netSupplyValueInPaise: 0,
      sourceInvoiceIds: [],
      creditNoteIds: [],
      creditNoteReversalInPaise: 0,
      fileReady: blockingReasons.length === 0,
      blockingReasons,
    };
    map.set(key, created);
    return created;
  }

  for (const inv of eligible) {
    const compliance = complianceById.get(inv.invoiceId);
    const category = compliance?.ecoReportingCategory ?? inv.ecoReporting.ecoReportingCategory;
    if (category !== "section52_table14a" && category !== "section9_5_table14b") continue;
    const map = category === "section52_table14a" ? table14aMap : table14bMap;
    const row = table14Bucket(
      map,
      category,
      compliance?.operatorGstin ?? inv.ecoReporting.operatorGstin,
      compliance?.operatorIdentifier ?? inv.ecoReporting.operatorIdentifier
    );
    row.taxableValueInPaise += inv.taxableAmountInPaise ?? 0;
    row.netSupplyValueInPaise += inv.taxableAmountInPaise ?? 0;
    row.sourceInvoiceIds.push(inv.invoiceId);
  }
  for (const note of creditNotes) {
    if (!outputTaxReductionIncluded(note.gstAdjustmentEligibility)) continue;
    const originalCompliance = complianceById.get(note.originalInvoiceId);
    const original = invoiceById.get(note.originalInvoiceId);
    const category =
      originalCompliance?.ecoReportingCategory ?? original?.ecoReporting.ecoReportingCategory;
    if (category !== "section52_table14a" && category !== "section9_5_table14b") continue;
    const map = category === "section52_table14a" ? table14aMap : table14bMap;
    const row = table14Bucket(
      map,
      category,
      originalCompliance?.operatorGstin ?? original?.ecoReporting.operatorGstin ?? null,
      originalCompliance?.operatorIdentifier ?? original?.ecoReporting.operatorIdentifier ?? null
    );
    row.creditNoteIds.push(note.creditNoteId);
    row.creditNoteReversalInPaise += note.taxableReversalInPaise ?? 0;
    row.netSupplyValueInPaise -= note.taxableReversalInPaise ?? 0;
  }
  function finalizeTable14(map: Map<string, Table14Bucket>): Gstr1Table14WorkingRow[] {
    return [...map.values()]
      .map((row) => ({
        ...row,
        sourceInvoiceIds: uniqueSorted(row.sourceInvoiceIds),
        creditNoteIds: uniqueSorted(row.creditNoteIds),
        fileReady: row.blockingReasons.length === 0,
      }))
      .sort((a, b) =>
        `${a.operatorGstin}:${a.operatorIdentifier}`.localeCompare(
          `${b.operatorGstin}:${b.operatorIdentifier}`
        )
      );
  }
  const table14a = finalizeTable14(table14aMap);
  const table14b = finalizeTable14(table14bMap);

  const complianceOpenItems: Gstr1ComplianceOpenItem[] = [];
  const unresolved = new Set<string>();
  for (const rec of input.complianceRecords) {
    if (!isInMonthlyComplianceScope(rec, input.month)) continue;
    const original =
      rec.documentKind === "credit_note" && rec.originalInvoiceId
        ? complianceById.get(rec.originalInvoiceId)
        : null;
    const liveCategory = original?.ecoReportingCategory ?? rec.ecoReportingCategory;
    const liveGstin = original?.operatorGstin ?? rec.operatorGstin;
    const invoice = invoiceById.get(rec.invoiceId);
    const note = creditNoteDocs.find((c) => c.creditNoteId === rec.invoiceId);
    const liveReasons = invoice
      ? unresolvedReasonsForInvoice({
          invoice,
          ecoReportingCategory: liveCategory,
          operatorGstin: liveGstin,
          taxPeriodDecisionStatus: rec.taxPeriodDecisionStatus,
        })
      : note
        ? unresolvedReasonsForCreditNote({
            creditNote: note,
            ecoReportingCategory: liveCategory,
            operatorGstin: liveGstin,
            gstAdjustmentEligibility:
              rec.gstAdjustmentEligibility ?? note.gstAdjustmentEligibility,
          })
        : rec.unresolvedReasons;
    const liveStatus: Gstr1ReviewStatus =
      liveReasons.length === 0 ? "ready_to_file" : "requires_tax_review";
    if (liveStatus === "requires_tax_review") {
      complianceOpenItems.push({
        invoiceId: rec.invoiceId,
        documentKind: rec.documentKind,
        financialEventId: rec.financialEventId,
        supplyMonthKey: rec.supplyMonthKey,
        issueMonthKey: rec.issueMonthKey,
        reportingTaxPeriodMonth: rec.reportingTaxPeriodMonth,
        taxPeriodMonth: invoice?.taxPeriodMonth ?? note?.taxPeriodMonth ?? null,
        ecoReportingCategory: liveCategory,
        unresolvedReasons: liveReasons,
        reviewStatus: liveStatus,
      });
      unresolved.add("gstr_tax_review_unresolved");
      for (const reason of liveReasons) unresolved.add(reason);
    }
  }
  for (const inv of eligible) {
    if (inv.taxPeriodStatus !== "resolved" && !complianceById.get(inv.invoiceId)?.reportingTaxPeriodMonth) {
      unresolved.add("gstr_tax_period_unresolved");
    }
    if (!inv.documentNumber || inv.invoiceIssuedAt == null) unresolved.add("gstr_document_unissued");
  }
  for (const row of [...table14a, ...table14b]) {
    if (!row.fileReady) {
      unresolved.add("gstr_tax_review_unresolved");
      unresolved.add("eco_operator_gstin_required");
    }
  }
  for (const rec of input.complianceRecords.filter((c) => isInMonthlyComplianceScope(c, input.month))) {
    if (ecoUnresolved(rec.ecoReportingCategory) && !originalResolvedEco(rec, complianceById)) {
      unresolved.add("gstr_tax_review_unresolved");
    }
  }
  for (const note of creditNotes) {
    if (!note.documentNumber) unresolved.add("gstr_document_unissued");
  }

  const financialEvents = [...(input.financialEvents ?? [])]
    .filter((event) => event.monthKey === input.month)
    .sort((a, b) => a.financialEventId.localeCompare(b.financialEventId));
  const creditNoteByRefundId = new Map(
    creditNoteDocs.map((c) => [c.refundFinancialEventId, c] as const)
  );
  const taxAdjustments: Gstr1TaxAdjustmentWorkingRow[] = financialEvents
    .filter((event) => event.eventType === "refund" || event.eventType === "chargeback")
    .map((event) => {
      const note = creditNoteByRefundId.get(event.financialEventId);
      const compliance = note
        ? complianceById.get(note.creditNoteId)
        : [...input.complianceRecords].find((c) => c.financialEventId === event.financialEventId);
      const eligibility =
        compliance?.gstAdjustmentEligibility ??
        note?.gstAdjustmentEligibility ??
        "requires_review";
      const included = outputTaxReductionIncluded(eligibility);
      return {
        financialEventId: event.financialEventId,
        eventType: event.eventType,
        creditNoteId: note?.creditNoteId ?? null,
        gstAdjustmentEligibility: eligibility,
        taxAdjustmentDisposition:
          compliance?.taxAdjustmentDisposition ??
          (note ? "credit_note_issued" : event.eventType === "chargeback" ? "requires_review" : "pending"),
        outputTaxReductionInPaise: included ? (note?.taxableAmountReversedInPaise ?? null) : null,
      };
    });
  for (const row of taxAdjustments) {
    if (row.gstAdjustmentEligibility === "requires_review" || row.taxAdjustmentDisposition === "pending") {
      unresolved.add("gstr_tax_review_unresolved");
      unresolved.add("gst_adjustment_requires_review");
    }
  }

  const sourceInvoiceIds = uniqueSorted(invoices.map((i) => i.invoiceId));
  const sourceCreditNoteIds = uniqueSorted(creditNoteDocs.map((c) => c.creditNoteId));
  const sourceComplianceIds = uniqueSorted(input.complianceRecords.map((c) => c.invoiceId));
  const sourceFinancialEventIds = uniqueSorted(financialEvents.map((e) => e.financialEventId));
  const contentBody = {
    month: input.month,
    b2b,
    b2cSummary: [...b2cMap.values()],
    hsnSacSummary: [...hsnMap.values()],
    documentSeries,
    creditNotes,
    taxAdjustments,
    table14a,
    table14b,
    complianceOpenItems: complianceOpenItems.sort((a, b) => a.invoiceId.localeCompare(b.invoiceId)),
    excludedAlreadyFiled: uniqueSorted(excludedAlreadyFiled),
    reportableInvoiceIds: uniqueSorted(eligible.map((i) => i.invoiceId)),
    reportableCreditNoteIds: uniqueSorted(creditNotes.map((c) => c.creditNoteId)),
    sourceInvoiceIds,
    sourceCreditNoteIds,
    sourceComplianceIds,
    sourceFinancialEventIds,
    sourceInvoiceBinds: invoices.map(invoiceStatutoryBind),
    sourceCreditNoteBinds: creditNoteDocs.map(creditNoteStatutoryBind),
    sourceComplianceBinds: [...input.complianceRecords]
      .sort((a, b) => a.invoiceId.localeCompare(b.invoiceId))
      .map(complianceStatutoryBind),
    sourceFinancialEventBinds: financialEvents.map(financialEventTaxBind),
    unresolvedReviewReasons: [...unresolved].sort(),
  };
  const contentHash = createHash("sha256").update(canonicalJson(contentBody), "utf8").digest("hex");
  const reviewStatus: Gstr1ReviewStatus =
    unresolved.size === 0 && complianceOpenItems.length === 0 ? "ready_to_file" : "requires_tax_review";

  return {
    ...contentBody,
    reportId: `gstr1_${input.month}_${contentHash.slice(0, 24)}`,
    contentHash,
    reviewStatus,
  };
}

function originalResolvedEco(
  rec: SubscriptionTaxComplianceDoc,
  complianceById: Map<string, SubscriptionTaxComplianceDoc>
): boolean {
  if (rec.documentKind !== "credit_note" || !rec.originalInvoiceId) return false;
  const original = complianceById.get(rec.originalInvoiceId);
  return Boolean(original && original.ecoReportingCategory !== "requires_tax_review");
}

function csvCell(value: string | number | null | undefined): string {
  const raw = value == null ? "" : String(value);
  const guarded = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export function workingPapersToCsv(papers: Gstr1WorkingPapers): string {
  const lines = [
    "# GSTR-1 working papers for manual filing. Not a GSTN upload file.",
    [
      "section",
      "id",
      "documentNumber",
      "documentDateIst",
      "recipientGstin",
      "recipientClassification",
      "placeOfSupplyStateCode",
      "gstRateBps",
      "taxableValueInPaise",
      "igstInPaise",
      "cgstInPaise",
      "sgstInPaise",
      "totalTaxInPaise",
      "invoiceValueInclusiveInPaise",
      "documentType",
      "ecoReviewStatus",
      "originalInvoice",
      "invoiceCount",
    ].join(","),
  ];
  for (const row of papers.b2b) {
    lines.push(
      [
        csvCell("b2b"),
        csvCell(row.invoiceId),
        csvCell(row.documentNumber),
        csvCell(row.invoiceDateIst),
        csvCell(row.recipientGstin),
        csvCell("b2b"),
        csvCell(row.placeOfSupplyStateCode),
        csvCell(row.gstRateBps),
        csvCell(row.taxableValueInPaise),
        csvCell(row.igstInPaise),
        csvCell(row.cgstInPaise),
        csvCell(row.sgstInPaise),
        csvCell((row.igstInPaise ?? 0) + (row.cgstInPaise ?? 0) + (row.sgstInPaise ?? 0)),
        csvCell(row.invoiceValueInclusiveInPaise),
        csvCell(row.documentType),
        csvCell(row.ecoReviewStatus),
        csvCell(""),
        csvCell(1),
      ].join(",")
    );
  }
  for (const row of papers.b2cSummary) {
    lines.push(
      [
        csvCell("b2c_summary"),
        csvCell(`${row.placeOfSupplyStateCode}:${row.gstRateBps}`),
        csvCell(""),
        csvCell(""),
        csvCell(""),
        csvCell("b2c"),
        csvCell(row.placeOfSupplyStateCode),
        csvCell(row.gstRateBps),
        csvCell(row.taxableValueInPaise),
        csvCell(row.igstInPaise),
        csvCell(row.cgstInPaise),
        csvCell(row.sgstInPaise),
        csvCell(row.totalTaxInPaise),
        csvCell(row.taxableValueInPaise + row.totalTaxInPaise),
        csvCell("tax_invoice_b2c"),
        csvCell(""),
        csvCell(""),
        csvCell(row.invoiceCount),
      ].join(",")
    );
  }
  for (const row of papers.hsnSacSummary) {
    lines.push(
      [
        csvCell("hsn_sac_summary"),
        csvCell(row.sacCode),
        csvCell(""),
        csvCell(""),
        csvCell(""),
        csvCell(""),
        csvCell(""),
        csvCell(""),
        csvCell(row.taxableValueInPaise),
        csvCell(row.igstInPaise),
        csvCell(row.cgstInPaise),
        csvCell(row.sgstInPaise),
        csvCell(row.totalTaxInPaise),
        csvCell(""),
        csvCell(""),
        csvCell(""),
        csvCell(""),
        csvCell(row.invoiceCount),
      ].join(",")
    );
  }
  for (const row of papers.creditNotes) {
    lines.push(
      [
        csvCell("credit_note"),
        csvCell(row.creditNoteId),
        csvCell(row.documentNumber),
        csvCell(row.creditNoteDateIst),
        csvCell(row.recipientGstin),
        csvCell(row.recipientClassification),
        csvCell(""),
        csvCell(""),
        csvCell(row.taxableReversalInPaise),
        csvCell(""),
        csvCell(""),
        csvCell(""),
        csvCell(row.taxReversalInPaise),
        csvCell(row.totalReversalInPaise),
        csvCell("credit_note"),
        csvCell(""),
        csvCell(row.originalDocumentNumber ?? row.originalInvoiceId),
        csvCell(1),
      ].join(",")
    );
  }
  for (const row of papers.taxAdjustments) {
    lines.push(
      [
        csvCell("tax_adjustment"),
        csvCell(row.financialEventId),
        csvCell(row.creditNoteId),
        csvCell(""),
        csvCell(""),
        csvCell(row.eventType),
        csvCell(""),
        csvCell(""),
        csvCell(row.outputTaxReductionInPaise),
        csvCell(""),
        csvCell(""),
        csvCell(""),
        csvCell(""),
        csvCell(""),
        csvCell(row.gstAdjustmentEligibility),
        csvCell(row.taxAdjustmentDisposition),
        csvCell(""),
        csvCell(1),
      ].join(",")
    );
  }
  for (const row of [...papers.table14a, ...papers.table14b]) {
    lines.push(
      [
        csvCell(row.category),
        csvCell(row.operatorGstin),
        csvCell(""),
        csvCell(""),
        csvCell(row.operatorGstin),
        csvCell(row.category),
        csvCell(""),
        csvCell(""),
        csvCell(row.taxableValueInPaise),
        csvCell(""),
        csvCell(""),
        csvCell(""),
        csvCell(""),
        csvCell(row.netSupplyValueInPaise),
        csvCell(row.fileReady ? "file_ready" : row.blockingReasons.join("|")),
        csvCell(row.operatorIdentifier),
        csvCell(row.sourceInvoiceIds.join("|")),
        csvCell(row.sourceInvoiceIds.length),
      ].join(",")
    );
  }
  return lines.join("\n");
}

export async function persistGstr1ReportManifest(
  store: BillingStore,
  papers: Gstr1WorkingPapers,
  input: {
    jsonStoragePath: string;
    csvStoragePath: string;
    generatedAt: number;
    generatedByDiagnosticUid: string;
  }
): Promise<Gstr1ReportManifestDoc> {
  const path = gstr1ReportManifestPath(papers.reportId);
  const doc: Gstr1ReportManifestDoc = {
    reportId: papers.reportId,
    month: papers.month,
    invoiceIds: papers.reportableInvoiceIds,
    creditNoteIds: papers.reportableCreditNoteIds,
    sourceInvoiceIds: papers.sourceInvoiceIds,
    sourceCreditNoteIds: papers.sourceCreditNoteIds,
    sourceComplianceIds: papers.sourceComplianceIds,
    sourceFinancialEventIds: papers.sourceFinancialEventIds,
    contentHash: papers.contentHash,
    jsonStoragePath: input.jsonStoragePath,
    csvStoragePath: input.csvStoragePath,
    generatedAt: input.generatedAt,
    generatedByDiagnosticUid: input.generatedByDiagnosticUid,
    reviewStatus: papers.reviewStatus,
    unresolvedReviewReasons: papers.unresolvedReviewReasons,
  };
  return store.runTransaction(async (tx) => {
    const snap = await tx.get(path);
    if (snap.exists) {
      const existing = snap.data() as unknown as Gstr1ReportManifestDoc;
      if (existing.contentHash !== doc.contentHash) {
        throw new BillingError({
          clientCode: "internal_error",
          causeCode: "gstr_report_manifest_conflict",
        });
      }
      return existing;
    }
    tx.create(path, doc as unknown as Record<string, unknown>);
    return doc;
  });
}

export async function markGstr1FiledExact(
  store: BillingStore,
  input: {
    reportId: string;
    acknowledgement: string;
    filedByDiagnosticUid: string;
    nowMs: number;
    month?: string;
    reportSource?: TaxComplianceReportSource;
  }
): Promise<Gstr1FilingBatchDoc> {
  const ack = input.acknowledgement.trim();
  if (!ack) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "gstr_acknowledgement_required",
    });
  }
  if (!input.reportId) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "gstr_report_id_required",
    });
  }
  if (input.month) assertGstrMonth(input.month);

  return store.runTransaction(async (tx) => {
    const manifestSnap = await tx.get(gstr1ReportManifestPath(input.reportId));
    if (!manifestSnap.exists) {
      throw new BillingError({
        clientCode: "not_entitled",
        causeCode: "gstr_report_manifest_missing",
      });
    }
    const manifest = manifestSnap.data() as unknown as Gstr1ReportManifestDoc;
    if (input.month && input.month !== manifest.month) {
      throw new BillingError({
        clientCode: "invalid_purchase",
        causeCode: "gstr_month_report_mismatch",
      });
    }
    assertGstrMonth(manifest.month);
    if (manifest.unresolvedReviewReasons.length > 0) {
      const reason = manifest.unresolvedReviewReasons.includes("gstr_tax_review_unresolved")
        ? "gstr_tax_review_unresolved"
        : manifest.unresolvedReviewReasons[0] ?? "gstr_tax_review_unresolved";
      throw new BillingError({
        clientCode: "invalid_purchase",
        causeCode: reason,
      });
    }

    const exactInvoiceIds = uniqueSorted(manifest.invoiceIds);
    const creditNoteIds = uniqueSorted(manifest.creditNoteIds);
    const sourceInvoiceIds = uniqueSorted(manifest.sourceInvoiceIds ?? []);
    const sourceCreditNoteIds = uniqueSorted(manifest.sourceCreditNoteIds ?? []);
    const sourceComplianceIds = uniqueSorted(manifest.sourceComplianceIds ?? []);
    const sourceFinancialEventIds = uniqueSorted(manifest.sourceFinancialEventIds ?? []);
    if (
      (exactInvoiceIds.length > 0 || creditNoteIds.length > 0) &&
      sourceInvoiceIds.length === 0 &&
      sourceCreditNoteIds.length === 0 &&
      sourceComplianceIds.length === 0 &&
      sourceFinancialEventIds.length === 0
    ) {
      throw new BillingError({
        clientCode: "invalid_purchase",
        causeCode: "gstr_report_source_drift",
      });
    }
    const filingBatchId = `gstr1batch_${manifest.reportId}`;
    const batchSnap = await tx.get(gstr1FilingBatchPath(filingBatchId));
    if (batchSnap.exists) {
      const stored = batchSnap.data() as unknown as Gstr1FilingBatchDoc;
      if (
        stored.reportHash === manifest.contentHash &&
        stored.month === manifest.month &&
        stored.reportId === manifest.reportId &&
        stored.filingAcknowledgementReference === ack &&
        sameIdSet(stored.invoiceIds, exactInvoiceIds) &&
        sameIdSet(stored.creditNoteIds, creditNoteIds)
      ) {
        return stored;
      }
      throw new BillingError({
        clientCode: "invalid_purchase",
        causeCode: "gstr_filing_batch_conflict",
      });
    }

    const reportSource = input.reportSource ?? reportSourceFromBillingStore(store);
    const live = await reportSource.loadMonthlyScope(manifest.month);
    const liveFinancialEventIds = uniqueSorted(
      live.financialEvents.map((event) => event.financialEventId)
    );
    if (!sameIdSet(liveFinancialEventIds, sourceFinancialEventIds)) {
      throw new BillingError({
        clientCode: "invalid_purchase",
        causeCode: "gstr_report_source_drift",
      });
    }

    const allInvoiceIds = uniqueSorted([
      ...sourceInvoiceIds,
      ...exactInvoiceIds,
      ...live.invoices.map((i) => i.invoiceId),
    ]);
    const allCreditNoteIds = uniqueSorted([
      ...sourceCreditNoteIds,
      ...creditNoteIds,
      ...live.creditNotes.map((c) => c.creditNoteId),
    ]);
    const allComplianceIds = uniqueSorted([
      ...sourceComplianceIds,
      ...allInvoiceIds,
      ...allCreditNoteIds,
      ...live.complianceRecords.map((c) => c.invoiceId),
    ]);
    const invoiceById = new Map<string, SubscriptionInvoiceDoc>();
    for (const id of allInvoiceIds) {
      const snap = await tx.get(subscriptionInvoicePath(id));
      if (!snap.exists) {
        throw new BillingError({
          clientCode: "internal_error",
          causeCode: sourceInvoiceIds.includes(id) ? "gstr_report_source_drift" : "gstr_invoice_missing",
        });
      }
      const doc = snap.data() as unknown as SubscriptionInvoiceDoc;
      if (doc.invoiceId !== id) {
        throw new BillingError({
          clientCode: "internal_error",
          causeCode: "gstr_invoice_missing",
        });
      }
      invoiceById.set(id, doc);
    }
    const creditNoteById = new Map<string, SubscriptionCreditNoteDoc>();
    for (const id of allCreditNoteIds) {
      const snap = await tx.get(subscriptionCreditNotePath(id));
      if (!snap.exists) {
        throw new BillingError({
          clientCode: "internal_error",
          causeCode: sourceCreditNoteIds.includes(id)
            ? "gstr_report_source_drift"
            : "gstr_credit_note_missing",
        });
      }
      creditNoteById.set(id, snap.data() as unknown as SubscriptionCreditNoteDoc);
    }
    const complianceById = new Map<string, SubscriptionTaxComplianceDoc>();
    for (const id of allComplianceIds) {
      const snap = await tx.get(subscriptionTaxCompliancePath(id));
      if (!snap.exists) {
        if (sourceComplianceIds.includes(id)) {
          throw new BillingError({
            clientCode: "invalid_purchase",
            causeCode: "gstr_report_source_drift",
          });
        }
        continue;
      }
      complianceById.set(id, snap.data() as unknown as SubscriptionTaxComplianceDoc);
    }
    const financialEventById = new Map<string, BillingEventLedgerDoc>();
    for (const id of uniqueSorted([...sourceFinancialEventIds, ...liveFinancialEventIds])) {
      const snap = await tx.get(financialLedgerPath(id));
      if (!snap.exists) {
        throw new BillingError({
          clientCode: "invalid_purchase",
          causeCode: "gstr_report_source_drift",
        });
      }
      financialEventById.set(id, snap.data() as unknown as BillingEventLedgerDoc);
    }

    const rebuiltFromLive = buildGstr1WorkingPapers({
      month: manifest.month,
      invoices: live.invoices,
      creditNotes: live.creditNotes,
      complianceRecords: live.complianceRecords,
      financialEvents: live.financialEvents,
    });
    const rebuiltFromTxn = buildGstr1WorkingPapers({
      month: manifest.month,
      invoices: sourceInvoiceIds.map((id) => invoiceById.get(id) as SubscriptionInvoiceDoc).filter(Boolean),
      creditNotes: sourceCreditNoteIds.map(
        (id) => creditNoteById.get(id) as SubscriptionCreditNoteDoc
      ).filter(Boolean),
      complianceRecords: sourceComplianceIds
        .map((id) => complianceById.get(id) as SubscriptionTaxComplianceDoc)
        .filter(Boolean),
      financialEvents: sourceFinancialEventIds.map(
        (id) => financialEventById.get(id) as BillingEventLedgerDoc
      ),
    });
    if (
      rebuiltFromLive.contentHash !== manifest.contentHash ||
      rebuiltFromTxn.contentHash !== manifest.contentHash
    ) {
      throw new BillingError({
        clientCode: "invalid_purchase",
        causeCode: "gstr_report_source_drift",
      });
    }
    const rebuilt = rebuiltFromTxn;
    if (rebuilt.reviewStatus !== "ready_to_file" || rebuilt.complianceOpenItems.length > 0) {
      throw new BillingError({
        clientCode: "invalid_purchase",
        causeCode: "gstr_tax_review_unresolved",
      });
    }

    for (const id of exactInvoiceIds) {
      const doc = invoiceById.get(id);
      if (!doc) {
        throw new BillingError({
          clientCode: "internal_error",
          causeCode: "gstr_invoice_missing",
        });
      }
      const compliance = complianceById.get(id);
      if (!doc.documentNumber || doc.invoiceIssuedAt == null) {
        throw new BillingError({
          clientCode: "invalid_purchase",
          causeCode: "gstr_document_unissued",
        });
      }
      if (!compliance || compliance.reportingTaxPeriodMonth !== manifest.month) {
        throw new BillingError({
          clientCode: "invalid_purchase",
          causeCode: "gstr_tax_period_unresolved",
        });
      }
      if (ecoUnresolved(compliance.ecoReportingCategory) || compliance.reviewStatus !== "ready_to_file") {
        throw new BillingError({
          clientCode: "invalid_purchase",
          causeCode: "gstr_tax_review_unresolved",
        });
      }
      if (doc.gstrFilingBatchId && doc.gstrFilingBatchId !== filingBatchId) {
        throw new BillingError({
          clientCode: "invalid_purchase",
          causeCode: "gstr_filing_batch_conflict",
        });
      }
    }
    for (const id of creditNoteIds) {
      const doc = creditNoteById.get(id);
      if (!doc) {
        throw new BillingError({
          clientCode: "internal_error",
          causeCode: "gstr_credit_note_missing",
        });
      }
      if (!doc.gstrReportable || !doc.documentNumber) {
        throw new BillingError({
          clientCode: "invalid_purchase",
          causeCode: "gstr_document_not_reportable",
        });
      }
      if (doc.taxPeriodStatus !== "resolved" || doc.taxPeriodMonth !== manifest.month) {
        throw new BillingError({
          clientCode: "invalid_purchase",
          causeCode: "gstr_tax_period_unresolved",
        });
      }
      if (doc.gstrFilingBatchId && doc.gstrFilingBatchId !== filingBatchId) {
        throw new BillingError({
          clientCode: "invalid_purchase",
          causeCode: "gstr_filing_batch_conflict",
        });
      }
    }

    const batch: Gstr1FilingBatchDoc = {
      month: manifest.month,
      reportId: manifest.reportId,
      invoiceIds: exactInvoiceIds,
      creditNoteIds,
      reportHash: manifest.contentHash,
      filedAt: input.nowMs,
      filedByDiagnosticUid: input.filedByDiagnosticUid,
      filingAcknowledgementReference: ack,
      createdAt: input.nowMs,
    };

    tx.create(gstr1FilingBatchPath(filingBatchId), batch as unknown as Record<string, unknown>);
    for (const id of exactInvoiceIds) {
      const doc = invoiceById.get(id) as SubscriptionInvoiceDoc;
      tx.set(subscriptionInvoicePath(doc.invoiceId), {
        ...doc,
        gstrReportedMonth: manifest.month,
        gstrFilingBatchId: filingBatchId,
        updatedAt: input.nowMs,
      } as unknown as Record<string, unknown>);
    }
    for (const id of creditNoteIds) {
      const doc = creditNoteById.get(id) as SubscriptionCreditNoteDoc;
      tx.set(subscriptionCreditNotePath(doc.creditNoteId), {
        ...doc,
        gstrReportedMonth: manifest.month,
        gstrFilingBatchId: filingBatchId,
        updatedAt: input.nowMs,
      } as unknown as Record<string, unknown>);
    }
    return batch;
  });
}
