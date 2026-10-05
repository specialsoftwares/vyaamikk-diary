/**
 * INJECTED — G1 first-issuance quota in the same register transaction.
 * Label: INJECTED_PORT. Not emulator. Not live deploy.
 */
import assert from "node:assert/strict";

import { freezeCommand } from "../../src/goodsEvidence/command";
import { sampleRegisterBody } from "../../src/goodsEvidence/testFixtures";
import { GoodsEvidenceRegisterAdapter } from "./adapter";
import { fixedClock } from "./harness";
import { createInjectedStore, seedInjectedOwner } from "./injectedStore";
import { commandPath, receiptPath, subscriptionStatusPath, usageCurrentPath } from "./paths";
import { GRIN_USAGE_COLLECTION, decideGrinIssuanceQuota, nextGrinUsageWrite } from "./quota";
import { nextUsageWrite, readUsageSnapshot } from "../../src/billing/optionC/usageTransition";

const NOW = Date.UTC(2026, 8, 28, 12, 0, 0, 0);
const OWNER = "owner_quota";
const LEDGER = "ledger_quota";

function envelope(commandId: string, receiptId: string) {
  const frozen = freezeCommand({
    commandId,
    type: "registerGoodsReceipt",
    ownerUid: OWNER,
    ledgerId: LEDGER,
    body: sampleRegisterBody({ receiptId }),
  });
  return {
    commandId: frozen.commandId,
    type: frozen.type,
    ownerUid: frozen.ownerUid,
    ledgerId: frozen.ledgerId,
    body: frozen.body,
    digest: frozen.digest,
  };
}

function persist(data: Record<string, unknown>): string {
  return JSON.stringify(data);
}

function seedStatus(
  store: ReturnType<typeof createInjectedStore>,
  data: Record<string, unknown>
): void {
  store.snapshot.set(subscriptionStatusPath(OWNER), persist(data));
}

