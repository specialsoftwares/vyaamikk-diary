import assert from "node:assert/strict";

import {
  clearNativePhoneAuthSession,
  loadNativePhoneAuthSession,
  saveNativePhoneAuthSession,
} from "./nativePhoneAuthSession";

async function run() {
  await clearNativePhoneAuthSession();

  await saveNativePhoneAuthSession({
    firebaseVerificationId: "vid_current",
    phoneE164: "+919716332674",
    expiresAt: Date.now() + 120_000,
    attemptId: "attempt_new",
  });
  // Resend supersedes atomically (same key overwrite).
  await saveNativePhoneAuthSession({
    firebaseVerificationId: "vid_resend",
    phoneE164: "+919716332674",
    expiresAt: Date.now() + 120_000,
    attemptId: "attempt_resend",
  });

  const loaded = await loadNativePhoneAuthSession();
  assert.ok(loaded, "session must persist in Node memory store");
  assert.equal(loaded.firebaseVerificationId, "vid_resend");
  assert.equal(loaded.attemptId, "attempt_resend");
  assert.equal(loaded.phoneE164, "+919716332674");
  // Never persist OTP.
  assert.ok(!("code" in loaded));
  assert.ok(!("otp" in loaded));

  await clearNativePhoneAuthSession();
  assert.equal(await loadNativePhoneAuthSession(), null);

  // Expired session must not be returned.
  await saveNativePhoneAuthSession({
    firebaseVerificationId: "vid_old",
    phoneE164: "+919876543210",
    expiresAt: Date.now() - 5,
    attemptId: "attempt_old",
  });
  assert.equal(await loadNativePhoneAuthSession(), null);

  console.log("nativePhoneAuthSession.test.ts: ok");
}

void run();
