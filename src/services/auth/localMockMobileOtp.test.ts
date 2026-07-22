import assert from "node:assert/strict";

import {
  __peekLocalMockMobileChallengeForTests,
  localMockCancelMobileOtp,
  localMockConfirmMobileOtp,
  localMockStartMobileOtp,
  resetLocalMockMobileOtpForTests,
} from "./localMockMobileOtp";
import {
  LEGACY_LOCAL_MOCK_MOBILE_OTP,
  LOCAL_MOCK_DETERMINISTIC_MOBILE_OTP,
  MOBILE_OTP_MAX_ATTEMPTS,
  MOBILE_OTP_RESEND_COOLDOWN_MS,
  MOBILE_OTP_TTL_MS,
} from "./mobileOtpConstants";
import {
  assertDeterministicLocalMockMobileOtpAllowed,
  isApprovedLocalMockMobileOtpEnvironment,
} from "./localMockMobileOtpGuard";
import { __setRuntimeSignalsForTests } from "@/config/env";

async function main() {
  assert.equal(LOCAL_MOCK_DETERMINISTIC_MOBILE_OTP, "000000");
  assert.equal(MOBILE_OTP_TTL_MS, 10 * 60 * 1000);
  assert.equal(MOBILE_OTP_RESEND_COOLDOWN_MS, 30_000);
  assert.equal(MOBILE_OTP_MAX_ATTEMPTS, 3);

  resetLocalMockMobileOtpForTests();
  __setRuntimeSignalsForTests({
    appOwnership: "expo",
    isDev: true,
    platform: "ios",
  });

  delete process.env.EXPO_PUBLIC_LOCAL_MOCK_MOBILE_OTP;
  assert.equal(isApprovedLocalMockMobileOtpEnvironment(), false);
  let blocked = false;
  try {
    await localMockStartMobileOtp("+919876543210");
  } catch {
    blocked = true;
  }
  assert.equal(blocked, true, "mobile mock OTP requires EXPO_PUBLIC_LOCAL_MOCK_MOBILE_OTP=1");

  delete process.env.EXPO_PUBLIC_LOCAL_MOCK_MOBILE_OTP;
  let guardBlocked = false;
  try {
    assertDeterministicLocalMockMobileOtpAllowed(LOCAL_MOCK_DETERMINISTIC_MOBILE_OTP);
  } catch {
    guardBlocked = true;
  }
  assert.equal(guardBlocked, true, "production/shared must reject 000000");

  process.env.EXPO_PUBLIC_LOCAL_MOCK_MOBILE_OTP = "1";
  assert.equal(isApprovedLocalMockMobileOtpEnvironment(), true);

  const start = await localMockStartMobileOtp("+919876543210");
  assert.equal(start.devCodeHint, null);
  assert.ok(start.expiresAt - Date.now() <= MOBILE_OTP_TTL_MS);
  assert.ok(start.resendAvailableAt > Date.now());

  let legacyRejected = false;
  try {
    await localMockConfirmMobileOtp(start, LEGACY_LOCAL_MOCK_MOBILE_OTP);
  } catch {
    legacyRejected = true;
  }
  assert.equal(legacyRejected, true);

  // Fresh challenge for attempt-remaining messaging
  resetLocalMockMobileOtpForTests();
  process.env.EXPO_PUBLIC_LOCAL_MOCK_MOBILE_OTP = "1";
  const attemptChallenge = await localMockStartMobileOtp("+919876543211");
  let wrong1 = false;
  try {
    await localMockConfirmMobileOtp(attemptChallenge, "111111");
  } catch (e) {
    wrong1 = true;
    assert.ok(String((e as Error).message).includes("2 attempts"));
  }
  assert.equal(wrong1, true);

  await localMockConfirmMobileOtp(attemptChallenge, LOCAL_MOCK_DETERMINISTIC_MOBILE_OTP);

  // Resend invalidates prior
  resetLocalMockMobileOtpForTests();
  process.env.EXPO_PUBLIC_LOCAL_MOCK_MOBILE_OTP = "1";
  const first = await localMockStartMobileOtp("+919811122233");
  const peeked = __peekLocalMockMobileChallengeForTests(first.verificationId)!;
  peeked.resendAvailableAt = Date.now() - 1;
  const second = await localMockStartMobileOtp("+919811122233");
  assert.notEqual(second.verificationId, first.verificationId);
  let oldRejected = false;
  try {
    await localMockConfirmMobileOtp(first, LOCAL_MOCK_DETERMINISTIC_MOBILE_OTP);
  } catch {
    oldRejected = true;
  }
  assert.equal(oldRejected, true);
  await localMockConfirmMobileOtp(second, LOCAL_MOCK_DETERMINISTIC_MOBILE_OTP);

  // Cancel on change number
  resetLocalMockMobileOtpForTests();
  process.env.EXPO_PUBLIC_LOCAL_MOCK_MOBILE_OTP = "1";
  const c = await localMockStartMobileOtp("+919800011122");
  localMockCancelMobileOtp("+919800011122");
  let cancelled = false;
  try {
    await localMockConfirmMobileOtp(c, LOCAL_MOCK_DETERMINISTIC_MOBILE_OTP);
  } catch {
    cancelled = true;
  }
  assert.equal(cancelled, true);

  resetLocalMockMobileOtpForTests();
  delete process.env.EXPO_PUBLIC_LOCAL_MOCK_MOBILE_OTP;
  __setRuntimeSignalsForTests(null);
  console.log("localMockMobileOtp.test.ts: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
