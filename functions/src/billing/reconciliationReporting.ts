/**
 * Ledger-derived commission reporting. Null actual/estimated amounts stay
 * unknown — never coerced to 0. Ledger insertion is not an invoice.
 *
 * Monthly aggregation paginates the ledger. A first-page cap is labelled
 * `sampleTruncated` and is not persisted as a complete `_revenueReports` doc.
 * Net revenue is never invented: it stays null when any contributing amount
 * is unknown or the scan is incomplete.
 */

import { revenueReportPath } from "./paths";
import type { BillingStore } from "./store";
import type { BillingEventLedgerDoc, RevenueReportDoc } from "./types";

export type LedgerCommissionReport = {
  eventCount: number;
  grossKnownPaise: number;
  grossUnknownCount: number;
  actualCommissionKnownPaise: number;
  actualCommissionUnknownCount: number;
  estimatedCommissionKnownPaise: number;
  estimatedCommissionUnknownCount: number;
  refundsKnownPaise: number;
  refundsUnknownCount: number;
  monthKey: string | null;
  complete: boolean;
  sampleTruncated: boolean;
  scanStartedAt: number | null;
  ledgerHighWatermark: number;
};

function addKnown(sum: number, value: number | null | undefined): { sum: number; unknown: boolean } {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return { sum, unknown: true };
  }
  return { sum: sum + value, unknown: false };
}

function isInflow(eventType: BillingEventLedgerDoc["eventType"]): boolean {
  return eventType === "purchase" || eventType === "renewal";
}

function isOutflow(eventType: BillingEventLedgerDoc["eventType"]): boolean {
  return eventType === "refund" || eventType === "chargeback";
}

export function summarizeLedgerCommissions(
  rows: BillingEventLedgerDoc[],
  monthKey?: string | null,
  flags?: { complete?: boolean; sampleTruncated?: boolean; scanStartedAt?: number | null }
): LedgerCommissionReport {
  const report: LedgerCommissionReport = {
    eventCount: rows.length,
    grossKnownPaise: 0,
    grossUnknownCount: 0,
    actualCommissionKnownPaise: 0,
    actualCommissionUnknownCount: 0,
    estimatedCommissionKnownPaise: 0,
    estimatedCommissionUnknownCount: 0,
    refundsKnownPaise: 0,
    refundsUnknownCount: 0,
    monthKey: monthKey ?? null,
    complete: flags?.complete === true,
    sampleTruncated: flags?.sampleTruncated === true,
    scanStartedAt: typeof flags?.scanStartedAt === "number" ? flags.scanStartedAt : null,
    ledgerHighWatermark: 0,
  };
  for (const row of rows) {
    if (typeof row.recordedAt === "number" && row.recordedAt > report.ledgerHighWatermark) {
      report.ledgerHighWatermark = row.recordedAt;
    }
    if (isInflow(row.eventType)) {
      const gross = addKnown(report.grossKnownPaise, row.grossAmountInPaise);
      report.grossKnownPaise = gross.sum;
      if (gross.unknown) report.grossUnknownCount += 1;
      const actual = addKnown(report.actualCommissionKnownPaise, row.actualPlatformCommissionInPaise);
      report.actualCommissionKnownPaise = actual.sum;
      if (actual.unknown) report.actualCommissionUnknownCount += 1;
      const estimated = addKnown(
        report.estimatedCommissionKnownPaise,
        row.estimatedPlatformCommissionInPaise
      );
      report.estimatedCommissionKnownPaise = estimated.sum;
      if (estimated.unknown) report.estimatedCommissionUnknownCount += 1;
      continue;
    }
    if (isOutflow(row.eventType)) {
      const refund = addKnown(report.refundsKnownPaise, row.grossAmountInPaise);
      report.refundsKnownPaise = refund.sum;
      if (refund.unknown) report.refundsUnknownCount += 1;
    }
  }
  return report;
}

export function formatCommissionReportLine(report: LedgerCommissionReport): string {
  return [
    `events:${report.eventCount}`,
    `gross_known:${report.grossKnownPaise}`,
    `gross_unknown:${report.grossUnknownCount}`,
    `actual_known:${report.actualCommissionKnownPaise}`,
    `actual_unknown:${report.actualCommissionUnknownCount}`,
    `estimated_known:${report.estimatedCommissionKnownPaise}`,
    `estimated_unknown:${report.estimatedCommissionUnknownCount}`,
    `refunds_known:${report.refundsKnownPaise}`,
    `refunds_unknown:${report.refundsUnknownCount}`,
    `complete:${report.complete ? "1" : "0"}`,
    `sample:${report.sampleTruncated ? "1" : "0"}`,
  ].join(",");
}

export type LedgerMonthPage = {
  rows: BillingEventLedgerDoc[];
  lastId: string | null;
  exhausted: boolean;
};

export interface LedgerMonthScanner {
  listForMonth(monthKey: string, limit: number): Promise<BillingEventLedgerDoc[]>;
  listForMonthPage?(
    monthKey: string,
    pageSize: number,
    afterId: string | null
  ): Promise<LedgerMonthPage>;
}

