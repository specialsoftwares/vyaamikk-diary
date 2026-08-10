/**
 * Challenge-scoped phone auth invariant — reproduces the stale-auth defect.
 */
import assert from "node:assert/strict";

import {
  AUTH_PHONE_CHALLENGE_MISMATCH,
  emptyCodeConfirmAllowed,
  evaluatePostSendAutoVerification,
  phonesMatchE164,
} from "./phoneChallengeAuthInvariant";

const PHONE_A = "+919716332674";
const PHONE_B = "+916420835745";
const UID_A = "uid_aaaaaa_stale";
const UID_B = "uid_bbbbbb_fresh";

function baseChallenge(overrides?: Partial<{
  attemptId: string;
  verificationId: string;
  phoneE164: string;
  startedAtMs: number;
}>) {
  return {
    attemptId: "send_attempt_1",
    verificationId: "vid_challenge_1",
    phoneE164: PHONE_B,
    startedAtMs: 1_000,
    ...overrides,
  };
}

// A. Stale user different phone — no auto-verify
{
  const marker = evaluatePostSendAutoVerification({
    challenge: baseChallenge({ phoneE164: PHONE_B }),
    preSendUid: UID_A,
    currentUid: UID_A,
    currentPhoneE164: PHONE_A,
    observedAtMs: 2_000,
  });
  assert.equal(marker, null, "stale same UID must not prove new challenge");
}

// B. Stale user same phone — pre-send UID still present → not proven
{
  const marker = evaluatePostSendAutoVerification({
    challenge: baseChallenge({ phoneE164: PHONE_A }),
    preSendUid: UID_A,
    currentUid: UID_A,
    currentPhoneE164: PHONE_A,
    observedAtMs: 2_000,
  });
  assert.equal(
    marker,
    null,
    "existing session alone must not prove a new challenge"
  );
}

// C. Genuine post-send auth event — matching phone after clear (preSendUid null)
{
  const marker = evaluatePostSendAutoVerification({
    challenge: baseChallenge({ phoneE164: PHONE_B }),
    preSendUid: null,
    currentUid: UID_B,
    currentPhoneE164: PHONE_B,
    observedAtMs: 2_000,
  });
  assert.ok(marker);
  assert.equal(marker!.authenticatedUid, UID_B);
  assert.equal(marker!.challengePhoneE164, PHONE_B);
}

// C2. Returning same Firebase UID after successful clear (preSendUid null) — allowed
{
  const marker = evaluatePostSendAutoVerification({
    challenge: baseChallenge({ phoneE164: PHONE_A }),
    preSendUid: null,
    currentUid: UID_A,
    currentPhoneE164: PHONE_A,
    observedAtMs: 2_000,
  });
  assert.ok(
    marker,
    "same UID after clear must not be rejected — UID inequality is not the proof"
  );
  assert.equal(marker!.authenticatedUid, UID_A);
}

// Also: after stale clear, preSend null, new uid for challenge phone
{
  const marker = evaluatePostSendAutoVerification({
    challenge: baseChallenge(),
    preSendUid: null,
    currentUid: UID_B,
    currentPhoneE164: "+91 64208 35745",
    observedAtMs: 1_500,
  });
  assert.ok(marker, "formatted authenticated phone must normalize-match");
}

// D. Wrong phone auth event
{
  const marker = evaluatePostSendAutoVerification({
    challenge: baseChallenge({ phoneE164: PHONE_B }),
    preSendUid: null,
    currentUid: UID_B,
    currentPhoneE164: PHONE_A,
    observedAtMs: 2_000,
  });
  assert.equal(marker, null);
  assert.equal(AUTH_PHONE_CHALLENGE_MISMATCH, "AUTH_PHONE_CHALLENGE_MISMATCH");
  assert.equal(phonesMatchE164(PHONE_A, PHONE_B), false);
}

// Empty-code confirm gate
{
  const good = evaluatePostSendAutoVerification({
    challenge: baseChallenge(),
    preSendUid: null,
    currentUid: UID_B,
    currentPhoneE164: PHONE_B,
    observedAtMs: 2_000,
  });
  assert.ok(good);
  assert.equal(
    emptyCodeConfirmAllowed({
      challengeVerificationId: "vid_challenge_1",
      challengePhoneE164: PHONE_B,
      challengeAttemptId: "send_attempt_1",
      marker: good,
      currentUid: UID_B,
      currentPhoneE164: PHONE_B,
    }),
    true
  );
  assert.equal(
    emptyCodeConfirmAllowed({
      challengeVerificationId: "vid_challenge_1",
      challengePhoneE164: PHONE_B,
      challengeAttemptId: "send_attempt_1",
      marker: good,
      currentUid: UID_A,
      currentPhoneE164: PHONE_B,
    }),
    false,
    "UID mismatch rejects empty-code confirm"
  );
  assert.equal(
    emptyCodeConfirmAllowed({
      challengeVerificationId: "vid_challenge_1",
      challengePhoneE164: PHONE_B,
      challengeAttemptId: "send_attempt_1",
      marker: null,
      currentUid: UID_B,
      currentPhoneE164: PHONE_B,
    }),
    false,
    "no marker → must enter OTP"
  );
}

// phonesMatchE164 helpers
assert.equal(phonesMatchE164(PHONE_A, PHONE_A), true);
assert.equal(phonesMatchE164(PHONE_A, null), false);
assert.equal(phonesMatchE164("", PHONE_A), false);

console.log("phoneChallengeAuthInvariant.test.ts: ok");
