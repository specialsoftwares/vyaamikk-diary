import assert from "node:assert/strict";

import {
  beginEmailOtpSend,
  canVerifyEmailOtp,
  completeEmailOtpSend,
  createEmailOtpSendMachine,
  failEmailOtpSend,
  isBackBlockedDuringEmailSend,
  setRetainedDigits,
  shouldAutoSubmitRetainedDigits,
} from "./emailOtpSendMachine";

{
  let m = createEmailOtpSendMachine();
  assert.equal(m.state, "idle");
  m = beginEmailOtpSend(m);
  assert.equal(m.state, "sending");
  assert.equal(isBackBlockedDuringEmailSend(m), true);
  assert.equal(canVerifyEmailOtp(m), false);
  m = setRetainedDigits(m, "000000");
  // Digits before challenge — no verify
  assert.equal(shouldAutoSubmitRetainedDigits(m), false);
  const gen = m.generation;
  // Duplicate begin bumps generation
  const m2 = beginEmailOtpSend(m);
  assert.ok(m2.generation > gen);
  // Late success for abandoned gen ignored
  assert.equal(
    completeEmailOtpSend(m2, gen, {
      challengeId: "old",
      expiresAt: 1,
      resendAvailableAt: 1,
    }),
    null
  );
  const ok = completeEmailOtpSend(m2, m2.generation, {
    challengeId: "new",
    expiresAt: 2,
    resendAvailableAt: 2,
  });
  assert.equal(ok?.state, "challengeCreated");
  assert.equal(canVerifyEmailOtp(ok!), true);
  assert.equal(isBackBlockedDuringEmailSend(ok!), false);
}

{
  let m = beginEmailOtpSend(createEmailOtpSendMachine());
  const failed = failEmailOtpSend(m, m.generation, "OTP could not be sent");
  assert.equal(failed?.state, "failed");
  assert.equal(failed?.challengeId, null);
  assert.equal(canVerifyEmailOtp(failed!), false);
  assert.equal(isBackBlockedDuringEmailSend(failed!), false);
}

console.log("emailOtpSendMachine.test.ts: all cases passed");
