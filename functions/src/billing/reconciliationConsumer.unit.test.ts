/**
 * VYD-39 reconciliation consumer: leases, backoff, injected store revalidation.
 * Run: npm run test:billing-reconciliation-queue
 */

import assert from "node:assert/strict";

import { BillingError } from "./errors";
import {
  companyBillingPath,
  financialLedgerPath,
  billingReconciliationQueuePath,
  sanitizeDocId,
} from "./paths";
import {
  claimReconciliationWorkItem,
  completeClaimedReconciliationWorkItem,
  ensureReconciliationWorkItem,
  markReconciliationRetryable,
  operatorRequeueReconciliationWorkItem,
  remainingAttemptBudget,
  RECONCILIATION_MAX_ATTEMPTS,
  reconciliationBackoffMs,
} from "./reconciliationQueue";
import {
  collectDueReconciliationIds,
  memoryReconciliationScanner,
  newReconciliationInvocationId,
  processClaimedReconciliationItem,
  runBillingReconciliationTick,
  type StoreRevalidateInput,
} from "./reconciliationConsumer";
import { MemoryBillingStore } from "./store";
import type { BillingEventLedgerDoc, BillingReconciliationQueueDoc, CompanyBillingDoc } from "./types";

const NOW = 1_900_000_000_000;
const QUEUE_ID = "android:refund-reconcile:GPA.RECON-1";
const EVENT_ID = "android:refund:GPA.RECON-1";
const UID = "user-recon-1";

function ledgerDoc(): BillingEventLedgerDoc {
  return {
    financialEventId: EVENT_ID,
    platform: "android",
    uid: UID,
    canonicalSku: "vyd_starter_monthly",
    eventType: "refund",
    grossAmountInPaise: 9900,
    currency: "INR",
    actualPlatformCommissionInPaise: null,
    estimatedPlatformCommissionInPaise: null,
    occurredAt: NOW,
    monthKey: "2026-09",
    relatedFinancialEventId: "android:purchase:GPA.RECON-1",
    recordedAt: NOW,
    recordedBy: "rtdn",
  };
}

