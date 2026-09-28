import assert from "node:assert/strict";

import {
  appendMovementEvent,
  appendQcEvent,
  emptyEwbHistories,
  latestCancellationEvidence,
  latestMovement,
  latestPortalStatus,
  latestQc,
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

console.log("goodsEvidence/ewb.test.ts: ok");
