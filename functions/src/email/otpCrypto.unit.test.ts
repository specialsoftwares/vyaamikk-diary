import assert from "node:assert/strict";

import { digestEmailOtp, generateEmailOtpCode, verifyEmailOtpDigest } from "./otpCrypto";
import { emailBindingKey } from "./emailBindingKey";
import {
  EMAIL_OTP_MAX_ATTEMPTS,
  EMAIL_OTP_RESEND_COOLDOWN_MS,
  EMAIL_OTP_TTL_MS,
  isValidEmailSyntaxServer,
} from "./otpPolicy";

assert.equal(EMAIL_OTP_TTL_MS, 15 * 60 * 1000);
assert.equal(EMAIL_OTP_RESEND_COOLDOWN_MS, 30_000);
assert.equal(EMAIL_OTP_MAX_ATTEMPTS, 3);
assert.equal(isValidEmailSyntaxServer("x@y.co"), true);

const code = generateEmailOtpCode();
assert.match(code, /^\d{6}$/);
const secret = "emulator-only-email-otp-hmac-secret-do-not-use-in-prod";
const ctx = { challengeId: "c", uid: "u", normalizedEmail: "a@b.co", version: 1 };
const d = digestEmailOtp(secret, code, ctx);
assert.equal(verifyEmailOtpDigest(secret, code, ctx, d), true);
assert.equal(verifyEmailOtpDigest(secret, "000000", ctx, d), false);
assert.equal(emailBindingKey("A@B.CO").length, 64);

console.log("otpCrypto.unit.test.ts: ok");
