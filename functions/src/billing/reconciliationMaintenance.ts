/**
 * Bounded missed-RTDN / stale company revalidation (VYD-39 maintenance).
 *
 * A queue drainer cannot recover events that never created a work item.
 * This pass revalidates company rows whose lastReconciledAt is older than
 * the stale window, using current stored credentials — never queue reason.
 *
 * Progress uses document-id order over `_companyBilling` so omitted, null,
 * and aged watermarks are visible without an equality query, and a poisoned
 * first page cannot starve later accounts. Unverified accounts are not
 * marked reconciled; backoff lives on `_billingMaintenanceSchedule/{uid}`.
 * Flags stay off; this is source only.
 */

import {
  billingMaintenanceSchedulePath,
  companyBillingPath,
  staleMaintenanceLeasePath,
} from "./paths";
import type { BillingStore } from "./store";
import type { BillingPlatform, CompanyBillingDoc } from "./types";
import type { StoreRevalidateOutcome, StoreRevalidator } from "./reconciliationConsumer";

export const STALE_COMPANY_REVALIDATION_MS = 36 * 60 * 60 * 1000;
export const STALE_MAINTENANCE_LEASE_TTL_MS = 120_000;
export const MAINTENANCE_BACKOFF_MS = 6 * 60 * 60 * 1000;
export const MAINTENANCE_SCAN_PAGE_SIZE = 40;
export const MAINTENANCE_MAX_SCAN_PAGES = 8;

export type StaleCompanyRow = {
  uid: string;
  platform: BillingPlatform;
  lastReconciledAt: number | null;
  credentialFingerprint: string | null;
  latestOrderId: string | null;
  originalTransactionId: string | null;
};

export type CompanyBillingScanDoc = {
  id: string;
  data: Record<string, unknown>;
};

export type CompanyBillingScanPage = {
  docs: CompanyBillingScanDoc[];
};

export interface StaleCompanyScanner {
  listStale(nowMs: number, staleAfterMs: number, limit: number): Promise<StaleCompanyRow[]>;
  readPage?(afterDocumentId: string | null, pageSize: number): Promise<CompanyBillingScanPage>;
}

export type MaintenanceTallies = {
  scanned: number;
  attempted: number;
  verified: number;
  pending: number;
  skipped: number;
  failed: number;
  overlappingSkipped: boolean;
};

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

function scanDocToRow(doc: CompanyBillingScanDoc): StaleCompanyRow | null {
  const platform = doc.data.platform;
  if (platform !== "android" && platform !== "ios") return null;
  return companyDocToStaleRow(doc.id, doc.data as unknown as CompanyBillingDoc);
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
  const listed = (): CompanyBillingScanDoc[] => {
    const docs: CompanyBillingScanDoc[] = [];
    for (const [path, raw] of store.docs) {
      if (!path.startsWith("_companyBilling/")) continue;
      docs.push({ id: path.slice("_companyBilling/".length), data: raw });
    }
    docs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return docs;
  };
  return {
    async listStale(nowMs, staleAfterMs, limit) {
      const neverReconciled: StaleCompanyRow[] = [];
      const aged: StaleCompanyRow[] = [];
      for (const doc of listed()) {
        const last = doc.data.lastReconciledAt as number | null | undefined;
        if (!isStaleCompanyWatermark(last, nowMs, staleAfterMs)) continue;
        const row = scanDocToRow(doc);
        if (!row) continue;
        if (typeof last !== "number") neverReconciled.push(row);
        else aged.push(row);
      }
      return collectStaleCompanyRows({ neverReconciled, aged, maxItems: limit });
    },
    async readPage(afterDocumentId, pageSize) {
      const all = listed();
      const start = afterDocumentId
        ? all.findIndex((d) => d.id === afterDocumentId) + 1
        : 0;
      const from = start < 0 ? all.length : start;
      return { docs: all.slice(from, from + pageSize) };
    },
  };
}

