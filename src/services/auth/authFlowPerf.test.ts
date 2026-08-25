import assert from "node:assert/strict";

import {
  __resetAuthPerfForTests,
  authPerfDelta,
  authPerfMark,
} from "./authFlowPerf";

__resetAuthPerfForTests();
authPerfMark("T0_continue_tap");
authPerfMark("T4_otp_screen_requested");
const ms = authPerfDelta("T0_continue_tap", "T4_otp_screen_requested");
assert.ok(ms != null && ms >= 0);
__resetAuthPerfForTests();
assert.equal(authPerfDelta("T0_continue_tap", "T4_otp_screen_requested"), null);
console.log("authFlowPerf.test.ts: ok");
