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
import { gstr1FilingBatchPath, subscriptionCreditNotePath, subscriptionInvoicePath } from "../paths";
import type { BillingStore } from "../store";
import type {
  Gstr1FilingBatchDoc,
  SubscriptionCreditNoteDoc,
  SubscriptionInvoiceDoc,
} from "../types";

export interface Gstr1WorkingPapers {
  month: string;
  reportId: string;
  b2b: Array<{
    invoiceId: string;
    documentNumber: string | null;
    gstin: string | null;
    placeOfSupplyStateCode: string | null;
    taxableAmountInPaise: number | null;
    igstInPaise: number | null;
    cgstInPaise: number | null;
    sgstInPaise: number | null;
    totalInPaise: number | null;
  }>;
  b2cSummary: Array<{
    placeOfSupplyStateCode: string;
    gstRateBps: number;
    taxableAmountInPaise: number;
    taxInPaise: number;
    invoiceCount: number;
  }>;
  hsnSacSummary: Array<{
    sacCode: string;
    taxableAmountInPaise: number;
    taxInPaise: number;
    invoiceCount: number;
  }>;
  documentSeries: Array<{
    documentType: string;
    fromNumber: string | null;
    toNumber: string | null;
    count: number;
  }>;
  creditNotes: Array<{
    creditNoteId: string;
    documentNumber: string | null;
    originalInvoiceId: string;
    totalReversedInPaise: number | null;
  }>;
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
}

export function buildGstr1WorkingPapers(input: {
  month: string;
  invoices: SubscriptionInvoiceDoc[];
  creditNotes: SubscriptionCreditNoteDoc[];
}): Gstr1WorkingPapers {
  if (!/^\d{4}-\d{2}$/.test(input.month)) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "invalid_gstr_month",
    });
  }
  const excludedAlreadyFiled: string[] = [];
  const eligible = input.invoices.filter((inv) => {
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
      documentNumber: i.documentNumber,
      gstin: i.buyer.gstin,
      placeOfSupplyStateCode: i.placeOfSupplyStateCode,
      taxableAmountInPaise: i.taxableAmountInPaise,
      igstInPaise: i.igstInPaise,
      cgstInPaise: i.cgstInPaise,
      sgstInPaise: i.sgstInPaise,
      totalInPaise: i.totalInPaise,
    }));

  const b2cMap = new Map<string, Gstr1WorkingPapers["b2cSummary"][number]>();
  for (const i of eligible.filter((x) => x.documentType === "tax_invoice_b2c")) {
    const key = `${i.placeOfSupplyStateCode ?? "unknown"}:${i.gstRateBps ?? 0}`;
    const row = b2cMap.get(key) ?? {
      placeOfSupplyStateCode: i.placeOfSupplyStateCode ?? "unknown",
      gstRateBps: i.gstRateBps ?? 0,
      taxableAmountInPaise: 0,
      taxInPaise: 0,
      invoiceCount: 0,
    };
    row.taxableAmountInPaise += i.taxableAmountInPaise ?? 0;
    row.taxInPaise += i.totalTaxInPaise ?? 0;
    row.invoiceCount += 1;
    b2cMap.set(key, row);
  }

  const hsnMap = new Map<string, Gstr1WorkingPapers["hsnSacSummary"][number]>();
  for (const i of eligible) {
    const sac = i.sacCode ?? "unspecified";
    const row = hsnMap.get(sac) ?? {
      sacCode: sac,
      taxableAmountInPaise: 0,
      taxInPaise: 0,
      invoiceCount: 0,
    };
    row.taxableAmountInPaise += i.taxableAmountInPaise ?? 0;
    row.taxInPaise += i.totalTaxInPaise ?? 0;
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

  const creditNotes = input.creditNotes
    .filter((c) => c.taxPeriodMonth === input.month && c.gstrReportable && !c.gstrReportedMonth)
    .map((c) => ({
      creditNoteId: c.creditNoteId,
      documentNumber: c.documentNumber,
      originalInvoiceId: c.originalInvoiceId,
      totalReversedInPaise: c.totalReversedInPaise,
    }));

  const ecoTable14 = input.invoices
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

  const reportId = createHash("sha256")
    .update(
      JSON.stringify({
        month: input.month,
        invoices: eligible.map((i) => i.invoiceId).sort(),
        creditNotes: creditNotes.map((c) => c.creditNoteId).sort(),
      }),
      "utf8"
    )
    .digest("hex")
    .slice(0, 24);

  return {
    month: input.month,
    reportId: `gstr1_${input.month}_${reportId}`,
    b2b,
    b2cSummary: [...b2cMap.values()],
    hsnSacSummary: [...hsnMap.values()],
    documentSeries,
    creditNotes,
    ecoTable14,
    excludedAlreadyFiled,
    reportableInvoiceIds: eligible.map((i) => i.invoiceId),
  };
}