export function documentIdCompanyScanner(readPage: (
  afterDocumentId: string | null,
  pageSize: number
) => Promise<CompanyBillingScanPage>): StaleCompanyScanner {
  return {
    async listStale() {
      return [];
    },
    readPage,
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

export async function claimStaleMaintenanceLease(input: {
  store: BillingStore;
  owner: string;
  nowMs: number;
  ttlMs?: number;
}): Promise<{ claimed: boolean; scanCursor: string | null }> {
  const path = staleMaintenanceLeasePath();
  const ttl = input.ttlMs ?? STALE_MAINTENANCE_LEASE_TTL_MS;
  return input.store.runTransaction(async (tx) => {
    const snap = await tx.get(path);
    const data = snap.data();
    const expiresAt = typeof data?.expiresAt === "number" ? data.expiresAt : 0;
    const owner = typeof data?.owner === "string" ? data.owner : "";
    const scanCursor =
      typeof data?.scanCursor === "string" && data.scanCursor.length > 0 ? data.scanCursor : null;
    if (owner.length > 0 && owner !== input.owner && expiresAt > input.nowMs) {
      return { claimed: false, scanCursor: null };
    }
    tx.set(path, {
      owner: input.owner,
      expiresAt: input.nowMs + ttl,
      scanCursor,
      claimedAt: input.nowMs,
    });
    return { claimed: true, scanCursor };
  });
}

export async function completeStaleMaintenanceLease(input: {
  store: BillingStore;
  owner: string;
  scanCursor: string | null;
  nowMs: number;
}): Promise<void> {
  const path = staleMaintenanceLeasePath();
  await input.store.runTransaction(async (tx) => {
    const snap = await tx.get(path);
    const data = snap.data();
    if (data?.owner !== input.owner) return;
    tx.set(path, {
      owner: null,
      expiresAt: 0,
      scanCursor: input.scanCursor,
      releasedAt: input.nowMs,
    });
  });
}

export async function isMaintenanceAccountEligible(input: {
  store: BillingStore;
  uid: string;
  nowMs: number;
}): Promise<boolean> {
  const path = billingMaintenanceSchedulePath(input.uid);
  return input.store.runTransaction(async (tx) => {
    const snap = await tx.get(path);
    const next = snap.data()?.nextEligibleAt;
    if (typeof next !== "number") return true;
    return next <= input.nowMs;
  });
}

export async function recordMaintenanceBackoff(input: {
  store: BillingStore;
  uid: string;
  nowMs: number;
  outcome: string;
  backoffMs?: number;
  leaseOwner?: string;
  leaseNowMs?: () => number;
}): Promise<boolean> {
  const path = billingMaintenanceSchedulePath(input.uid);
  const delay = input.backoffMs ?? MAINTENANCE_BACKOFF_MS;
  const leasePath = staleMaintenanceLeasePath();
  return input.store.runTransaction(async (tx) => {
    if (input.leaseOwner) {
      const leaseSnap = await tx.get(leasePath);
      const lease = leaseSnap.data();
      const current = input.leaseNowMs ? input.leaseNowMs() : input.nowMs;
      if (lease?.owner !== input.leaseOwner) return false;
      if (typeof lease?.expiresAt !== "number" || lease.expiresAt <= current) return false;
    }
    const snap = await tx.get(path);
    const lastAttemptAt = snap.data()?.lastAttemptAt;
    if (typeof lastAttemptAt === "number" && lastAttemptAt > input.nowMs) return false;
    tx.set(path, {
      uid: input.uid,
      nextEligibleAt: input.nowMs + delay,
      lastAttemptAt: input.nowMs,
      lastOutcome: input.outcome,
    });
    return true;
  });
}

function emptyTallies(): MaintenanceTallies {
  return {
    scanned: 0,
    attempted: 0,
    verified: 0,
    pending: 0,
    skipped: 0,
    failed: 0,
    overlappingSkipped: false,
  };
}

function outcomeKind(outcome: StoreRevalidateOutcome): string {
  return outcome.kind;
}

export async function runStaleCompanyMaintenance(input: {
  enabled: boolean;
  store: BillingStore;
  scanner: StaleCompanyScanner;
  revalidate: StoreRevalidator;
  nowMs: () => number;
  staleAfterMs?: number;
  maxItems?: number;
  leaseOwner?: string;
  scanPageSize?: number;
  maxScanPages?: number;
  useDocumentIdScan?: boolean;
}): Promise<MaintenanceTallies> {
  const tallies = emptyTallies();
  if (!input.enabled) return tallies;
  const staleAfterMs = input.staleAfterMs ?? STALE_COMPANY_REVALIDATION_MS;
  const maxItems = input.maxItems ?? 10;
  const now = input.nowMs();
  const useScan = input.useDocumentIdScan === true && typeof input.scanner.readPage === "function";

  let scanCursor: string | null = null;
  let examinedLast: string | null = null;
  let exhausted = false;
  if (input.leaseOwner) {
    const claim = await claimStaleMaintenanceLease({
      store: input.store,
      owner: input.leaseOwner,
      nowMs: now,
    });
    if (!claim.claimed) {
      tallies.overlappingSkipped = true;
      return tallies;
    }
    scanCursor = claim.scanCursor;
    examinedLast = claim.scanCursor;
  }

  try {
    if (!useScan) {
      const rows = await input.scanner.listStale(now, staleAfterMs, maxItems);
      tallies.scanned = rows.length;
      for (const row of rows) {
        await processStaleRow({ input, row, tallies });
      }
      return tallies;
    }

    const pageSize = input.scanPageSize ?? MAINTENANCE_SCAN_PAGE_SIZE;
    const maxPages = input.maxScanPages ?? MAINTENANCE_MAX_SCAN_PAGES;
    let pages = 0;
    let after = scanCursor;
    let workSlots = 0;
    const readPage = input.scanner.readPage!;

    while (workSlots < maxItems && pages < maxPages) {
      const page = await readPage(after, pageSize);
      pages += 1;
      if (page.docs.length === 0) {
        exhausted = true;
        break;
      }
      for (const doc of page.docs) {
        examinedLast = doc.id;
        after = doc.id;
        const last = doc.data.lastReconciledAt as number | null | undefined;
        if (!isStaleCompanyWatermark(last, now, staleAfterMs)) continue;
        const row = scanDocToRow(doc);
        if (!row) {
          tallies.skipped += 1;
          continue;
        }
        tallies.scanned += 1;
        const slot = await processStaleRow({ input, row, tallies });
        if (slot) workSlots += 1;
        if (workSlots >= maxItems) break;
      }
      if (page.docs.length < pageSize) {
        exhausted = true;
        break;
      }
    }
    return tallies;
  } finally {
    if (input.leaseOwner) {
      await completeStaleMaintenanceLease({
        store: input.store,
        owner: input.leaseOwner,
        scanCursor: useScan ? (exhausted ? null : examinedLast) : scanCursor,
        nowMs: input.nowMs(),
      });
    }
  }
}

async function processStaleRow(input: {
  input: {
    store: BillingStore;
    revalidate: StoreRevalidator;
    nowMs: () => number;
    leaseOwner?: string;
  };
  row: StaleCompanyRow;
  tallies: MaintenanceTallies;
}): Promise<boolean> {
  const { row, tallies } = input;
  const currentNow = () => input.input.nowMs();
  try {
    const eligible = await isMaintenanceAccountEligible({
      store: input.input.store,
      uid: row.uid,
      nowMs: currentNow(),
    });
    if (!eligible) {
      tallies.skipped += 1;
      return false;
    }
    if (!staleRevalidationQueueId(row)) {
      tallies.skipped += 1;
      await recordMaintenanceBackoff({
        store: input.input.store,
        uid: row.uid,
        nowMs: currentNow(),
        outcome: "missing_credential",
        leaseOwner: input.input.leaseOwner,
        leaseNowMs: currentNow,
      });
      return true;
    }
    const companyPath = companyBillingPath(row.uid);
    const companyPresent = await input.input.store.runTransaction(async (tx) => {
      const snap = await tx.get(companyPath);
      return snap.exists;
    });
    if (!companyPresent) {
      tallies.skipped += 1;
      return true;
    }
    tallies.attempted += 1;
    const outcome: StoreRevalidateOutcome = await input.input.revalidate({
      platform: row.platform,
      uid: row.uid,
      financialEventId: `stale:${row.platform}`,
      credentialFingerprint: row.credentialFingerprint,
      reason: "stale_company_revalidation",
    });
    if (outcome.kind === "verified") {
      tallies.verified += 1;
      return true;
    }
    if (outcome.kind === "pending" || outcome.kind === "configuration_disabled") {
      tallies.pending += 1;
    }
    await recordMaintenanceBackoff({
      store: input.input.store,
      uid: row.uid,
      nowMs: currentNow(),
      outcome: outcomeKind(outcome),
      leaseOwner: input.input.leaseOwner,
      leaseNowMs: currentNow,
    });
    return true;
  } catch {
    tallies.failed += 1;
    try {
      await recordMaintenanceBackoff({
        store: input.input.store,
        uid: row.uid,
        nowMs: currentNow(),
        outcome: "isolated_failure",
        leaseOwner: input.input.leaseOwner,
        leaseNowMs: currentNow,
      });
    } catch {
      // Sidecar failure must not abort the remaining accounts.
    }
    return true;
  }
}
