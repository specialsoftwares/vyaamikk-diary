import assert from "node:assert/strict";

import { automaticRestorationAllowed, initialDeletionJob } from "./deletionJob";
import {
  deletionJobInputFromUser,
  DELETION_V2_ERASURE_MS,
  DELETION_V2_PROCESSING_ALLOWANCE_MS,
  DELETION_V2_REACTIVATION_MS,
  claimsFullErasure,
  delayedWriteMayRecreate,
  legacyErasureDeadline,
  newDeletionSchedule,
  preservedGraceExpiresAt,
  restoredSnapshotMustBeSuppressed,
} from "./deletionPolicy";

const requestedAt = 1_700_000_000_000;
const legacyGrace = 45 * 24 * 60 * 60 * 1000;
const schedule = newDeletionSchedule(requestedAt);

assert.equal(schedule.deletionPolicyVersion, 2);
assert.equal(schedule.reactivationCutoff - requestedAt, DELETION_V2_REACTIVATION_MS);
assert.equal(schedule.erasureDeadline - requestedAt, DELETION_V2_ERASURE_MS);
assert.equal(schedule.erasureDeadline - schedule.reactivationCutoff, DELETION_V2_PROCESSING_ALLOWANCE_MS);
assert.equal(schedule.deletionScheduledFor, schedule.reactivationCutoff);
assert.ok(schedule.reactivationCutoff < schedule.erasureDeadline);

const storedLegacy = requestedAt + legacyGrace;
assert.equal(
  legacyErasureDeadline({ deletionRequestedAt: requestedAt, deletionScheduledFor: storedLegacy }),
  storedLegacy
);
assert.equal(
  legacyErasureDeadline({ deletionRequestedAt: requestedAt }),
  requestedAt + legacyGrace
);
assert.notEqual(
  legacyErasureDeadline({ deletionRequestedAt: requestedAt }),
  requestedAt + DELETION_V2_ERASURE_MS
);

assert.equal(preservedGraceExpiresAt(1, storedLegacy, requestedAt + DELETION_V2_ERASURE_MS), storedLegacy);
const v2Grace = schedule.reactivationCutoff;
assert.equal(preservedGraceExpiresAt(2, v2Grace, storedLegacy), v2Grace);

const awaiting = initialDeletionJob({
  uid: "u1",
  requestedAt,
  graceExpiresAt: schedule.reactivationCutoff,
  deletionPolicyVersion: 2,
  erasureDeadline: schedule.erasureDeadline,
  reactivationCutoff: schedule.reactivationCutoff,
  now: requestedAt,
});
assert.equal(automaticRestorationAllowed(awaiting, requestedAt + 1), true);
assert.equal(automaticRestorationAllowed({ ...awaiting, status: "ready" }, requestedAt + 1), false);
assert.equal(
  automaticRestorationAllowed(awaiting, schedule.reactivationCutoff),
  false
);

assert.equal(delayedWriteMayRecreate("deleted", "awaiting_grace"), false);
assert.equal(delayedWriteMayRecreate("active", "completed"), false);
assert.equal(delayedWriteMayRecreate("active", "awaiting_grace"), true);
assert.equal(restoredSnapshotMustBeSuppressed("u1", { uid: "u1", generation: 3 }), true);
assert.equal(restoredSnapshotMustBeSuppressed("u2", { uid: "u1", generation: 3 }), false);
assert.equal(claimsFullErasure({ status: "completed", processorDeletion: "incomplete" }), false);
assert.equal(claimsFullErasure({ status: "needs_manual_review", processorDeletion: "failed" }), false);

const serverNow = 5_000_000_000_000;
const forgedClock = deletionJobInputFromUser(
  { status: "pending_deletion", deletionRequestedAt: 1, erasureDeadline: 2 },
  serverNow
);
assert.equal(forgedClock.stamp, true);
assert.equal(forgedClock.requestedAt, serverNow);
assert.equal(forgedClock.deletionPolicyVersion, 2);
assert.equal(forgedClock.reactivationCutoff - serverNow, DELETION_V2_REACTIVATION_MS);
assert.equal(forgedClock.erasureDeadline, serverNow + DELETION_V2_ERASURE_MS);

const stored = deletionJobInputFromUser(
  { deletionRequestedAt: requestedAt, deletionScheduledFor: storedLegacy },
  serverNow
);
assert.equal(stored.stamp, false);
assert.equal(stored.graceExpiresAt, storedLegacy);
assert.equal(stored.deletionPolicyVersion, 1);
assert.notEqual(stored.erasureDeadline, requestedAt + DELETION_V2_ERASURE_MS);

const kept = deletionJobInputFromUser(
  {
    deletionPolicyVersion: 2,
    deletionRequestedAt: requestedAt,
    deletionScheduledFor: schedule.reactivationCutoff,
    reactivationCutoff: schedule.reactivationCutoff,
    erasureDeadline: schedule.erasureDeadline,
  },
  serverNow
);
assert.equal(kept.stamp, false);
assert.equal(kept.requestedAt, requestedAt);
assert.equal(kept.erasureDeadline, schedule.erasureDeadline);

console.log("deletionPolicy.unit.test.ts: ok");
