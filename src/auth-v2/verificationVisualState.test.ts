import assert from "node:assert/strict";

import {
  minVerifyingRemainderMs,
  reduceVerificationVisual,
  verificationShowsActiveWait,
  verificationShowsSuccessCheck,
} from "./verificationVisualState";

let phase = reduceVerificationVisual("idle", "otp_submitted");
assert.equal(phase, "verifying");
assert.equal(verificationShowsActiveWait(phase), true);
assert.equal(verificationShowsSuccessCheck(phase), false);

phase = reduceVerificationVisual(phase, "otp_submitted");
assert.equal(phase, "verifying", "duplicate completion does not restart");

phase = reduceVerificationVisual(phase, "authoritative_success");
assert.equal(phase, "success");
assert.equal(verificationShowsSuccessCheck(phase), true);

phase = reduceVerificationVisual(phase, "authoritative_success");
assert.equal(phase, "success", "success transitions exactly once");

phase = reduceVerificationVisual(phase, "success_settled");
assert.equal(phase, "idle");

phase = reduceVerificationVisual("idle", "otp_submitted");
phase = reduceVerificationVisual(phase, "authoritative_failure");
assert.equal(phase, "failure");
assert.equal(verificationShowsSuccessCheck(phase), false);

assert.equal(
  reduceVerificationVisual("idle", "authoritative_success"),
  "idle",
  "no success before authoritative verifying wait"
);

assert.equal(
  minVerifyingRemainderMs({ startedAt: 0, now: 80, minVisibleMs: 300 }),
  220
);
assert.equal(
  minVerifyingRemainderMs({ startedAt: 0, now: 1400, minVisibleMs: 300 }),
  0,
  "slow verification is not padded"
);

console.log("verificationVisualState.test.ts: ok");
