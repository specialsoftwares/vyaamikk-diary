import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { mapPhoneAuthFailure } from "@/services/auth/nativePhoneAuthErrors";
import {
  ANDROID_PHONE_VERIFICATION_TIMEOUT_SECONDS,
  planPhoneVerification,
} from "@/services/auth/phoneVerificationPlan";
import { AppError, userFacingMessage } from "@/domain/errors";

const now = 1_700_000_000_000;

assert.equal(ANDROID_PHONE_VERIFICATION_TIMEOUT_SECONDS, 60);

const restored = planPhoneVerification({ intent: "restore", now });
assert.equal(restored.action, "restore_without_send");

const fresh = planPhoneVerification({ intent: "fresh", now, resendAvailableAt: now + 30_000 });
assert.deepEqual(fresh, { action: "send", forceResend: false });

const missingDeadline = planPhoneVerification({ intent: "explicit_resend", now });
assert.equal(missingDeadline.action, "cooldown");
if (missingDeadline.action === "cooldown") {
  assert.equal(missingDeadline.resendAvailableAt, now + 30_000);
}

const early = planPhoneVerification({
  intent: "explicit_resend",
  now,
  resendAvailableAt: now + 30_000,
});
assert.equal(early.action, "cooldown");
if (early.action === "cooldown") assert.equal(early.resendAvailableAt, now + 30_000);

const eligible = planPhoneVerification({
  intent: "explicit_resend",
  now: now + 30_000,
  resendAvailableAt: now + 30_000,
});
assert.deepEqual(eligible, { action: "send", forceResend: true });

const afterWindow = planPhoneVerification({
  intent: "explicit_resend",
  now: now + 61_000,
  resendAvailableAt: now + 30_000,
});
assert.deepEqual(afterWindow, { action: "send", forceResend: true });

const throttled = mapPhoneAuthFailure(
  { code: "auth/too-many-requests", message: "SMS quota" },
  "send"
);
assert.equal(throttled.appErrorCode, "too_many_attempts");
const throttledError = new AppError(throttled.appErrorCode, throttled.userMessage);
assert.equal(
  userFacingMessage(throttledError),
  "Too many attempts. Please wait a few minutes and try again."
);
assert.equal(userFacingMessage(throttledError).includes("SMS quota"), false);

const native = readFileSync(resolve(process.cwd(), "src/services/auth/nativePhoneAuth.ts"), "utf8");
assert.match(native, /signInWithPhoneNumber\(\s*firebaseSendPhoneE164,\s*Boolean\(options\?\.forceResend\)\s*\)/);
const gate = readFileSync(resolve(process.cwd(), "src/auth-v2/AuthFlowGate.tsx"), "utf8");
const hydrateStart = gate.indexOf("resumeSignedOutPhoneChallenge(");
const hydrate = gate.slice(hydrateStart, gate.indexOf("if (!cancelled) setHydrated(true);", hydrateStart));
assert.match(hydrate, /setStep\("otp"\)/);
assert.match(hydrate, /phoneOtpRef\.current\.generation/);
assert.equal(hydrate.includes("startOtp("), false);
assert.equal(hydrate.includes("sendOtpForWrapper("), false);
assert.match(gate, /forceResend: true/);
const resendStart = gate.indexOf("const handleResend = async");
const resendBody = gate.slice(resendStart, gate.indexOf("const next = await startOtp", resendStart));
assert.ok(resendBody.indexOf("presentedPhoneResend") < resendBody.indexOf("beginPhoneOtpSend"));
assert.match(readFileSync(resolve(process.cwd(), "src/services/auth/phoneVerificationPlan.ts"), "utf8"), /intent: "explicit_resend"/);

console.log("phoneVerificationPlan.test.ts: ok");
