import assert from "node:assert/strict";

import {
  emptyEwbHistories,
  latestPortalStatus,
  recordArrival,
  recordPortalCancellation,
  setQcIndependentOfPortal,
} from "./ewb";

let histories = emptyEwbHistories();
histories = recordPortalCancellation(histories, {
  observedAtUtc: "2026-09-28T10:00:00.000Z",
  source: "user_reported",
  verificationLevel: "user_reported",
});
assert.equal(latestPortalStatus(histories), "cancelled");
assert.equal(histories.movement, "planned", "portal cancel does not move goods");
assert.equal(histories.qc, null);

histories = recordArrival(histories);
assert.equal(histories.movement, "arrived_received");
assert.equal(latestPortalStatus(histories), "cancelled", "delivery does not rewrite portal status");

histories = setQcIndependentOfPortal(histories, "rejected");
assert.equal(histories.qc, "rejected");
assert.equal(latestPortalStatus(histories), "cancelled");
assert.equal(histories.movement, "arrived_received");

console.log("goodsEvidence/ewb.test.ts: ok");