export function memoryLedgerMonthScanner(store: {
  docs: Map<string, Record<string, unknown>>;
}): LedgerMonthScanner {
  const listed = (monthKey: string): Array<{ id: string; doc: BillingEventLedgerDoc }> => {
    const rows: Array<{ id: string; doc: BillingEventLedgerDoc }> = [];
    for (const [path, raw] of store.docs) {
      if (!path.startsWith("_billingEventLedger/")) continue;
      const doc = raw as unknown as BillingEventLedgerDoc;
      if (doc.monthKey !== monthKey) continue;
      rows.push({ id: path.slice("_billingEventLedger/".length), doc });
    }
    rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return rows;
  };
  return {
    async listForMonth(monthKey, limit) {
      return listed(monthKey)
        .slice(0, limit)
        .map((r) => r.doc);
    },
    async listForMonthPage(monthKey, pageSize, afterId) {
      const all = listed(monthKey);
      const start = afterId ? all.findIndex((r) => r.id === afterId) + 1 : 0;
      const from = start < 0 ? all.length : start;
      const slice = all.slice(from, from + pageSize);
      return {
        rows: slice.map((r) => r.doc),
        lastId: slice.length > 0 ? slice[slice.length - 1].id : null,
        exhausted: from + slice.length >= all.length,
      };
    },
  };
}

export function revenueReportFromCommission(
  report: LedgerCommissionReport,
  generatedAt: number
): RevenueReportDoc | null {
  if (!report.monthKey) return null;
  if (typeof report.scanStartedAt !== "number") return null;
  return {
    monthKey: report.monthKey,
    grossRevenueInPaise: report.grossKnownPaise,
    refundsInPaise: report.refundsKnownPaise,
    actualPlatformCommissionInPaise: report.actualCommissionKnownPaise,
    estimatedPlatformCommissionInPaise: report.estimatedCommissionKnownPaise,
    netRevenueEstimateInPaise: null,
    financialEventCount: report.eventCount,
    generatedAt,
    scanStartedAt: report.scanStartedAt,
    ledgerHighWatermark: report.ledgerHighWatermark,
    complete: report.complete,
    sampleTruncated: report.sampleTruncated,
    grossUnknownCount: report.grossUnknownCount,
    actualCommissionUnknownCount: report.actualCommissionUnknownCount,
    estimatedCommissionUnknownCount: report.estimatedCommissionUnknownCount,
    refundsUnknownCount: report.refundsUnknownCount,
  };
}

export async function persistRevenueReport(input: {
  store: BillingStore;
  report: LedgerCommissionReport;
  nowMs: number;
}): Promise<boolean> {
  const doc = revenueReportFromCommission(input.report, input.nowMs);
  if (!doc || !doc.complete || doc.sampleTruncated) return false;
  return input.store.runTransaction(async (tx) => {
    const snap = await tx.get(revenueReportPath(doc.monthKey));
    const existing = snap.data() as RevenueReportDoc | undefined;
    if (existing?.complete === true) {
      const existingStart =
        typeof existing.scanStartedAt === "number" ? existing.scanStartedAt : Number.NEGATIVE_INFINITY;
      if (existingStart > doc.scanStartedAt) return false;
      if (existingStart === doc.scanStartedAt) {
        const existingWatermark =
          typeof existing.ledgerHighWatermark === "number"
            ? existing.ledgerHighWatermark
            : Number.NEGATIVE_INFINITY;
        if (existingWatermark > doc.ledgerHighWatermark) return false;
      }
    }
    tx.set(revenueReportPath(doc.monthKey), { ...doc });
    return true;
  });
}

export async function reportLedgerCommissionsForMonth(input: {
  scanner: LedgerMonthScanner;
  monthKey: string;
  pageSize?: number;
  maxPages?: number;
  /** Explicit sample cap when the scanner has no page API. */
  sampleLimit?: number;
  persistTo?: BillingStore;
  nowMs?: () => number;
}): Promise<LedgerCommissionReport & { persisted: boolean }> {
  const pageSize = input.pageSize ?? 100;
  const maxPages = input.maxPages ?? 50;
  const clock = input.nowMs ?? Date.now;
  const scanStartedAt = clock();
  let rows: BillingEventLedgerDoc[] = [];
  let complete = false;
  let sampleTruncated = false;

  // Pagination walks live document-id order. Concurrent ledger inserts between
  // pages can appear in a later page; this is not a frozen snapshot. Ordering
  // for persistence uses scanStartedAt, then ledgerHighWatermark (max recordedAt).

  if (typeof input.scanner.listForMonthPage === "function") {
    let after: string | null = null;
    let pages = 0;
    let exhausted = false;
    while (pages < maxPages) {
      const page = await input.scanner.listForMonthPage(input.monthKey, pageSize, after);
      pages += 1;
      rows = rows.concat(page.rows);
      if (page.exhausted || page.rows.length === 0) {
        exhausted = true;
        break;
      }
      after = page.lastId;
    }
    complete = exhausted;
    sampleTruncated = !exhausted;
  } else {
    const cap = input.sampleLimit ?? 200;
    const fetched = await input.scanner.listForMonth(input.monthKey, cap + 1);
    sampleTruncated = fetched.length > cap;
    rows = sampleTruncated ? fetched.slice(0, cap) : fetched;
    complete = !sampleTruncated;
  }

  const report = summarizeLedgerCommissions(rows, input.monthKey, {
    complete,
    sampleTruncated,
    scanStartedAt,
  });
  let persisted = false;
  if (input.persistTo) {
    persisted = await persistRevenueReport({
      store: input.persistTo,
      report,
      nowMs: clock(),
    });
  }
  return { ...report, persisted };
}
