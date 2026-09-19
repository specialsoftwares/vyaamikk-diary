/**
 * Bounded missed-RTDN / stale company revalidation (VYD-39 maintenance).
 *
 * A queue drainer cannot recover events that never created a work item.
 * This pass revalidates company rows whose lastReconciledAt is older than
 * the stale window, using current stored credentials — never queue reason.
 * Flags stay off; this is source only.
 */

import { companyBillingPath } from "./paths";
import type { BillingStore } from "./store";
import type { BillingPlatform, CompanyBillingDoc } from "./types";
import type { StoreRevalidateOutcome, StoreRevalidator } from "./reconciliationConsumer";

export const STALE_COMPANY_REVALIDATION_MS = 36 * 60 * 60 * 1000;

export type StaleCompanyRow = {
  uid: string;
  platform: BillingPlatform;
  lastReconciledAt: number | null;
  credentialFingerprint: string | null;
  latestOrderId: string | null;
  originalTransactionId: string | null;
};

export interface StaleCompanyScanner {
  listStale(nowMs: number, staleAfterMs: number, limit: number): Promise<StaleCompanyRow[]>;
}

export function isStaleCompanyWatermark(
  lastReconciledAt: number | null | undefined,
  nowMs: number,
  staleAfterMs: number
): boolean {
  if (typeof lastReconciledAt !== "number" || !Number.isFinite(lastReconciledAt)) {
    return true;
  }
  return lastReconciledAt < nowMs - staleAfterMs;
}

export function companyDocToStaleRow(uid: string, doc: CompanyBillingDoc): StaleCompanyRow {
  return {
    uid,
    platform: doc.platform,
    lastReconciledAt: doc.lastReconciledAt ?? null,
    credentialFingerprint: doc.credentialFingerprint ?? null,
    latestOrderId: doc.latestOrderId ?? null,
    originalTransactionId: doc.originalTransactionId ?? null,
  };
}

/** Never-reconciled (null watermark) first — those never created a queue item. */
export function collectStaleCompanyRows(input: {
  neverReconciled: StaleCompanyRow[];
  aged: StaleCompanyRow[];
  maxItems: number;
}): StaleCompanyRow[] {
  const seen = new Set<string>();
  const out: StaleCompanyRow[] = [];
  for (const row of [...input.neverReconciled, ...input.aged]) {
    if (seen.has(row.uid)) continue;
    seen.add(row.uid);
    out.push(row);
    if (out.length >= input.maxItems) break;
  }
  return out;
}

export function memoryStaleCompanyScanner(store: {
  docs: Map<string, Record<string, unknown>>;
}): StaleCompanyScanner {
  return {
    async listStale(nowMs, staleAfterMs, limit) {
      const neverReconciled: StaleCompanyRow[] = [];
      const aged: StaleCompanyRow[] = [];
      for (const [path, raw] of store.docs) {
        if (!path.startsWith("_companyBilling/")) continue;
        const doc = raw as unknown as CompanyBillingDoc;
        if (!isStaleCompanyWatermark(doc.lastReconciledAt, nowMs, staleAfterMs)) continue;
        const row = companyDocToStaleRow(path.slice("_companyBilling/".length), doc);
        if (typeof doc.lastReconciledAt !== "number") neverReconciled.push(row);
        else aged.push(row);
      }
      return collectStaleCompanyRows({ neverReconciled, aged, maxItems: limit });
    },
  };
}

export function staleRevalidationQueueId(row: StaleCompanyRow): string | null {
  if (row.platform === "android") {
    const key = row.credentialFingerprint || row.latestOrderId;
    if (!key) return null;
    return `android:stale-revalidate:${key.replace(/\//g, "_")}`;
  }
  if (!row.originalTransactionId) return null;
  return `ios:stale-revalidate:${row.originalTransactionId.replace(/\//g, "_")}`;
}

export async function runStaleCompanyMaintenance(input: {
  enabled: boolean;
  store: BillingStore;
  scanner: StaleCompanyScanner;
  revalidate: StoreRevalidator;
  nowMs: () => number;
  staleAfterMs?: number;
  maxItems?: number;
}): Promise<{
  scanned: number;
  attempted: number;
  verified: number;
  pending: number;
  skipped: number;
}> {
  const tallies = { scanned: 0, attempted: 0, verified: 0, pending: 0, skipped: 0 };
  if (!input.enabled) return tallies;
  const staleAfterMs = input.staleAfterMs ?? STALE_COMPANY_REVALIDATION_MS;
  const maxItems = input.maxItems ?? 10;
  const rows = await input.scanner.listStale(input.nowMs(), staleAfterMs, maxItems);
  tallies.scanned = rows.length;
  for (const row of rows) {
    if (!staleRevalidationQueueId(row)) {
      tallies.skipped += 1;
      continue;
    }
    const companyPath = companyBillingPath(row.uid);
    const companyPresent = await input.store.runTransaction(async (tx) => {
      const snap = await tx.get(companyPath);
      return snap.exists;
    });
    if (!companyPresent) {
      tallies.skipped += 1;
      continue;
    }
    tallies.attempted += 1;
    const outcome: StoreRevalidateOutcome = await input.revalidate({
      platform: row.platform,
      uid: row.uid,
      financialEventId: `stale:${row.platform}`,
      credentialFingerprint: row.credentialFingerprint,
      reason: "stale_company_revalidation",
    });
    if (outcome.kind === "verified") tallies.verified += 1;
    else if (outcome.kind === "pending" || outcome.kind === "configuration_disabled") {
      tallies.pending += 1;
    }
  }
  return tallies;
}
