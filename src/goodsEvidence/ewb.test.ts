import assert from "node:assert/strict";

import {
  appendMovementEvent,
  appendPortalObservation,
  appendQcEvent,
  emptyEwbHistories,
  latestCancellationEvidence,
  latestMovement,
  latestPortalStatus,
  latestQc,
  linkReplacement,
  recordArrival,
  recordPortalCancellation,
} from "./ewb";

const evidence = {
  reason: "vehicle breakdown before dispatch",
  goodsMoved: "no" as const,
  goodsMovedUnknownReason: null,
  linkedDocument: { kind: "invoice" as const, reference: "INV-1" },
  party: "supplier",
  amount: { kind: "present" as const, currency: "INR", minorUnits: 118000 },
  replacementEbn: { kind: "none" as const, reason: "not replaced" },
};

let histories = emptyEwbHistories();
const cancelled = recordPortalCancellation(
  histories,
  {
    observedAtUtc: "2026-09-28T10:00:00.000Z",
    source: "user_reported",
    verificationLevel: "user_reported",
  },
  evidence
);
assert.equal(cancelled.ok, true);
if (!cancelled.ok) throw new Error("expected cancel");
histories = cancelled.histories;
assert.equal(latestPortalStatus(histories), "cancelled");
const storedEvidence = histories.portal[0];
assert.equal(storedEvidence?.status, "cancelled");
if (storedEvidence?.status === "cancelled") {
  assert.equal(storedEvidence.evidence.reason, evidence.reason);
  assert.equal(storedEvidence.evidence.party, "supplier");
}
assert.equal(latestMovement(histories), null, "portal cancel does not move goods");
assert.equal(latestQc(histories), null);

const refused = recordPortalCancellation(histories, {
  observedAtUtc: "2026-09-28T10:01:00.000Z",
  source: "user_reported",
  verificationLevel: "user_reported",
}, { ...evidence, reason: "" });
assert.equal(refused.ok, false);

histories = recordArrival(histories, "2026-09-28T12:00:00.000Z", "gate inward");
assert.equal(latestMovement(histories), "arrived_received");
assert.equal(latestPortalStatus(histories), "cancelled", "delivery does not rewrite portal status");
assert.equal(histories.movementEvents.length, 1);

histories = appendQcEvent(histories, {
  atUtc: "2026-09-28T13:00:00.000Z",
  qc: "rejected",
  reason: "wet bags",
});
assert.equal(latestQc(histories), "rejected");
assert.equal(latestPortalStatus(histories), "cancelled");
assert.equal(latestMovement(histories), "arrived_received");
assert.equal(histories.qcEvents.length, 1);
assert.equal(latestCancellationEvidence(histories)?.reason, evidence.reason);

const callerEvent = {
  atUtc: "2026-09-28T14:00:00.000Z",
  movement: "in_transit" as const,
  reason: "left supplier",
};
histories = appendMovementEvent(histories, callerEvent);
callerEvent.reason = "mutated after append";
assert.equal(histories.movementEvents[1]?.reason, "left supplier");
assert.throws(() => {
  histories.movementEvents[1]!.reason = "frozen";
});
evidence.reason = "mutated evidence";
assert.equal(latestCancellationEvidence(histories)?.reason, "vehicle breakdown before dispatch");

{
  const emptyReason = { ...evidence, reason: "" };
  const generic = appendPortalObservation(emptyEwbHistories(), {
    observedAtUtc: "2026-09-28T10:00:00.000Z",
    source: "imported_document",
    verificationLevel: "imported_document",
    status: "cancelled",
    evidence: emptyReason,
  });
  assert.equal(generic.ok, true);
  if (!generic.ok) throw new Error("generic");
  assert.equal(generic.admission, "unvalidated_incomplete");
  assert.equal(latestPortalStatus(generic.histories), "cancellation_unvalidated");
  assert.equal(latestCancellationEvidence(generic.histories), null);
  assert.equal(latestMovement(generic.histories), null);
}

{
  const parsed = JSON.parse(
    JSON.stringify({
      observedAtUtc: "2026-09-28T10:00:00.000Z",
      source: "user_reported",
      verificationLevel: "user_reported",
      status: "cancelled",
      evidence: { reason: "", goodsMoved: "no", goodsMovedUnknownReason: null },
    })
  ) as unknown;
  const fromJson = appendPortalObservation(emptyEwbHistories(), parsed);
  assert.equal(fromJson.ok, true);
  if (!fromJson.ok) throw new Error("json");
  assert.equal(fromJson.admission, "unvalidated_incomplete");
  assert.notEqual(latestPortalStatus(fromJson.histories), "cancelled");
}

{
  const admitted = appendPortalObservation(emptyEwbHistories(), {
    observedAtUtc: "2026-09-28T10:00:00.000Z",
    source: "user_reported",
    verificationLevel: "user_reported",
    status: "cancelled",
    evidence,
  });
  assert.equal(admitted.ok, true);
  if (!admitted.ok) throw new Error("admitted");
  assert.equal(admitted.admission, "admitted");
  assert.equal(latestPortalStatus(admitted.histories), "cancelled");
}

{
  const active = appendPortalObservation(emptyEwbHistories(), {
    observedAtUtc: "2026-09-28T10:00:00.000Z",
    source: "user_reported",
    verificationLevel: "user_reported",
    status: "generated_active",
  });
  assert.equal(active.ok, true);
  if (!active.ok) throw new Error("active");
  assert.equal(latestPortalStatus(active.histories), "generated_active");
  const moved = appendMovementEvent(active.histories, {
    atUtc: "2026-09-28T11:00:00.000Z",
    movement: "in_transit",
    reason: "left yard",
  });
  const qced = appendQcEvent(moved, {
    atUtc: "2026-09-28T12:00:00.000Z",
    qc: "hold",
    reason: "awaiting sample",
  });
  const linked = linkReplacement(qced, {
    previousEbn: "111",
    newEbn: "222",
    reason: "portal replacement",
  });
  assert.equal(latestPortalStatus(linked), "generated_active");
  assert.equal(latestMovement(linked), "in_transit");
  assert.equal(latestQc(linked), "hold");
}

console.log("goodsEvidence/ewb.test.ts: ok");
