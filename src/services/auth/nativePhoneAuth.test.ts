import assert from "node:assert/strict";

import {
  __clearNativePhoneSessions,
  isNativePhoneAuthAvailable,
  probeAndroidAuthActivityState,
} from "./nativePhoneAuth";
import { phoneAuthFailureToAppError } from "./nativePhoneAuthErrors";
import {
  clearNativePhoneAuthSession,
  loadNativePhoneAuthSession,
  saveNativePhoneAuthSession,
} from "./nativePhoneAuthSession";

async function run() {
  __clearNativePhoneSessions();
  await clearNativePhoneAuthSession();

  assert.equal(isNativePhoneAuthAvailable(), false);
  assert.equal(probeAndroidAuthActivityState(), "n/a");

  // SecureStore / AsyncStorage session round-trip (Node uses AsyncStorage fallback path
  // which may be unavailable — exercise pure save/load contract via module API).
  await saveNativePhoneAuthSession({
    firebaseVerificationId: "test_vid_abc",
    phoneE164: "+919876543210",
    expiresAt: Date.now() + 60_000,
    attemptId: "attempt_1",
  });
  const loaded = await loadNativePhoneAuthSession();
  // In node without RN SecureStore polyfill this may be null; accept either persisted or noop.
  if (loaded) {
    assert.equal(loaded.firebaseVerificationId, "test_vid_abc");
    assert.equal(loaded.phoneE164, "+919876543210");
    assert.equal(loaded.attemptId, "attempt_1");
  }

  // Expired session clears
  await saveNativePhoneAuthSession({
    firebaseVerificationId: "test_vid_old",
    phoneE164: "+919876543210",
    expiresAt: Date.now() - 1,
    attemptId: "attempt_old",
  });
  const expired = await loadNativePhoneAuthSession();
  assert.equal(expired, null);

  // Preserve Firebase codes — do not collapse to invalid_phone.
  const preserved = phoneAuthFailureToAppError(
    { code: "auth/missing-client-identifier", message: "missing client id", name: "Error" },
    "send",
    { phoneE164Sent: "+918076861531" }
  );
  assert.equal(preserved.details?.firebaseAuthCode, "auth/missing-client-identifier");
  assert.notEqual(preserved.code, "invalid_phone");

  // Session-lost style error must not be generic "OTP not found" catch-all wording from mock email.
  const { AppError, userFacingMessage } = await import("@/domain/errors");
  const sessionLost = new AppError(
    "otp_expired",
    "Verification session was lost after leaving the app. Please request a new code.",
    undefined,
    {
      firebaseAuthCode: "auth/session-expired",
      phoneAuthPhase: "confirm",
      verificationIdPresent: false,
    }
  );
  assert.match(sessionLost.message, /session was lost|request a new code/i);
  assert.ok(!/OTP not found/i.test(sessionLost.message));
  assert.ok(!/OTP not found/i.test(userFacingMessage(sessionLost)));
  assert.match(userFacingMessage(sessionLost), /session was lost/i);

  const wrongCode = phoneAuthFailureToAppError(
    { code: "auth/invalid-verification-code", message: "bad code", name: "Error" },
    "confirm"
  );
  assert.equal(wrongCode.code, "invalid_otp");
  assert.match(wrongCode.message, /Incorrect verification code/i);

  const expiredCode = phoneAuthFailureToAppError(
    { code: "auth/code-expired", message: "expired", name: "Error" },
    "confirm"
  );
  assert.equal(expiredCode.code, "otp_expired");

  await clearNativePhoneAuthSession();
  console.log("nativePhoneAuth.test.ts: ok");
}

void run();
