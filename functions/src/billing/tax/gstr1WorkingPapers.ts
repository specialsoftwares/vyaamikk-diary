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
  subscriptionCreditNotePath,
  subscriptionInvoicePath,
} from "../paths";
import type { BillingStore } from "../store";
import type {
  Gstr1FilingBatchDoc,
  Gstr1ReportManifestDoc,
  Gstr1ReviewStatus,
  SubscriptionCreditNoteDoc,
  SubscriptionInvoiceDoc,
} from "../types";

import { formatIstCalendarDate } from "./financialYearUtils";
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
  ecoTable14: Array<{
    invoiceId: string;
    platform: string;
    taxResponsibilityMode: string;
    table14ClassificationStatus: string;
    section52TcsStatus: string;
    note: string;
  }>;
  excludedAlreadyFiled: string[];
  reportableInvoiceIds: string[];
  reportableCreditNoteIds: string[];
  sourceInvoiceIds: string[];
  sourceCreditNoteIds: string[];
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

function ecoUnresolved(inv: SubscriptionInvoiceDoc): boolean {
  return (
    inv.ecoReporting.table14ClassificationStatus === "requires_tax_review" ||
    inv.ecoReporting.section52TcsStatus === "requires_tax_review"
  );
}

function ecoRowUnresolved(row: {
  table14ClassificationStatus: string;
  section52TcsStatus: string;
}): boolean {
  return (
    row.table14ClassificationStatus === "requires_tax_review" ||
    row.section52TcsStatus === "requires_tax_review"
  );
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
    section52TcsStatus: inv.ecoReporting.section52TcsStatus,
    table14ClassificationStatus: inv.ecoReporting.table14ClassificationStatus,
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
  };
}

export function buildGstr1WorkingPapers(input: {
  month: string;
  invoices: SubscriptionInvoiceDoc[];
  creditNotes: SubscriptionCreditNoteDoc[];
}): Gstr1WorkingPapers {
  assertGstrMonth(input.month);
  const invoices = [...input.invoices].sort((a, b) => a.invoiceId.localeCompare(b.invoiceId));
  const creditNoteDocs = [...input.creditNotes].sort((a, b) =>
    a.creditNoteId.localeCompare(b.creditNoteId)
  );
  const excludedAlreadyFiled: string[] = [];
  const eligible = invoices.filter((inv) => {
    if (inv.taxPeriodMonth !== input.month) return false;
    if (inv.gstrReportedMonth) {
      excludedAlreadyFiled.push(inv.invoiceId);
      return false;
    }
    return inv.gstrReportable === true;
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
      ecoReviewStatus: i.ecoReporting.table14ClassificationStatus,
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
    .filter((c) => c.taxPeriodMonth === input.month && c.gstrReportable && !c.gstrReportedMonth)
    .map((c) => ({
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
    }));

  const ecoTable14 = invoices
    .filter((i) => i.taxPeriodMonth === input.month)
    .filter((i) => i.ecoReporting.table14ClassificationStatus !== "not_applicable")
    .map((i) => ({
      invoiceId: i.invoiceId,
      platform: String(i.ecoReporting.platform),
      taxResponsibilityMode: i.ecoReporting.taxResponsibilityMode,
      table14ClassificationStatus: i.ecoReporting.table14ClassificationStatus,
      section52TcsStatus: i.ecoReporting.section52TcsStatus,
      note:
        i.ecoReporting.table14ClassificationStatus === "requires_tax_review"
          ? "ECO/Table-14 values are not fabricated; tax review required."
          : "classified",
    }));

  const unresolved = new Set<string>();
  for (const inv of eligible) {
    if (inv.taxPeriodStatus !== "resolved") unresolved.add("gstr_tax_period_unresolved");
    if (!inv.documentNumber || inv.invoiceIssuedAt == null) unresolved.add("gstr_document_unissued");
  }
  for (const row of ecoTable14) {
    if (ecoRowUnresolved(row)) unresolved.add("gstr_tax_review_unresolved");
  }
  for (const note of creditNotes) {
    if (!note.documentNumber) unresolved.add("gstr_document_unissued");
  }

  const sourceInvoiceIds = uniqueSorted(invoices.map((i) => i.invoiceId));
  const sourceCreditNoteIds = uniqueSorted(creditNoteDocs.map((c) => c.creditNoteId));
  const contentBody = {
    month: input.month,
    b2b,
    b2cSummary: [...b2cMap.values()],
    hsnSacSummary: [...hsnMap.values()],
    documentSeries,
    creditNotes,
    ecoTable14,
    excludedAlreadyFiled: uniqueSorted(excludedAlreadyFiled),
    reportableInvoiceIds: uniqueSorted(eligible.map((i) => i.invoiceId)),
    reportableCreditNoteIds: uniqueSorted(creditNotes.map((c) => c.creditNoteId)),
    sourceInvoiceIds,
    sourceCreditNoteIds,
    sourceInvoiceBinds: invoices.map(invoiceStatutoryBind),
    sourceCreditNoteBinds: creditNoteDocs.map(creditNoteStatutoryBind),
    unresolvedReviewReasons: [...unresolved].sort(),
  };
  const contentHash = createHash("sha256").update(canonicalJson(contentBody), "utf8").digest("hex");
  const reviewStatus: Gstr1ReviewStatus =
    unresolved.size === 0 ? "ready_to_file" : "requires_tax_review";

  return {
    ...contentBody,
    reportId: `gstr1_${input.month}_${contentHash.slice(0, 24)}`,
    contentHash,
    reviewStatus,
  };
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
    if (
      (exactInvoiceIds.length > 0 || creditNoteIds.length > 0) &&
      sourceInvoiceIds.length === 0 &&
      sourceCreditNoteIds.length === 0
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

    const allInvoiceIds = uniqueSorted([...sourceInvoiceIds, ...exactInvoiceIds]);
    const allCreditNoteIds = uniqueSorted([...sourceCreditNoteIds, ...creditNoteIds]);
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

    const rebuilt = buildGstr1WorkingPapers({
      month: manifest.month,
      invoices: sourceInvoiceIds.map((id) => invoiceById.get(id) as SubscriptionInvoiceDoc),
      creditNotes: sourceCreditNoteIds.map(
        (id) => creditNoteById.get(id) as SubscriptionCreditNoteDoc
      ),
    });
    if (rebuilt.contentHash !== manifest.contentHash) {
      throw new BillingError({
        clientCode: "invalid_purchase",
        causeCode: "gstr_report_source_drift",
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
      if (!doc.gstrReportable) {
        throw new BillingError({
          clientCode: "invalid_purchase",
          causeCode: "gstr_document_not_reportable",
        });
      }
      if (!doc.documentNumber || doc.invoiceIssuedAt == null) {
        throw new BillingError({
          clientCode: "invalid_purchase",
          causeCode: "gstr_document_unissued",
        });
      }
      if (doc.taxPeriodStatus !== "resolved" || doc.taxPeriodMonth !== manifest.month) {
        throw new BillingError({
          clientCode: "invalid_purchase",
          causeCode: "gstr_tax_period_unresolved",
        });
      }
      if (ecoUnresolved(doc)) {
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
