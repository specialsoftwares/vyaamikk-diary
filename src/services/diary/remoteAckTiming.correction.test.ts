import assert from "node:assert/strict";

import { beginSaveAttempt, recordRemoteAckIfAccepted, resetSaveStageTimingsForTests } from "./saveStageTiming";

resetSaveStageTimingsForTests();
const attempt = beginSaveAttempt();
const stages: string[] = [];
const timer = {
  record(stage: string) {
    stages.push(stage);
  },
};

recordRemoteAckIfAccepted(false, 12, [timer, attempt]);
recordRemoteAckIfAccepted(true, 18, [timer, attempt]);
assert.deepEqual(stages, ["remote_ack"]);
assert.deepEqual(
  attempt.samples().map((sample) => sample.stage),
  ["remote_ack"]
);
assert.equal(attempt.samples()[0]?.durationMs, 18);
resetSaveStageTimingsForTests();
console.log("remoteAckTiming.correction.test.ts: ok");
