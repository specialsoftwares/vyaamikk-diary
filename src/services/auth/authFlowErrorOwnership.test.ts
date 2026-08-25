import assert from "node:assert/strict";

import {
  errorVisibleOnSurface,
  resolveAuthErrorSurface,
} from "@/services/auth/authFlowErrorOwnership";

assert.equal(resolveAuthErrorSurface({ step: "phone", phase: "send" }), "phone");
assert.equal(resolveAuthErrorSurface({ step: "otp", phase: "verify" }), "phone_otp");
assert.equal(resolveAuthErrorSurface({ step: "email", phase: "unknown" }), "email");
assert.equal(resolveAuthErrorSurface({ step: "email_verify", phase: "verify" }), "email_otp");

assert.equal(errorVisibleOnSurface("phone_otp", "email"), false, "Email never renders Phone OTP error");
assert.equal(errorVisibleOnSurface("phone_otp", "phone_otp"), true);
assert.equal(errorVisibleOnSurface("email", "phone_otp"), false);
assert.equal(errorVisibleOnSurface(null, "email"), false);

console.log("authFlowErrorOwnership.test.ts: ok");
