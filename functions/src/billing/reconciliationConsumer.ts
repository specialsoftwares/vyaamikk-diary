/**
 * Durable reconciliation consumer (VYD-39).
 *
 * Entitlement changes only through the injected store revalidator, which must
 * call existing Play/App Store adapters. Queue reason, notification type and
 * client claims are never grant/revoke authority.
 */

import { BillingError } from "./errors";
import {
  companyBillingPath,
  financialLedgerPath,
  sanitizeDocId,
} from "./paths";
import {
  claimReconciliationWorkItem,
  completeClaimedReconciliationWorkItem,
  markReconciliationRetryable,
  markReconciliationTerminal,
  restoreClaimedReconciliationBudget,
  RECONCILIATION_MAX_ATTEMPTS,
} from "./reconciliationQueue";
import type { BillingStore } from "./store";
import type {
  BillingEventLedgerDoc,
  BillingPlatform,
  BillingReconciliationQueueDoc,
  CompanyBillingDoc,
} from "./types";

export type StoreRevalidateInput = {
  platform: BillingPlatform;
  uid: string;
  financialEventId: string;
  credentialFingerprint: string | null;
  /** Forensic queue reason only. Must not be used as grant authority. */
  reason: string;
};

export type StoreRevalidateOutcome =
  | { kind: "verified"; resultSummary: string }
  | { kind: "pending"; resultSummary: string }
  | { kind: "transient"; resultSummary: string; causeCode: string }
  | { kind: "terminal"; resultSummary: string; causeCode: string }
  | { kind: "stale"; resultSummary: string }
  | { kind: "configuration_disabled"; resultSummary: string };

export type StoreRevalidator = (input: StoreRevalidateInput) => Promise<StoreRevalidateOutcome>;

export type ReconciliationTickTallies = {
  claimed: number;
  resolved: number;
  retryable: number;
  terminal: number;
  pending: number;
  stale: number;
  configuration_disabled: number;
};

export interface ReconciliationQueueScanner {
  listCandidateIds(nowMs: number, limit: number): Promise<string[]>;
}

export function memoryReconciliationScanner(store: {
  docs: Map<string, Record<string, unknown>>;
}): ReconciliationQueueScanner {
  return {
    async listCandidateIds(nowMs, limit) {
      const ids: string[] = [];
      for (const [path, raw] of store.docs) {
        if (!path.startsWith("_billingReconciliationQueue/")) continue;
        const doc = raw as unknown as BillingReconciliationQueueDoc;
        if (doc.status === "resolved" || doc.status === "terminal") continue;
        if ((doc.nextAttemptAt ?? 0) > nowMs) continue;
        if (doc.status === "leased" && (doc.leaseExpiresAt ?? 0) > nowMs) continue;
        ids.push(path.slice("_billingReconciliationQueue/".length));
      }
      return ids.slice(0, limit);
    },
  };
}

/**
 * Paginate until `limit` due ids are collected or pages are exhausted.
 * Production must not apply a single limit() before due/lease filtering.
 */
export async function collectDueReconciliationIds(input: {
  nowMs: number;
  limit: number;
  pageSize: number;
  maxPages: number;
  readPage: (
    page: number,
    pageSize: number
  ) => Promise<Array<{ id: string; status: string; nextAttemptAt?: number; leaseExpiresAt?: number }>>;
}): Promise<string[]> {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (let page = 0; page < input.maxPages && ids.length < input.limit; page++) {
    const rows = await input.readPage(page, input.pageSize);
    if (rows.length === 0) break;
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      if (row.status === "resolved" || row.status === "terminal") continue;
      if ((row.nextAttemptAt ?? 0) > input.nowMs) continue;
      if (row.status === "leased" && (row.leaseExpiresAt ?? 0) > input.nowMs) continue;
      ids.push(row.id);
      if (ids.length >= input.limit) break;
    }
    if (rows.length < input.pageSize) break;
  }
  return ids;
}

async function readLedgerAndCompany(
  store: BillingStore,
  financialEventId: string
): Promise<{
  ledger: BillingEventLedgerDoc | null;
  company: CompanyBillingDoc | null;
}> {
  return store.runTransaction(async (tx) => {
    const ledgerSnap = await tx.get(financialLedgerPath(sanitizeDocId(financialEventId)));
    if (!ledgerSnap.exists) return { ledger: null, company: null };
    const ledger = ledgerSnap.data() as unknown as BillingEventLedgerDoc;
    const uid = typeof ledger.uid === "string" ? ledger.uid : "";
    if (!uid) return { ledger, company: null };
    const companySnap = await tx.get(companyBillingPath(uid));
    const company = companySnap.exists
      ? (companySnap.data() as unknown as CompanyBillingDoc)
      : null;
    return { ledger, company };
  });
}

function retryableCode(err: unknown): string {
  if (err instanceof BillingError) return err.causeCode;
  if (err instanceof Error && err.message) return "reconciliation_transient";
  return "reconciliation_transient";
}

function asNow(nowMs: number | (() => number)): number {
  return typeof nowMs === "function" ? nowMs() : nowMs;
}

