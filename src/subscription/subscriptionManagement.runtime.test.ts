/**
 * Production runtime used by SubscriptionManagementScreen.
 * Boundary: inert runtime + deferred readers/savers. Not a mounted React tree.
 */
import assert from "node:assert/strict";

import { __setSubscriptionPurchaseEntryEnabledForTests } from "@/billing/iap/purchaseEntryGate";
import { emptyBillingDetails, type BillingDetailsRead } from "@/subscription/billingDetailsReader";
import { createSubscriptionManagementRuntime } from "@/subscription/subscriptionManagementRuntime";
import type { QuotaUsageRead } from "@/subscription/quotaUsageReader";
import type { BillingHistoryRead } from "@/subscription/billingHistoryReader";
import type { SyncSessionToken } from "@/sync/syncSessionOwnership";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function token(uid: string, generation: number): SyncSessionToken {
  return { uid, generation };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

async function main() {
  __setSubscriptionPurchaseEntryEnabledForTests(false);

  {
    const usageA = deferred<QuotaUsageRead>();
    const usageB = deferred<QuotaUsageRead>();
    let usageCalls = 0;
    const runtime = createSubscriptionManagementRuntime({
      readUsage: async () => {
        usageCalls += 1;
        return usageCalls === 1 ? usageA.promise : usageB.promise;
      },
      readHistory: async () => ({ kind: "ok", rows: [] }),
      readDetails: async (): Promise<BillingDetailsRead> => ({
        kind: "ok",
        details: { ...emptyBillingDetails(), billingRecipientName: "Live" },
      }),
      saveDetails: async () => ({ kind: "saved" }),
      restore: async () => ({ kind: "restored" }),
      openUrl: async () => true,
      presentUpgrade: () => ({ ok: true, visible: true, clientRecordId: null }),
    });

    runtime.setOwner(token("user-a", 1));
    runtime.setOwner(token("user-b", 2));
    usageA.resolve({ kind: "ok", monthKey: "2026-08", recordsThisMonth: 25 });
    await flush();
    usageB.resolve({ kind: "ok", monthKey: "2026-09", recordsThisMonth: 2 });
    await flush();
    const snap = runtime.snapshot();
    assert.equal(snap.ownerKey, "user-b#2");
    assert.equal(snap.usage?.kind === "ok" ? snap.usage.recordsThisMonth : -1, 2);
    assert.equal(snap.draft.billingRecipientName, "Live");
    runtime.dispose();
  }

  {
    const lateUsage = deferred<QuotaUsageRead>();
    let usageCalls = 0;
    const runtime = createSubscriptionManagementRuntime({
      readUsage: async () => {
        usageCalls += 1;
        if (usageCalls === 1) return lateUsage.promise;
        return { kind: "missing" };
      },
      readHistory: async (): Promise<BillingHistoryRead> => ({ kind: "ok", rows: [] }),
      readDetails: async () => ({ kind: "missing" }),
      saveDetails: async () => ({ kind: "saved" }),
      restore: async () => ({ kind: "restored" }),
      openUrl: async () => true,
      presentUpgrade: () => ({ ok: true, visible: true, clientRecordId: null }),
    });
    runtime.setOwner(token("same", 1));
    runtime.setDraft({
      billingRecipientName: "Retired draft",
      gstin: "",
      billingBusinessName: "",
      billingAddressLine1: "",
      billingAddressLine2: "",
      billingCity: "",
      billingPostalCode: "",
      billingStateCode: "",
    });
    runtime.setOwner(token("same", 2));
    assert.equal(runtime.snapshot().draft.billingRecipientName, "");
    assert.equal(runtime.snapshot().ownerKey, "same#2");
    lateUsage.resolve({ kind: "ok", monthKey: "2026-09", recordsThisMonth: 9 });
    await flush();
    const afterLate = runtime.snapshot();
    assert.equal(afterLate.ownerKey, "same#2");
    assert.equal(afterLate.usage?.kind, "missing");
    runtime.dispose();
  }

  {
    const saveHold = deferred<{ kind: "saved" }>();
    const runtime = createSubscriptionManagementRuntime({
      readUsage: async () => ({ kind: "missing" }),
      readHistory: async () => ({ kind: "ok", rows: [] }),
      readDetails: async () => ({ kind: "missing" }),
      saveDetails: async () => saveHold.promise,
      restore: async () => ({ kind: "restored" }),
      openUrl: async () => true,
      presentUpgrade: () => ({ ok: true, visible: true, clientRecordId: null }),
    });
    runtime.setOwner(token("acct", 1));
    await flush();
    const saveP = runtime.saveDetails();
    runtime.setOwner(token("acct", 2));
    assert.equal(runtime.snapshot().saving, false);
    saveHold.resolve({ kind: "saved" });
    await saveP;
    assert.equal(runtime.snapshot().ownerKey, "acct#2");
    runtime.dispose();
  }

  {
    const restoreHold = deferred<{ kind: string; message?: string }>();
    const runtime = createSubscriptionManagementRuntime({
      readUsage: async () => ({ kind: "missing" }),
      readHistory: async () => ({ kind: "ok", rows: [] }),
      readDetails: async () => ({ kind: "missing" }),
      saveDetails: async () => ({ kind: "saved" }),
      restore: async () => restoreHold.promise,
      openUrl: async () => true,
      presentUpgrade: () => ({ ok: true, visible: true, clientRecordId: null }),
    });
    runtime.setOwner(token("acct", 3));
    const restoreP = runtime.restore();
    runtime.dispose();
    restoreHold.resolve({ kind: "failed", message: "stale" });
    await restoreP;
    assert.equal(runtime.snapshot().restoring, false);
    assert.equal(runtime.snapshot().restoreError, null);
  }

  {
    const runtime = createSubscriptionManagementRuntime({
      readUsage: async () => ({ kind: "missing" }),
      readHistory: async () => ({ kind: "ok", rows: [] }),
      readDetails: async () => ({ kind: "missing" }),
      saveDetails: async () => ({ kind: "saved" }),
      restore: async () => ({ kind: "restored" }),
      openUrl: async () => true,
      presentUpgrade: () => ({ ok: true, visible: true, clientRecordId: null }),
      isPurchaseEntryEnabled: () => false,
    });
    runtime.setOwner(token("acct", 1));
    const closed = runtime.presentUpgrade(token("acct", 1));
    assert.equal(closed.ok, false);
    assert.equal(closed.ok === false && closed.reason, "purchase_entry_closed");
    runtime.dispose();
  }

  {
    const runtime = createSubscriptionManagementRuntime({
      readUsage: async () => ({ kind: "missing" }),
      readHistory: async () => ({ kind: "ok", rows: [] }),
      readDetails: async () => ({ kind: "missing" }),
      saveDetails: async () => {
        throw new Error("network");
      },
      restore: async () => {
        throw new Error("store");
      },
      openUrl: async () => {
        throw new Error("no play");
      },
      presentUpgrade: () => ({ ok: true, visible: true, clientRecordId: null }),
    });
    runtime.setOwner(token("acct", 1));
    await flush();
    await runtime.saveDetails();
    assert.equal(runtime.snapshot().saveError, "save_failed");
    await runtime.restore();
    assert.equal(runtime.snapshot().restoreError, "failed");
    await runtime.manage("https://play.google.com/store/account/subscriptions");
    assert.equal(runtime.snapshot().manageError, "manage_unavailable");
    runtime.dispose();
  }

  __setSubscriptionPurchaseEntryEnabledForTests(null);
  console.log("subscriptionManagement.runtime.test.ts: ok");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
