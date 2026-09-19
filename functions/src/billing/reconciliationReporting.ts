/**
 * Ledger-derived commission reporting. Null actual/estimated amounts stay
 * unknown — never coerced to 0. Ledger insertion is not an invoice.
 */

import type { BillingEventLedgerDoc } from "./types";

export type LedgerCommissionReport = {
  eventCount: number;
  grossKnownPaise: number;
  grossUnknownCount: number;
  actualCommissionKnownPaise: number;
  actualCommissionUnknownCount: number;
  estimatedCommissionKnownPaise: number;
  estimatedCommissionUnknownCount: number;
  monthKey: string | null;
};

function addKnown(sum: number, value: number | null | undefined): { sum: number; unknown: boolean } {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return { sum, unknown: true };
  }
  return { sum: sum + value, unknown: false };
}

export function summarizeLedgerCommissions(
  rows: BillingEventLedgerDoc[],
  monthKey?: string | null
): LedgerCommissionReport {
  const report: LedgerCommissionReport = {
    eventCount: rows.length,
    grossKnownPaise: 0,
    grossUnknownCount: 0,
    actualCommissionKnownPaise: 0,
    actualCommissionUnknownCount: 0,
    estimatedCommissionKnownPaise: 0,
    estimatedCommissionUnknownCount: 0,
    monthKey: monthKey ?? null,
  };
  for (const row of rows) {
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
  ].join(",");
}

export interface LedgerMonthScanner {
  listForMonth(monthKey: string, limit: number): Promise<BillingEventLedgerDoc[]>;
}

export function memoryLedgerMonthScanner(store: {
  docs: Map<string, Record<string, unknown>>;
}): LedgerMonthScanner {
  return {
    async listForMonth(monthKey, limit) {
      const rows: BillingEventLedgerDoc[] = [];
      for (const [path, raw] of store.docs) {
        if (!path.startsWith("_billingEventLedger/")) continue;
        const doc = raw as unknown as BillingEventLedgerDoc;
        if (doc.monthKey !== monthKey) continue;
        rows.push(doc);
        if (rows.length >= limit) break;
      }
      return rows;
    },
  };
}

export async function reportLedgerCommissionsForMonth(input: {
  scanner: LedgerMonthScanner;
  monthKey: string;
  limit?: number;
}): Promise<LedgerCommissionReport> {
  const rows = await input.scanner.listForMonth(input.monthKey, input.limit ?? 200);
  return summarizeLedgerCommissions(rows, input.monthKey);
}