function companyDoc(): CompanyBillingDoc {
  return {
    uid: UID,
    platform: "android",
    canonicalSku: "vyd_starter_monthly",
    productId: "vyd_starter",
    basePlanId: "monthly",
    latestOrderId: "GPA.RECON-1",
    originalTransactionId: null,
    credentialFingerprint: "abc",
    encryptedPurchaseCredential: {
      ciphertext: "cipher",
      keyVersion: "1",
      algorithm: "TEST",
    },
    invalidatedCredentialFingerprints: [],
    lastReconciledAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

async function seedPending(store: MemoryBillingStore) {
  await ensureReconciliationWorkItem(store, {
    id: QUEUE_ID,
    reason: "live_subscription_unavailable",
    platform: "android",
    financialEventId: EVENT_ID,
    credentialFingerprint: "abc",
    nowMs: NOW,
  });
  store.docs.set(financialLedgerPath(sanitizeDocId(EVENT_ID)), ledgerDoc() as unknown as Record<string, unknown>);
  store.docs.set(companyBillingPath(UID), companyDoc() as unknown as Record<string, unknown>);
}

function queue(): string {
  return billingReconciliationQueuePath(sanitizeDocId(QUEUE_ID));
}

async function main() {
  assert.equal(reconciliationBackoffMs(0), 30_000);
  assert.equal(reconciliationBackoffMs(1), 60_000);
  assert.ok(reconciliationBackoffMs(20) <= 15 * 60_000);

  {
    const store = new MemoryBillingStore();
    await seedPending(store);
    const a = await claimReconciliationWorkItem(store, { id: QUEUE_ID, workerId: "w1", nowMs: NOW });
    const b = await claimReconciliationWorkItem(store, { id: QUEUE_ID, workerId: "w2", nowMs: NOW });
    assert.equal(a.claimed, true);
    assert.equal(b.claimed, false);
    const stale = await claimReconciliationWorkItem(store, {
      id: QUEUE_ID,
      workerId: "w2",
      nowMs: NOW + 61_000,
    });
    assert.equal(stale.claimed, true);
  }

  {
    const store = new MemoryBillingStore();
    await seedPending(store);
    const calls: StoreRevalidateInput[] = [];
    const claimed = await claimReconciliationWorkItem(store, {
      id: QUEUE_ID,
      workerId: "w1",
      nowMs: NOW,
    });
    assert.ok(claimed.doc);
    const result = await processClaimedReconciliationItem(store, {
      id: QUEUE_ID,
      workerId: "w1",
      nowMs: NOW,
      claimed: claimed.doc!,
      revalidate: async (input) => {
        calls.push(input);
        return { kind: "verified", resultSummary: "ok" };
      },
    });
    assert.equal(result.outcome, "resolved");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.uid, UID);
    assert.equal(calls[0]?.platform, "android");
    assert.equal(calls[0]?.reason, "live_subscription_unavailable");
    const doc = store.docs.get(queue()) as BillingReconciliationQueueDoc;
    assert.equal(doc.status, "resolved");
  }

  {
    const store = new MemoryBillingStore();
    await seedPending(store);
    store.docs.delete(companyBillingPath(UID));
    store.docs.set(companyBillingPath(UID), {
      ...companyDoc(),
      encryptedPurchaseCredential: null,
      credentialFingerprint: null,
    } as unknown as Record<string, unknown>);
    let calls = 0;
    const claimed = await claimReconciliationWorkItem(store, {
      id: QUEUE_ID,
      workerId: "w1",
      nowMs: NOW,
    });
    const result = await processClaimedReconciliationItem(store, {
      id: QUEUE_ID,
      workerId: "w1",
      nowMs: NOW,
      claimed: claimed.doc!,
      revalidate: async () => {
        calls += 1;
        return { kind: "verified", resultSummary: "should-not-run" };
      },
    });
    assert.equal(result.outcome, "terminal");
    assert.equal(result.reason, "missing_credentials");
    assert.equal(calls, 0);
  }

  {
    const store = new MemoryBillingStore();
    await seedPending(store);
    store.docs.delete(financialLedgerPath(sanitizeDocId(EVENT_ID)));
    const claimed = await claimReconciliationWorkItem(store, {
      id: QUEUE_ID,
      workerId: "w1",
      nowMs: NOW,
    });
    const result = await processClaimedReconciliationItem(store, {
      id: QUEUE_ID,
      workerId: "w1",
      nowMs: NOW,
      claimed: claimed.doc!,
      revalidate: async () => ({ kind: "verified", resultSummary: "no" }),
    });
    assert.equal(result.outcome, "terminal");
    assert.equal(result.reason, "missing_ledger");
  }

  {
    const store = new MemoryBillingStore();
    await seedPending(store);
    const claimed = await claimReconciliationWorkItem(store, {
      id: QUEUE_ID,
      workerId: "w1",
      nowMs: NOW,
    });
    const result = await processClaimedReconciliationItem(store, {
      id: QUEUE_ID,
      workerId: "w1",
      nowMs: NOW,
      claimed: claimed.doc!,
      revalidate: async () => {
        throw new BillingError({
          clientCode: "temporary_unavailable",
          causeCode: "play_unavailable",
          retryable: true,
        });
      },
    });
    assert.equal(result.outcome, "retryable");
    const doc = store.docs.get(queue()) as BillingReconciliationQueueDoc;
    assert.equal(doc.status, "failed_retryable");
    assert.ok((doc.nextAttemptAt ?? 0) > NOW);
    const tooSoon = await claimReconciliationWorkItem(store, {
      id: QUEUE_ID,
      workerId: "w2",
      nowMs: NOW + 1,
    });
    assert.equal(tooSoon.claimed, false);
  }

  {
    const store = new MemoryBillingStore();
    await seedPending(store);
    const claimed = await claimReconciliationWorkItem(store, {
      id: QUEUE_ID,
      workerId: "w1",
      nowMs: NOW,
    });
    await markReconciliationRetryable(store, {
      id: QUEUE_ID,
      workerId: "w1",
      nowMs: NOW,
      errorCode: "x",
    });
    await operatorRequeueReconciliationWorkItem(store, { id: QUEUE_ID, nowMs: NOW + 5 });
    const doc = store.docs.get(queue()) as BillingReconciliationQueueDoc;
    assert.equal(doc.status, "pending");
    assert.equal(doc.nextAttemptAt, NOW + 5);
    assert.equal(remainingAttemptBudget(doc), RECONCILIATION_MAX_ATTEMPTS);
  }

  {
    const store = new MemoryBillingStore();
    await seedPending(store);
    const disabled = await runBillingReconciliationTick({
      enabled: false,
      store,
      scanner: memoryReconciliationScanner(store),
      revalidate: async () => ({ kind: "verified", resultSummary: "no" }),
      nowMs: () => NOW,
      workerId: "sched",
    });
    assert.equal(disabled.claimed, 0);
    const enabled = await runBillingReconciliationTick({
      enabled: true,
      store,
      scanner: memoryReconciliationScanner(store),
      revalidate: async () => ({ kind: "verified", resultSummary: "ok" }),
      nowMs: () => NOW,
      workerId: "sched",
    });
    assert.equal(enabled.claimed, 1);
    assert.equal(enabled.resolved, 1);
  }

  {
    const store = new MemoryBillingStore();
    await seedPending(store);
    const first = await runBillingReconciliationTick({
      enabled: true,
      store,
      scanner: memoryReconciliationScanner(store),
      revalidate: async () => ({ kind: "verified", resultSummary: "ok" }),
      nowMs: () => NOW,
      workerId: "a",
    });
    const second = await runBillingReconciliationTick({
      enabled: true,
      store,
      scanner: memoryReconciliationScanner(store),
      revalidate: async () => {
        throw new Error("duplicate must not re-grant");
      },
      nowMs: () => NOW,
      workerId: "b",
    });
    assert.equal(first.resolved, 1);
    assert.equal(second.claimed, 0);
  }

  {
    const store = new MemoryBillingStore();
    await seedPending(store);
    const first = await claimReconciliationWorkItem(store, {
      id: QUEUE_ID,
      workerId: "scheduler:rev1:inv-a",
      nowMs: NOW,
    });
    const sameRevision = await claimReconciliationWorkItem(store, {
      id: QUEUE_ID,
      workerId: "scheduler:rev1:inv-b",
      nowMs: NOW + 1,
    });
    const sameWorker = await claimReconciliationWorkItem(store, {
      id: QUEUE_ID,
      workerId: "scheduler:rev1:inv-a",
      nowMs: NOW + 1,
    });
    assert.equal(first.claimed, true);
    assert.equal(sameRevision.claimed, false);
    assert.equal(sameWorker.claimed, false);
  }

  {
    const store = new MemoryBillingStore();
    await seedPending(store);
    const oldHold = deferred<{ kind: "verified"; resultSummary: string }>();
    const oldClaim = await claimReconciliationWorkItem(store, {
      id: QUEUE_ID,
      workerId: "old",
      nowMs: NOW,
    });
    const oldWork = processClaimedReconciliationItem(store, {
      id: QUEUE_ID,
      workerId: "old",
      nowMs: () => NOW + 90_000,
      claimed: oldClaim.doc!,
      revalidate: async () => oldHold.promise,
    });
    const fresh = await claimReconciliationWorkItem(store, {
      id: QUEUE_ID,
      workerId: "new",
      nowMs: NOW + 61_000,
    });
    assert.equal(fresh.claimed, true);
    oldHold.resolve({ kind: "verified", resultSummary: "late" });
    const oldResult = await oldWork;
    assert.equal(oldResult.outcome, "stale");
    const doc = store.docs.get(queue()) as BillingReconciliationQueueDoc;
    assert.equal(doc.status, "leased");
    assert.equal(doc.leaseOwner, "new");
    const completeOld = await completeClaimedReconciliationWorkItem(store, {
      id: QUEUE_ID,
      workerId: "old",
      platform: "android",
      financialEventId: EVENT_ID,
      nowMs: NOW + 90_000,
    });
    assert.equal(completeOld.completed, false);
    assert.equal(completeOld.reason, "stale_lease");
  }

  {
    const store = new MemoryBillingStore();
    await seedPending(store);
    const claimed = await claimReconciliationWorkItem(store, {
      id: QUEUE_ID,
      workerId: "w1",
      nowMs: NOW,
    });
    const refused = await operatorRequeueReconciliationWorkItem(store, {
      id: QUEUE_ID,
      nowMs: NOW + 1,
    });
    assert.equal(refused.refused, "active_lease");
    assert.equal(claimed.doc?.status, "leased");
  }

  {
    const store = new MemoryBillingStore();
    await seedPending(store);
    for (let i = 0; i < RECONCILIATION_MAX_ATTEMPTS; i++) {
      const claimed = await claimReconciliationWorkItem(store, {
        id: QUEUE_ID,
        workerId: `w${i}`,
        nowMs: NOW + i * 20 * 60_000,
      });
      if (claimed.claimed) {
        await markReconciliationRetryable(store, {
          id: QUEUE_ID,
          workerId: `w${i}`,
          nowMs: NOW + i * 20 * 60_000,
          errorCode: "play_unavailable",
        });
      }
    }
    const exhausted = await claimReconciliationWorkItem(store, {
      id: QUEUE_ID,
      workerId: "after",
      nowMs: NOW + RECONCILIATION_MAX_ATTEMPTS * 20 * 60_000,
    });
    assert.equal(exhausted.claimed, false);
    assert.equal(exhausted.doc?.status, "terminal");
    const recovered = await operatorRequeueReconciliationWorkItem(store, {
      id: QUEUE_ID,
      nowMs: NOW + RECONCILIATION_MAX_ATTEMPTS * 20 * 60_000 + 1,
    });
    assert.equal(recovered.changed, true);
    const after = store.docs.get(queue()) as BillingReconciliationQueueDoc;
    assert.equal(after.status, "pending");
    assert.equal(after.attemptCount, RECONCILIATION_MAX_ATTEMPTS);
    assert.equal(remainingAttemptBudget(after), RECONCILIATION_MAX_ATTEMPTS);
    const reclaim = await claimReconciliationWorkItem(store, {
      id: QUEUE_ID,
      workerId: "operator-retry",
      nowMs: NOW + RECONCILIATION_MAX_ATTEMPTS * 20 * 60_000 + 1,
    });
    assert.equal(reclaim.claimed, true);
  }

  {
    const store = new MemoryBillingStore();
    await seedPending(store);
    const tick = await runBillingReconciliationTick({
      enabled: true,
      store,
      scanner: memoryReconciliationScanner(store),
      revalidate: async () => ({
        kind: "configuration_disabled",
        resultSummary: "play_billing_disabled",
      }),
      nowMs: () => NOW,
      workerId: "cfg",
    });
    assert.equal(tick.claimed, 1);
    assert.equal(tick.configuration_disabled, 1);
    const doc = store.docs.get(queue()) as BillingReconciliationQueueDoc;
    assert.equal(doc.status, "pending");
    assert.equal(doc.terminalReason, null);
    assert.equal(remainingAttemptBudget(doc), RECONCILIATION_MAX_ATTEMPTS);
  }

  {
    const store = new MemoryBillingStore();
    await seedPending(store);
    const tick = await runBillingReconciliationTick({
      enabled: true,
      store,
      scanner: memoryReconciliationScanner(store),
      revalidate: async () => ({ kind: "pending", resultSummary: "pending" }),
      nowMs: () => NOW,
      workerId: "pend",
    });
    assert.equal(tick.pending, 1);
    assert.equal((store.docs.get(queue()) as BillingReconciliationQueueDoc).status, "failed_retryable");
  }

  {
    const pages: Array<Array<{ id: string; status: string; nextAttemptAt?: number }>> = [
      Array.from({ length: 40 }, (_, i) => ({
        id: `early-${i}`,
        status: "pending",
        nextAttemptAt: NOW + 60_000,
      })),
      [{ id: QUEUE_ID, status: "pending", nextAttemptAt: NOW }],
    ];
    const ids = await collectDueReconciliationIds({
      nowMs: NOW,
      limit: 10,
      pageSize: 40,
      maxPages: 8,
      readPage: async (page) => pages[page] ?? [],
    });
    assert.equal(ids.includes(QUEUE_ID), true);
  }

  {
    const a = newReconciliationInvocationId("rev");
    const b = newReconciliationInvocationId("rev");
    assert.notEqual(a, b);
    assert.match(a, /^scheduler:rev:/);
  }

  console.log("reconciliationConsumer.unit.test.ts: ok");
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
