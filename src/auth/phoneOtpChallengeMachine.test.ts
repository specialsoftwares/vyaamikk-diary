import assert from "node:assert/strict";

import {
  beginPhoneOtpSend,
  beginPhoneOtpVerify,
  completePhoneOtpSend,
  createPhoneOtpChallengeMachine,
  failPhoneOtpSend,
  finishPhoneOtpVerify,
  isCurrentPhoneChallenge,
  retirePhoneChallenge,
} from "./phoneOtpChallengeMachine";

function testSendStartsOncePerTap() {
  const idle = createPhoneOtpChallengeMachine();
  const first = beginPhoneOtpSend(idle);
  assert.ok(first);
  assert.equal(first!.generation, 1);
  assert.equal(first!.sendLocked, true);
  const second = beginPhoneOtpSend(first!);
  assert.equal(second, null, "duplicate Continue while sending ignored");
}

function testGenerationIncrementsAndStaleIgnored() {
  let m = createPhoneOtpChallengeMachine();
  m = beginPhoneOtpSend(m)!;
  const gen1 = m.generation;
  m = completePhoneOtpSend(m, gen1, "vid_1")!;
  m = beginPhoneOtpSend(m)!;
  const gen2 = m.generation;
  assert.equal(gen2, 2);
  assert.equal(completePhoneOtpSend(m, gen1, "vid_stale"), null);
  assert.equal(failPhoneOtpSend(m, gen1), null);
  assert.equal(isCurrentPhoneChallenge(m, gen1), false);
  assert.equal(isCurrentPhoneChallenge(m, gen2), true);
  m = completePhoneOtpSend(m, gen2, "vid_2")!;
  assert.equal(m.verificationId, "vid_2");
}

function testVerifyOnceAndStaleCallback() {
  let m = createPhoneOtpChallengeMachine();
  m = beginPhoneOtpSend(m)!;
  m = completePhoneOtpSend(m, m.generation, "vid")!;
  const gen = m.generation;
  const locked = beginPhoneOtpVerify(m, gen);
  assert.ok(locked);
  assert.equal(beginPhoneOtpVerify(locked!, gen), null, "OTP verify starts exactly once");
  assert.equal(beginPhoneOtpVerify(locked!, gen + 1), null);
  const finished = finishPhoneOtpVerify(locked!, gen);
  assert.ok(finished);
  assert.equal(finished!.verifyLocked, false);
}

function testResendRetiresOld() {
  let m = createPhoneOtpChallengeMachine();
  m = beginPhoneOtpSend(m)!;
  m = completePhoneOtpSend(m, 1, "old")!;
  const retired = retirePhoneChallenge(m);
  assert.equal(retired.generation, 2);
  assert.equal(retired.verificationId, null);
  assert.equal(isCurrentPhoneChallenge(retired, 1), false);
}

testSendStartsOncePerTap();
testGenerationIncrementsAndStaleIgnored();
testVerifyOnceAndStaleCallback();
testResendRetiresOld();
console.log("phoneOtpChallengeMachine.test.ts: ok");
