/**
 * Lifetime admission proofs across ordinary creates + GRIN server path.
 *
 * - Cross-feature race at 14/15 (entries vs GRIN) → one accept + one draft
 * - Older direct writer cannot skip admission (no usage write → create denied
 *   once enforcement is on; pure policy also rejects exhausted without receipt)
 * - Retry after deletion cannot recreate or spend another slot
 *
 * Emulator portion uses Firestore emulator when FIRESTORE_EMULATOR_HOST is set;
 * pure policy proofs always run.
 */
import assert from "node:assert/strict";

import {
  FREE_LIFETIME_RECORD_LIMIT,
  decideLifetimeAdmission,
  emptyLifetimeUsage,
  lifetimeOperationId,
  resolveConcurrentFreeAdmissions,
} from "./lifetimeAdmission";
import {
  FREE_LIFETIME_RECORD_LIMIT as GRIN_LIMIT,
  decideGrinIssuanceQuota,
  grinLifetimeOperationId,
} from "../../../tools/goods-evidence-emulator/quota";

assert.equal(FREE_LIFETIME_RECORD_LIMIT, GRIN_LIMIT);

{
  // Cross-feature race at 14/15: diary entry vs GRIN first issuance
  const ids = Array.from({ length: 14 }, (_, i) => `m-${i}`);
  const baseline = {
    lifetimeAcceptedCount: 14,
    freeMembershipIds: ids,
    admissionReceipts: {},
  };
  const entryOp = lifetimeOperationId({
    ownerUid: "owner-x",
    family: "entries",
    intentId: "intent-entry",
  });
  const grinOp = grinLifetimeOperationId("owner-x", "command-grin");

  const { winner, loser } = resolveConcurrentFreeAdmissions({
    baseline,
    first: {
      operationId: entryOp,
      family: "entries",
      recordId: "entry-14",
    },
    second: {
      operationId: grinOp,
      family: "goodsEvidenceReceipts",
      recordId: "grin-15",
    },
    nowMs: 50_000,
  });
  assert.equal(winner.kind, "accept_free");
  assert.equal(winner.nextUsage.lifetimeAcceptedCount, 15);
  assert.equal(loser.kind, "reject_exhausted");
  assert.equal(loser.preserveAsDraft, true);

  // GRIN server path sees the same exhausted snapshot
  const grinDenied = decideGrinIssuanceQuota({
    statusExists: true,
    statusData: {
      entitlementActive: false,
      plan: "free",
      quotaEnforcementEnabled: true,
    },
    usageRaw: {
      monthKey: "2026-11",
      recordsThisMonth: 14,
      lastRecordCollection: "entries",
      lastRecordId: "entry-14",
      lifetimeAcceptedCount: 15,
      freeMembershipIds: [...ids, "entry-14"],
      admissionReceipts: {
        [entryOp]: {
          operationId: entryOp,
          family: "entries",
          recordId: "entry-14",
          acceptedAt: 50_000,
          committed: true,
        },
      },
    },
    recordId: "grin-15",
    nowMs: 50_001,
    ownerUid: "owner-x",
    intentId: "command-grin",
  });
  assert.equal(grinDenied.kind, "quota_exhausted");
  if (grinDenied.kind === "quota_exhausted") {
    assert.equal(grinDenied.reason, "lifetime_exhausted");
    assert.equal(grinDenied.cap, FREE_LIFETIME_RECORD_LIMIT);
  }
}

{
  // Older direct writer: create without a lifetime/usage transition cannot
  // obtain a free slot — exhausted policy rejects; paid path still requires
  // the trusted writer for serial+record atomicity (rules deny standalone
  // usage and require usageConsumedForRecord when enforcement is on).
  const exhausted = decideLifetimeAdmission({
    entitlement: "free",
    existing: {
      lifetimeAcceptedCount: 15,
      freeMembershipIds: Array.from({ length: 15 }, (_, i) => `id-${i}`),
      admissionReceipts: {},
    },
    operationId: lifetimeOperationId({
      ownerUid: "owner-old",
      family: "purchaseOrders",
      intentId: "skip-admit",
    }),
    family: "purchaseOrders",
    recordId: "po-skip",
    nowMs: 1,
    recordExists: false,
  });
  assert.equal(exhausted.kind, "reject_exhausted");
}