export async function processClaimedReconciliationItem(
  store: BillingStore,
  input: {
    id: string;
    workerId: string;
    nowMs: number | (() => number);
    claimed: BillingReconciliationQueueDoc;
    revalidate: StoreRevalidator;
  }
): Promise<{ outcome: keyof ReconciliationTickTallies | "resolved"; reason: string }> {
  const { ledger, company } = await readLedgerAndCompany(store, input.claimed.financialEventId);
  const nowAfterRead = asNow(input.nowMs);
  if (!ledger) {
    await markReconciliationTerminal(store, {
      id: input.id,
      workerId: input.workerId,
      nowMs: nowAfterRead,
      reason: "missing_ledger",
    });
    return { outcome: "terminal", reason: "missing_ledger" };
  }
  if (!ledger.uid) {
    await markReconciliationTerminal(store, {
      id: input.id,
      workerId: input.workerId,
      nowMs: nowAfterRead,
      reason: "missing_account_linkage",
    });
    return { outcome: "terminal", reason: "missing_account_linkage" };
  }
  if (!company) {
    await markReconciliationTerminal(store, {
      id: input.id,
      workerId: input.workerId,
      nowMs: nowAfterRead,
      reason: "missing_company_billing",
    });
    return { outcome: "terminal", reason: "missing_company_billing" };
  }
  const hasAndroidCredential = Boolean(
    company.encryptedPurchaseCredential && company.credentialFingerprint
  );
  const hasIosPointer = Boolean(company.originalTransactionId);
  if (input.claimed.platform === "android" && !hasAndroidCredential) {
    await markReconciliationTerminal(store, {
      id: input.id,
      workerId: input.workerId,
      nowMs: nowAfterRead,
      reason: "missing_credentials",
    });
    return { outcome: "terminal", reason: "missing_credentials" };
  }
  if (input.claimed.platform === "ios" && !hasIosPointer) {
    await markReconciliationTerminal(store, {
      id: input.id,
      workerId: input.workerId,
      nowMs: nowAfterRead,
      reason: "missing_credentials",
    });
    return { outcome: "terminal", reason: "missing_credentials" };
  }

  let outcome: StoreRevalidateOutcome;
  try {
    outcome = await input.revalidate({
      platform: input.claimed.platform,
      uid: ledger.uid,
      financialEventId: input.claimed.financialEventId,
      credentialFingerprint: company.credentialFingerprint,
      reason: input.claimed.reason,
    });
  } catch (err) {
    const retryable = err instanceof BillingError ? err.retryable === true : true;
    const code = retryableCode(err);
    const now = asNow(input.nowMs);
    if (retryable) {
      await markReconciliationRetryable(store, {
        id: input.id,
        workerId: input.workerId,
        nowMs: now,
        errorCode: code,
      });
      return { outcome: "retryable", reason: code };
    }
    await markReconciliationTerminal(store, {
      id: input.id,
      workerId: input.workerId,
      nowMs: now,
      reason: code,
    });
    return { outcome: "terminal", reason: code };
  }

  const now = asNow(input.nowMs);
  if (outcome.kind === "configuration_disabled") {
    await restoreClaimedReconciliationBudget(store, {
      id: input.id,
      workerId: input.workerId,
      nowMs: now,
      errorCode: outcome.resultSummary,
      nextAttemptAt: now + 5 * 60_000,
    });
    return { outcome: "configuration_disabled", reason: outcome.resultSummary };
  }
  if (outcome.kind === "pending") {
    await markReconciliationRetryable(store, {
      id: input.id,
      workerId: input.workerId,
      nowMs: now,
      errorCode: outcome.resultSummary,
    });
    return { outcome: "pending", reason: outcome.resultSummary };
  }
  if (outcome.kind === "transient") {
    await markReconciliationRetryable(store, {
      id: input.id,
      workerId: input.workerId,
      nowMs: now,
      errorCode: outcome.causeCode,
    });
    return { outcome: "retryable", reason: outcome.causeCode };
  }
  if (outcome.kind === "terminal") {
    await markReconciliationTerminal(store, {
      id: input.id,
      workerId: input.workerId,
      nowMs: now,
      reason: outcome.causeCode,
    });
    return { outcome: "terminal", reason: outcome.causeCode };
  }
  if (outcome.kind === "stale") {
    await markReconciliationRetryable(store, {
      id: input.id,
      workerId: input.workerId,
      nowMs: now,
      errorCode: "stale_ownership",
    });
    return { outcome: "stale", reason: "stale_ownership" };
  }

  const completed = await completeClaimedReconciliationWorkItem(store, {
    id: input.id,
    workerId: input.workerId,
    platform: input.claimed.platform,
    financialEventId: input.claimed.financialEventId,
    nowMs: now,
  });
  if (!completed.completed) {
    return { outcome: "stale", reason: completed.reason };
  }
  return { outcome: "resolved", reason: outcome.resultSummary };
}

export function newReconciliationInvocationId(revision: string | undefined): string {
  const rev = revision && revision.length > 0 ? revision : "local";
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `scheduler:${rev}:${rand}`;
}

export async function runBillingReconciliationTick(input: {
  enabled: boolean;
  store: BillingStore;
  scanner: ReconciliationQueueScanner;
  revalidate: StoreRevalidator;
  nowMs: () => number;
  workerId: string;
  maxItems?: number;
}): Promise<ReconciliationTickTallies> {
  const tallies: ReconciliationTickTallies = {
    claimed: 0,
    resolved: 0,
    retryable: 0,
    terminal: 0,
    pending: 0,
    stale: 0,
    configuration_disabled: 0,
  };
  if (!input.enabled) return tallies;
  const maxItems = input.maxItems ?? 10;
  const ids = await input.scanner.listCandidateIds(input.nowMs(), Math.max(maxItems, 40));
  const due = ids.slice(0, maxItems);
  for (const id of due) {
    const claimed = await claimReconciliationWorkItem(input.store, {
      id,
      workerId: input.workerId,
      nowMs: input.nowMs(),
    });
    if (!claimed.claimed || !claimed.doc) continue;
    tallies.claimed += 1;
    const result = await processClaimedReconciliationItem(input.store, {
      id,
      workerId: input.workerId,
      nowMs: input.nowMs,
      claimed: claimed.doc,
      revalidate: input.revalidate,
    });
    tallies[result.outcome] += 1;
  }
  return tallies;
}

export { RECONCILIATION_MAX_ATTEMPTS };
