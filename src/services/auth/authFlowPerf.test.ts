import assert from "node:assert/strict";

import {
  __resetAuthPerfForTests,
  authPerfDelta,
  authPerfMark,
  beginPerfAttempt,
  perfSpansForAttempt,
  recordPerfSpan,
} from "./authFlowPerf";

__resetAuthPerfForTests();
authPerfMark("T0_continue_tap");
authPerfMark("T4_otp_screen_requested");
const ms = authPerfDelta("T0_continue_tap", "T4_otp_screen_requested");
assert.ok(ms != null && ms >= 0);
__resetAuthPerfForTests();
assert.equal(authPerfDelta("T0_continue_tap", "T4_otp_screen_requested"), null);

const first = beginPerfAttempt("phone_verify");
const second = beginPerfAttempt("phone_verify");
assert.notEqual(first.operationId, second.operationId);
assert.notEqual(first.attempt, second.attempt);
recordPerfSpan({
  ...first,
  stage: "token_cached",
  runtime: "native",
  durationMs: 4,
  outcome: "ok",
});
recordPerfSpan({
  ...second,
  stage: "token_forced",
  runtime: "native",
  durationMs: 9,
  outcome: "ok",
});
assert.equal(perfSpansForAttempt(first.operationId).length, 1);
assert.equal(perfSpansForAttempt(first.operationId)[0]?.stage, "token_cached");
assert.equal(perfSpansForAttempt(second.operationId)[0]?.durationMs, 9);
recordPerfSpan({
  ...first,
  stage: "delivery",
  runtime: "native",
  durationMs: Number.NaN,
  outcome: "unavailable",
});
assert.equal(perfSpansForAttempt(first.operationId).length, 1);

console.log("authFlowPerf.test.ts: ok");
