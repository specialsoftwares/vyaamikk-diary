/**
 * Reconciliation queue identity + AlreadyExists race recovery.
 * Run: npm run test:billing-reconciliation-queue
 */

import assert from "node:assert/strict";

import { BillingError } from "./errors";
import { billingReconciliationQueuePath, sanitizeDocId } from "./paths";
import { ensureReconciliationWorkItem } from "./reconciliationQueue";
import {
  AlreadyExistsError,
  MemoryBillingStore,
  type BillingStore,
  type BillingTransaction,
} from "./store";
import type { BillingReconciliationQueueDoc } from "./types";

const NOW = 1_800_000_000_000;
const QUEUE_ID = "android:refund-reconcile:GPA.QUEUE-RACE";

function isCause(code: string) {
  return (e: unknown) => e instanceof BillingError && e.causeCode === code;
}

function queueInput(financialEventId: string) {
  return {
    id: QUEUE_ID,
    reason: "live_subscription_unavailable",
    platform: "android" as const,
    financialEventId,
    nowMs: NOW,
  };
}

class AlreadyExistsThenInnerStore implements BillingStore {
  constructor(private readonly inner: MemoryBillingStore) {}
  private thrown = false;
  async runTransaction<T>(fn: (tx: BillingTransaction) => Promise<T>): Promise<T> {
    if (!this.thrown) {
      this.thrown = true;
      throw new AlreadyExistsError("forced-create-race");
    }
    return this.inner.runTransaction(fn);
  }
}

async function main() {
  // AlreadyExists recovery re-reads the winner and accepts matching identity.
  {
    const inner = new MemoryBillingStore();
    const path = billingReconciliationQueuePath(sanitizeDocId(QUEUE_ID));
    const winner: BillingReconciliationQueueDoc = {
      reason: "live_subscription_unavailable",
      platform: "android",
      financialEventId: "android:refund:GPA.QUEUE-RACE",
      credentialFingerprint: null,
      createdAt: NOW,
      updatedAt: NOW,
      resolvedAt: null,
      status: "pending",
      attemptCount: 0,
    };
    inner.docs.set(path, winner as unknown as Record<string, unknown>);
    const store = new AlreadyExistsThenInnerStore(inner);
    const result = await ensureReconciliationWorkItem(
      store,
      queueInput("android:refund:GPA.QUEUE-RACE")
    );
    assert.equal(result.created, false);
    assert.equal(
      (inner.docs.get(path) as BillingReconciliationQueueDoc).financialEventId,
      "android:refund:GPA.QUEUE-RACE"
    );
  }

  // AlreadyExists recovery rejects a mismatched winner identity.
  {
    const inner = new MemoryBillingStore();
    const path = billingReconciliationQueuePath(sanitizeDocId(QUEUE_ID));
    inner.docs.set(path, {
      reason: "live_subscription_unavailable",
      platform: "android",
      financialEventId: "android:refund:GPA.OTHER",
      credentialFingerprint: null,
      createdAt: NOW,
      updatedAt: NOW,
      resolvedAt: null,
      status: "pending",
      attemptCount: 0,
    });
    const store = new AlreadyExistsThenInnerStore(inner);
    await assert.rejects(
      ensureReconciliationWorkItem(store, queueInput("android:chargeback:GPA.QUEUE-RACE")),
      isCause("reconciliation_queue_identity_mismatch")
    );
    assert.equal(
      (inner.docs.get(path) as { financialEventId: string }).financialEventId,
      "android:refund:GPA.OTHER"
    );
  }

  // Missing winner after AlreadyExists also fails closed (no silent success).
  {
    const store = new AlreadyExistsThenInnerStore(new MemoryBillingStore());
    await assert.rejects(
      ensureReconciliationWorkItem(store, queueInput("android:refund:GPA.QUEUE-RACE")),
      isCause("reconciliation_queue_identity_mismatch")
    );
  }

  // Concurrent creates, different financialEventId: one winner, mismatching loser fails.
  {
    const store = new MemoryBillingStore();
    const settled = await Promise.allSettled([
      ensureReconciliationWorkItem(store, queueInput("android:refund:GPA.QUEUE-RACE")),
      ensureReconciliationWorkItem(store, queueInput("android:chargeback:GPA.QUEUE-RACE")),
    ]);
    const fulfilled = settled.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<{
      created: boolean;
    }>[];
    const rejected = settled.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1, `expected one create winner, got ${JSON.stringify(settled)}`);
    assert.equal(rejected.length, 1);
    assert.equal(fulfilled[0].value.created, true);
    const lost = (rejected[0] as PromiseRejectedResult).reason;
    assert.ok(lost instanceof BillingError);
    assert.equal(lost.causeCode, "reconciliation_queue_identity_mismatch");
    const docs = [...store.docs.entries()].filter(([k]) => k.startsWith("_billingReconciliationQueue/"));
    assert.equal(docs.length, 1);
    const only = docs[0][1] as BillingReconciliationQueueDoc;
    assert.ok(
      only.financialEventId === "android:refund:GPA.QUEUE-RACE" ||
        only.financialEventId === "android:chargeback:GPA.QUEUE-RACE"
    );
  }

  // Concurrent creates, same identity: one create, other idempotent created:false.
  {
    const store = new MemoryBillingStore();
    const settled = await Promise.allSettled([
      ensureReconciliationWorkItem(store, queueInput("android:refund:GPA.QUEUE-RACE")),
      ensureReconciliationWorkItem(store, queueInput("android:refund:GPA.QUEUE-RACE")),
    ]);
    assert.equal(
      settled.every((r) => r.status === "fulfilled"),
      true,
      `same-identity race must not error: ${JSON.stringify(settled)}`
    );
    const createdFlags = settled.map((r) =>
      r.status === "fulfilled" ? r.value.created : false
    );
    assert.equal(createdFlags.filter(Boolean).length, 1);
    assert.equal(createdFlags.filter((v) => v === false).length, 1);
    const docs = [...store.docs.values()] as BillingReconciliationQueueDoc[];
    assert.equal(docs.length, 1);
    assert.equal(docs[0].financialEventId, "android:refund:GPA.QUEUE-RACE");
    assert.equal(docs[0].platform, "android");
  }

  console.log("reconciliationQueue.unit.test.ts: ok");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
