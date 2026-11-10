import assert from "node:assert/strict";

import {
  FREE_LIFETIME_RECORD_LIMIT,
  decideLifetimeAdmission,
  emptyLifetimeUsage,
  lifetimeOperationId,
  readLifetimeUsageSnapshot,
  resolveConcurrentFreeAdmissions,
  summarizeLifetimeCutoverDryRun,
} from "./lifetimeAdmission";

const opA = lifetimeOperationId({
  ownerUid: "owner-1",
  family: "entries",
  intentId: "intent-a",
});
const opB = lifetimeOperationId({
  ownerUid: "owner-1",
  family: "entries",
  intentId: "intent-b",
});

{
  assert.match(opA, /^owner-1:entries:intent-a$/);
  assert.notEqual(opA, opB);
}

{
  const empty = emptyLifetimeUsage();
  const decision = decideLifetimeAdmission({
    entitlement: "free",
    existing: empty,
    operationId: opA,
    family: "entries",
    recordId: "rec-1",
    nowMs: 1_000,
    recordExists: false,
  });
  assert.equal(decision.kind, "accept_free");
  if (decision.kind === "accept_free") {
    assert.equal(decision.nextUsage.lifetimeAcceptedCount, 1);
    assert.deepEqual(decision.nextUsage.freeMembershipIds, ["rec-1"]);
    assert.equal(decision.nextUsage.admissionReceipts[opA]?.committed, true);
  }
}

{
  // Retry after deletion cannot recreate or consume another slot
  const baseline = decideLifetimeAdmission({
    entitlement: "free",
    existing: emptyLifetimeUsage(),
    operationId: opA,
    family: "entries",
    recordId: "rec-1",
    nowMs: 1_000,
    recordExists: false,
  });
  assert.equal(baseline.kind, "accept_free");
  if (baseline.kind !== "accept_free") throw new Error("setup");
  // Record deleted from collection, but receipt remains:
  const retry = decideLifetimeAdmission({
    entitlement: "free",
    existing: baseline.nextUsage,
    operationId: opA,
    family: "entries",
    recordId: "rec-1",
    nowMs: 2_000,
    recordExists: false,
  });
  assert.equal(retry.kind, "existing");
  assert.equal(baseline.nextUsage.lifetimeAcceptedCount, 1);
  assert.equal(
    Object.keys(baseline.nextUsage.admissionReceipts).length,
    1,
    "receipt retained after delete"
  );
}

{
  // Paid path does not spend free membership
  const decision = decideLifetimeAdmission({
    entitlement: "paid",
    existing: {
      lifetimeAcceptedCount: 4,
      freeMembershipIds: ["a", "b", "c", "d"],
      admissionReceipts: {},
    },
    operationId: opA,
    family: "purchaseOrders",
    recordId: "po-9",
    nowMs: 3_000,
    recordExists: false,
  });
  assert.equal(decision.kind, "accept_paid");
  if (decision.kind === "accept_paid") {
    assert.equal(decision.nextUsage.lifetimeAcceptedCount, 4);
    assert.deepEqual(decision.nextUsage.freeMembershipIds, ["a", "b", "c", "d"]);
  }
}

{
  // Unknown entitlement → recoverable draft
  const decision = decideLifetimeAdmission({
    entitlement: "unknown",
    existing: emptyLifetimeUsage(),
    operationId: opA,
    family: "entries",
    recordId: "rec-1",
    nowMs: 1,
    recordExists: false,
  });
  assert.deepEqual(decision, {
    kind: "reject_unknown_entitlement",
    preserveAsDraft: true,
  });
}

{
  // At 14/15 two devices → one accept + one recoverable draft
  const ids = Array.from({ length: 14 }, (_, i) => `m-${i}`);
  const baseline = {
    lifetimeAcceptedCount: 14,
    freeMembershipIds: ids,
    admissionReceipts: {},
  };
  const { winner, loser } = resolveConcurrentFreeAdmissions({
    baseline,
    first: { operationId: opA, family: "entries", recordId: "rec-14" },
    second: { operationId: opB, family: "entries", recordId: "rec-15" },
    nowMs: 10_000,
  });
  assert.equal(winner.kind, "accept_free");
  assert.equal(winner.nextUsage.lifetimeAcceptedCount, 15);
  assert.equal(winner.nextUsage.freeMembershipIds.length, FREE_LIFETIME_RECORD_LIMIT);
  assert.equal(loser.kind, "reject_exhausted");
  assert.equal(loser.preserveAsDraft, true);
}

{
  // freeMembershipIds stays bounded
  const ids = Array.from({ length: 15 }, (_, i) => `m-${i}`);
  const decision = decideLifetimeAdmission({
    entitlement: "free",
    existing: {
      lifetimeAcceptedCount: 15,
      freeMembershipIds: ids,
      admissionReceipts: {},
    },
    operationId: opA,
    family: "goodsEvidenceReceipts",
    recordId: "grin-1",
    nowMs: 1,
    recordExists: false,
  });
  assert.equal(decision.kind, "reject_exhausted");
}

{
  const parsed = readLifetimeUsageSnapshot({
    lifetimeAcceptedCount: 2,
    freeMembershipIds: ["a", "b"],
    admissionReceipts: {
      [opA]: {
        operationId: opA,
        family: "entries",
        recordId: "a",
        acceptedAt: 1,
        committed: true,
      },
    },
  });
  assert.ok(parsed && !("malformed" in parsed));
  if (parsed && !("malformed" in parsed)) {
    assert.equal(parsed.lifetimeAcceptedCount, 2);
  }
}

{
  // Monthly-only legacy doc → empty lifetime (migration reads)
  const parsed = readLifetimeUsageSnapshot({
    monthKey: "2026-11",
    recordsThisMonth: 3,
    lastRecordCollection: "entries",
    lastRecordId: "x",
  });
  assert.deepEqual(parsed, emptyLifetimeUsage());
}

{
  const summary = summarizeLifetimeCutoverDryRun([
    { classification: "provable_history" },
    { classification: "provable_history" },
    { classification: "ambiguous_history" },
    { classification: "paid_active" },
    { classification: "empty" },
  ]);
  assert.equal(summary.enabledLive, false);
  assert.equal(summary.policy, "forward_only_proposal");
  assert.deepEqual(summary.counts, {
    provable_history: 2,
    ambiguous_history: 1,
    paid_active: 1,
    empty: 1,
  });
}

console.log("lifetimeAdmission.test.ts: ok");
