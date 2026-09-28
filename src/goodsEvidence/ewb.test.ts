import assert from "node:assert/strict";

import {
  appendQcEvent,
  emptyEwbHistories,
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

console.log("goodsEvidence/ewb.test.ts: ok");