async function main(): Promise<void> {
  {
    const a = nextGrinUsageWrite({
      existing: null,
      monthKey: "2026-09",
      cap: 25,
      recordId: "r1",
      updatedAt: 1,
    });
    const b = nextUsageWrite({
      existing: null,
      monthKey: "2026-09",
      cap: 25,
      collection: "goodsEvidenceReceipts",
      recordId: "r1",
      updatedAt: 1,
    });
    assert.equal(a.kind, "write");
    if (a.kind === "write") {
      assert.equal(a.doc.recordsThisMonth, b.recordsThisMonth);
      assert.equal(a.doc.lastRecordCollection, GRIN_USAGE_COLLECTION);
    }
  }

  {
    const store = createInjectedStore();
    seedInjectedOwner(store, OWNER, LEDGER);
    const adapter = new GoodsEvidenceRegisterAdapter(store, fixedClock(NOW));
    const first = await adapter.register({ uid: OWNER }, envelope("command_q01", "receipt_q01"));
    assert.equal(first.ok, true);
    assert.equal(store.snapshot.has(usageCurrentPath(OWNER)), false, "status missing → enforcement off");
  }

  {
    const store = createInjectedStore();
    seedInjectedOwner(store, OWNER, LEDGER);
    seedStatus(store, {
      entitlementActive: true,
      plan: "starter",
      quotaEnforcementEnabled: false,
    });
    const adapter = new GoodsEvidenceRegisterAdapter(store, fixedClock(NOW));
    const first = await adapter.register({ uid: OWNER }, envelope("command_q02", "receipt_q02"));
    assert.equal(first.ok, true);
    assert.equal(store.snapshot.has(usageCurrentPath(OWNER)), false);
  }

  {
    const store = createInjectedStore();
    seedInjectedOwner(store, OWNER, LEDGER);
    seedStatus(store, {
      entitlementActive: true,
      plan: "free",
      quotaEnforcementEnabled: true,
    });
    const adapter = new GoodsEvidenceRegisterAdapter(store, fixedClock(NOW));
    const first = await adapter.register({ uid: OWNER }, envelope("command_q03", "receipt_q03"));
    assert.equal(first.ok, true);
    const usage = JSON.parse(store.snapshot.get(usageCurrentPath(OWNER))!) as {
      recordsThisMonth: number;
      lastRecordCollection: string;
      lastRecordId: string;
    };
    assert.equal(usage.recordsThisMonth, 1);
    assert.equal(usage.lastRecordCollection, "goodsEvidenceReceipts");
    assert.equal(usage.lastRecordId, "receipt_q03");
    const replay = await adapter.register({ uid: OWNER }, envelope("command_q03", "receipt_q03"));
    assert.equal(replay.ok, true);
    if (replay.ok) assert.equal(replay.replayed, true);
    const usageAfter = JSON.parse(store.snapshot.get(usageCurrentPath(OWNER))!) as {
      recordsThisMonth: number;
    };
    assert.equal(usageAfter.recordsThisMonth, 1, "idempotent register must not increment");
  }

  {
    const store = createInjectedStore();
    seedInjectedOwner(store, OWNER, LEDGER);
    seedStatus(store, {
      entitlementActive: true,
      plan: "free",
      quotaEnforcementEnabled: true,
    });
    store.snapshot.set(
      usageCurrentPath(OWNER),
      persist({
        monthKey: "2026-09",
        recordsThisMonth: 25,
        lastRecordCollection: "entries",
        lastRecordId: "en-25",
        updatedAt: NOW,
      })
    );
    const adapter = new GoodsEvidenceRegisterAdapter(store, fixedClock(NOW));
    const writes = store.appliedWrites;
    const denied = await adapter.register({ uid: OWNER }, envelope("command_q04", "receipt_q04"));
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.code, "quota_exhausted");
    assert.equal(store.snapshot.has(receiptPath(OWNER, LEDGER, "receipt_q04")), false);
    assert.equal(store.snapshot.has(commandPath(OWNER, LEDGER, "command_q04")), false);
    assert.equal(store.appliedWrites, writes);
  }

  {
    const store = createInjectedStore();
    seedInjectedOwner(store, OWNER, LEDGER);
    seedStatus(store, {
      entitlementActive: true,
      plan: "professional",
      quotaEnforcementEnabled: true,
    });
    store.snapshot.set(
      usageCurrentPath(OWNER),
      persist({
        monthKey: "2026-09",
        recordsThisMonth: 500,
        lastRecordCollection: "purchaseOrders",
        lastRecordId: "po-500",
        updatedAt: NOW,
      })
    );
    const adapter = new GoodsEvidenceRegisterAdapter(store, fixedClock(NOW));
    const ok = await adapter.register({ uid: OWNER }, envelope("command_q05", "receipt_q05"));
    assert.equal(ok.ok, true);
    const usage = JSON.parse(store.snapshot.get(usageCurrentPath(OWNER))!) as { recordsThisMonth: number };
    assert.equal(usage.recordsThisMonth, 501);
  }

  {
    const store = createInjectedStore();
    seedInjectedOwner(store, OWNER, LEDGER);
    seedStatus(store, {
      entitlementActive: true,
      plan: "starter",
      quotaEnforcementEnabled: true,
    });
    store.snapshot.set(
      usageCurrentPath(OWNER),
      persist({
        monthKey: "2026-09",
        recordsThisMonth: 1.5,
        lastRecordCollection: "entries",
        lastRecordId: "en-x",
        updatedAt: NOW,
      })
    );
    const adapter = new GoodsEvidenceRegisterAdapter(store, fixedClock(NOW));
    const denied = await adapter.register({ uid: OWNER }, envelope("command_q06", "receipt_q06"));
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.code, "quota_state_invalid");
    assert.equal(store.snapshot.has(receiptPath(OWNER, LEDGER, "receipt_q06")), false);
  }

  {
    const store = createInjectedStore();
    seedInjectedOwner(store, OWNER, LEDGER);
    store.throwOnGet.set(subscriptionStatusPath(OWNER), new Error("status_read_failed"));
    const adapter = new GoodsEvidenceRegisterAdapter(store, fixedClock(NOW));
    await assert.rejects(
      () => adapter.register({ uid: OWNER }, envelope("command_q07", "receipt_q07")),
      /status_read_failed/
    );
    assert.equal(store.snapshot.has(receiptPath(OWNER, LEDGER, "receipt_q07")), false);
  }

  {
    const store = createInjectedStore();
    seedInjectedOwner(store, OWNER, LEDGER);
    seedStatus(store, {
      entitlementActive: false,
      entitlementReason: "subscriptionExpired",
      currentPeriodEnd: NOW - 1000,
      quotaEnforcementEnabled: true,
      plan: "starter",
    });
    const adapter = new GoodsEvidenceRegisterAdapter(store, fixedClock(NOW));
    const denied = await adapter.register({ uid: OWNER }, envelope("command_q08", "receipt_q08"));
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.code, "policy_denied");
    assert.equal(store.snapshot.has(receiptPath(OWNER, LEDGER, "receipt_q08")), false);
  }

  {
    const store = createInjectedStore();
    seedInjectedOwner(store, OWNER, LEDGER);
    seedStatus(store, {
      entitlementActive: true,
      plan: "starter",
      quotaEnforcementEnabled: true,
    });
    const adapter = new GoodsEvidenceRegisterAdapter(store, fixedClock(NOW));
    const first = await adapter.register({ uid: OWNER }, envelope("command_q09", "receipt_q09"));
    assert.equal(first.ok, true);
    store.failNextCommit = true;
    store.failCommitError = new Error("injected_commit_rejected");
    const before = store.snapshot.get(usageCurrentPath(OWNER));
    await assert.rejects(() => adapter.register({ uid: OWNER }, envelope("command_q10", "receipt_q10")));
    assert.equal(store.snapshot.get(usageCurrentPath(OWNER)), before);
    assert.equal(store.snapshot.has(receiptPath(OWNER, LEDGER, "receipt_q10")), false);
  }

  {
    const snap = readUsageSnapshot({
      monthKey: "2026-09",
      recordsThisMonth: 2,
      lastRecordCollection: "goodsEvidenceReceipts",
      lastRecordId: "receipt_q03",
    });
    assert.equal(snap?.lastRecordCollection, "goodsEvidenceReceipts");
    const decision = decideGrinIssuanceQuota({
      statusExists: false,
      statusData: undefined,
      usageRaw: undefined,
      recordId: "x",
      nowMs: NOW,
    });
    assert.equal(decision.kind, "enforcement_off");
  }

  console.log("quota.injected.unit.test.ts: ok (INJECTED_PORT)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