export function workingPapersToCsv(papers: Gstr1WorkingPapers): string {
  const lines = ["section,id,amountInPaise"];
  for (const row of papers.b2b) {
    lines.push(`b2b,${row.invoiceId},${row.totalInPaise ?? 0}`);
  }
  for (const row of papers.b2cSummary) {
    lines.push(
      `b2c,${row.placeOfSupplyStateCode}:${row.gstRateBps},${row.taxableAmountInPaise}`
    );
  }
  for (const row of papers.creditNotes) {
    lines.push(`credit_note,${row.creditNoteId},${row.totalReversedInPaise ?? 0}`);
  }
  return lines.join("\n");
}

export async function markGstr1FiledExact(
  store: BillingStore,
  input: {
    month: string;
    papers: Gstr1WorkingPapers;
    acknowledgement: string;
    filedByDiagnosticUid: string;
    nowMs: number;
  }
): Promise<Gstr1FilingBatchDoc> {
  const ack = input.acknowledgement.trim();
  if (!ack) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "gstr_acknowledgement_required",
    });
  }
  const exactInvoiceIds = uniqueIds(input.papers.reportableInvoiceIds);
  const creditNoteIds = input.papers.creditNotes.map((c) => c.creditNoteId);
  const reportHash = createHash("sha256")
    .update(JSON.stringify({ invoiceIds: exactInvoiceIds, creditNoteIds }), "utf8")
    .digest("hex");
  const filingBatchId = `gstr1batch_${input.papers.reportId}`;
  const batch: Gstr1FilingBatchDoc = {
    month: input.month,
    reportId: input.papers.reportId,
    invoiceIds: exactInvoiceIds,
    creditNoteIds,
    reportHash,
    filedAt: input.nowMs,
    filedByDiagnosticUid: input.filedByDiagnosticUid,
    filingAcknowledgementReference: ack,
    createdAt: input.nowMs,
  };

  await store.runTransaction(async (tx) => {
    const batchSnap = await tx.get(gstr1FilingBatchPath(filingBatchId));
    const invoiceSnaps = [];
    for (const id of exactInvoiceIds) {
      invoiceSnaps.push({ id, snap: await tx.get(subscriptionInvoicePath(id)) });
    }
    const cnSnaps = [];
    for (const id of creditNoteIds) {
      cnSnaps.push({ id, snap: await tx.get(subscriptionCreditNotePath(id)) });
    }
    if (batchSnap.exists) {
      return;
    }
    tx.create(gstr1FilingBatchPath(filingBatchId), batch as unknown as Record<string, unknown>);
    for (const { snap } of invoiceSnaps) {
      if (!snap.exists) continue;
      const doc = snap.data() as unknown as SubscriptionInvoiceDoc;
      tx.set(subscriptionInvoicePath(doc.invoiceId), {
        ...doc,
        gstrReportedMonth: input.month,
        gstrFilingBatchId: filingBatchId,
        updatedAt: input.nowMs,
      } as unknown as Record<string, unknown>);
    }
    for (const { snap } of cnSnaps) {
      if (!snap.exists) continue;
      const doc = snap.data() as unknown as SubscriptionCreditNoteDoc;
      tx.set(subscriptionCreditNotePath(doc.creditNoteId), {
        ...doc,
        gstrReportedMonth: input.month,
        gstrFilingBatchId: filingBatchId,
        updatedAt: input.nowMs,
      } as unknown as Record<string, unknown>);
    }
  });
  return batch;
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}
