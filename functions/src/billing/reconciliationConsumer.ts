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
  markReconciliationRetryable,
  markReconciliationTerminal,
  resolveReconciliationWorkItem,
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

export type StoreRevalidator = (
  input: StoreRevalidateInput
) => Promise<{ resultSummary: string }>;

export interface ReconciliationQueueScanner {
  listCandidateIds(nowMs: number): Promise<string[]>;
}

export function memoryReconciliationScanner(store: {
  docs: Map<string, Record<string, unknown>>;
}): ReconciliationQueueScanner {
  return {
    async listCandidateIds(nowMs) {
      const ids: string[] = [];
      for (const [path, raw] of store.docs) {
        if (!path.startsWith("_billingReconciliationQueue/")) continue;
        const doc = raw as unknown as BillingReconciliationQueueDoc;
        if (doc.status === "resolved" || doc.status === "terminal") continue;
        if ((doc.nextAttemptAt ?? 0) > nowMs) continue;
        if (doc.status === "leased" && (doc.leaseExpiresAt ?? 0) > nowMs) continue;
        ids.push(path.slice("_billingReconciliationQueue/".length));
      }
      return ids;
    },
  };
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

export async function processClaimedReconciliationItem(
  store: BillingStore,
  input: {
    id: string;
    workerId: string;
    nowMs: number;
    claimed: BillingReconciliationQueueDoc;
    revalidate: StoreRevalidator;
  }
): Promise<{ outcome: "resolved" | "retryable" | "terminal"; reason: string }> {
  const { ledger, company } = await readLedgerAndCompany(store, input.claimed.financialEventId);
  if (!ledger) {
    await markReconciliationTerminal(store, {
      id: input.id,
      workerId: input.workerId,
      nowMs: input.nowMs,
      reason: "missing_ledger",
    });
    return { outcome: "terminal", reason: "missing_ledger" };
  }
  if (!ledger.uid) {
    await markReconciliationTerminal(store, {
      id: input.id,
      workerId: input.workerId,
      nowMs: input.nowMs,
      reason: "missing_account_linkage",
    });
    return { outcome: "terminal", reason: "missing_account_linkage" };
  }
  if (!company) {
    await markReconciliationTerminal(store, {
      id: input.id,
      workerId: input.workerId,
      nowMs: input.nowMs,
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
      nowMs: input.nowMs,
      reason: "missing_credentials",
    });
    return { outcome: "terminal", reason: "missing_credentials" };
  }
  if (input.claimed.platform === "ios" && !hasIosPointer) {
    await markReconciliationTerminal(store, {
      id: input.id,
      workerId: input.workerId,
      nowMs: input.nowMs,
      reason: "missing_credentials",
    });
    return { outcome: "terminal", reason: "missing_credentials" };
  }

  try {
    await input.revalidate({
      platform: input.claimed.platform,
      uid: ledger.uid,
      financialEventId: input.claimed.financialEventId,
      credentialFingerprint: input.claimed.credentialFingerprint,
      reason: input.claimed.reason,
    });
    await resolveReconciliationWorkItem(store, {
      id: input.id,
      platform: input.claimed.platform,
      financialEventId: input.claimed.financialEventId,
      nowMs: input.nowMs,
    });
    return { outcome: "resolved", reason: "ok" };
  } catch (err) {
    const retryable = err instanceof BillingError ? err.retryable === true : true;
    const code = retryableCode(err);
    if (retryable) {
      await markReconciliationRetryable(store, {
        id: input.id,
        workerId: input.workerId,
        nowMs: input.nowMs,
        errorCode: code,
      });
      return { outcome: "retryable", reason: code };
    }
    await markReconciliationTerminal(store, {
      id: input.id,
      workerId: input.workerId,
      nowMs: input.nowMs,
      reason: code,
    });
    return { outcome: "terminal", reason: code };
  }
}

export async function runBillingReconciliationTick(input: {
  enabled: boolean;
  store: BillingStore;
  scanner: ReconciliationQueueScanner;
  revalidate: StoreRevalidator;
  nowMs: () => number;
  workerId: string;
  maxItems?: number;
}): Promise<{ claimed: number; resolved: number; retryable: number; terminal: number }> {
  const tallies = { claimed: 0, resolved: 0, retryable: 0, terminal: 0 };
  if (!input.enabled) return tallies;
  const maxItems = input.maxItems ?? 10;
  const ids = (await input.scanner.listCandidateIds(input.nowMs())).slice(0, maxItems);
  for (const id of ids) {
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
      nowMs: input.nowMs(),
      claimed: claimed.doc,
      revalidate: input.revalidate,
    });
    tallies[result.outcome] += 1;
  }
  return tallies;
}