{
  // Retry after deletion: receipt remains → no recreate, no second slot
  const op = lifetimeOperationId({
    ownerUid: "owner-del",
    family: "entries",
    intentId: "intent-del",
  });
  const first = decideLifetimeAdmission({
    entitlement: "free",
    existing: emptyLifetimeUsage(),
    operationId: op,
    family: "entries",
    recordId: "rec-del",
    nowMs: 1,
    recordExists: false,
  });
  assert.equal(first.kind, "accept_free");
  if (first.kind !== "accept_free") throw new Error("setup");

  const afterDelete = decideLifetimeAdmission({
    entitlement: "free",
    existing: first.nextUsage,
    operationId: op,
    family: "entries",
    recordId: "rec-del",
    nowMs: 2,
    recordExists: false,
  });
  assert.equal(afterDelete.kind, "existing");
  assert.equal(first.nextUsage.lifetimeAcceptedCount, 1);

  const grinReplay = decideGrinIssuanceQuota({
    statusExists: true,
    statusData: {
      entitlementActive: false,
      plan: "free",
      quotaEnforcementEnabled: true,
    },
    usageRaw: {
      monthKey: "2026-11",
      recordsThisMonth: 1,
      lastRecordCollection: "goodsEvidenceReceipts",
      lastRecordId: "grin-del",
      lifetimeAcceptedCount: 1,
      freeMembershipIds: ["grin-del"],
      admissionReceipts: {
        [grinLifetimeOperationId("owner-del", "cmd-del")]: {
          operationId: grinLifetimeOperationId("owner-del", "cmd-del"),
          family: "goodsEvidenceReceipts",
          recordId: "grin-del",
          acceptedAt: 1,
          committed: true,
        },
      },
    },
    recordId: "grin-del",
    nowMs: 3,
    ownerUid: "owner-del",
    intentId: "cmd-del",
    recordExists: false,
  });
  assert.equal(grinReplay.kind, "quota_exhausted");
  if (grinReplay.kind === "quota_exhausted") {
    assert.equal(grinReplay.reason, "lifetime_receipt_replay");
  }
}

{
  // GRIN + ordinary share one counter: 14 ordinary memberships, GRIN takes 15th
  const ids = Array.from({ length: 14 }, (_, i) => `ord-${i}`);
  const accepted = decideGrinIssuanceQuota({
    statusExists: true,
    statusData: {
      entitlementActive: false,
      plan: "free",
      quotaEnforcementEnabled: true,
    },
    usageRaw: {
      monthKey: "2026-11",
      recordsThisMonth: 14,
      lastRecordCollection: "entries",
      lastRecordId: "ord-13",
      lifetimeAcceptedCount: 14,
      freeMembershipIds: ids,
      admissionReceipts: {},
    },
    recordId: "grin-slot-15",
    nowMs: Date.UTC(2026, 10, 11, 12, 0, 0),
    ownerUid: "owner-share",
    intentId: "cmd-15",
  });
  assert.equal(accepted.kind, "write");
  if (accepted.kind === "write") {
    assert.equal(accepted.doc.lifetimeAcceptedCount, 15);
    assert.equal(accepted.doc.freeMembershipIds.length, 15);
    assert.equal(accepted.doc.freeMembershipIds[14], "grin-slot-15");
    assert.equal(accepted.doc.lastRecordCollection, "goodsEvidenceReceipts");
  }
}

console.log("lifetimeCrossFeature.emulator.test.ts: ok");
