import assert from "node:assert/strict";

import {
  OTP_OFFLINE_VERIFY_MESSAGE,
  classifyOtpVerifyFailure,
  isOtpComplete,
  normalizeOtpDigits,
  otpCellsFromValue,
  resolveOtpVerifyUi,
  shouldAutoVerifyOtp,
} from "./onboardingOtpModel";

assert.equal(normalizeOtpDigits("12 34-56", 6), "123456");
assert.equal(normalizeOtpDigits("1234567890", 6), "123456");
assert.deepEqual(otpCellsFromValue("12", 6), ["1", "2", "", "", "", ""]);
assert.equal(isOtpComplete("123456", 6), true);
assert.equal(isOtpComplete("12345", 6), false);

assert.equal(
  shouldAutoVerifyOtp({
    digits: "12345",
    length: 6,
    lastSubmitted: null,
    inFlight: false,
    disabled: false,
  }),
  false,
  "5 digits must not submit"
);

assert.equal(
  shouldAutoVerifyOtp({
    digits: "123456",
    length: 6,
    lastSubmitted: null,
    inFlight: false,
    disabled: false,
  }),
  true,
  "6th digit submits"
);
assert.equal(
  shouldAutoVerifyOtp({
    digits: "123456",
    length: 6,
    lastSubmitted: "123456",
    inFlight: false,
    disabled: false,
  }),
  false,
  "same completed code does not duplicate-submit"
);
assert.equal(
  shouldAutoVerifyOtp({
    digits: "12 34 56",
    length: 6,
    lastSubmitted: "123456",
    inFlight: false,
    disabled: false,
  }),
  false,
  "normalized duplicate paste must not resubmit"
);
assert.equal(
  shouldAutoVerifyOtp({
    digits: "123456",
    length: 6,
    lastSubmitted: null,
    inFlight: true,
    disabled: false,
  }),
  false,
  "in-flight prevents duplicate call"
);
assert.equal(
  shouldAutoVerifyOtp({
    digits: "123456",
    length: 6,
    lastSubmitted: null,
    inFlight: false,
    disabled: true,
  }),
  false,
  "offline / disabled must not auto-verify"
);
assert.equal(
  shouldAutoVerifyOtp({
    digits: "12 34 56",
    length: 6,
    lastSubmitted: null,
    inFlight: false,
    disabled: false,
  }),
  true,
  "paste / autofill-like injection"
);

// Edit below 6 clears lastSubmitted in the screen; corrected code may submit again.
assert.equal(
  shouldAutoVerifyOtp({
    digits: "654321",
    length: 6,
    lastSubmitted: null,
    inFlight: false,
    disabled: false,
  }),
  true,
  "corrected 6-digit code can submit again"
);

assert.equal(classifyOtpVerifyFailure(null), null);
assert.equal(classifyOtpVerifyFailure("invalid_otp"), "invalid_code");
assert.equal(classifyOtpVerifyFailure("otp_expired"), "expired");
assert.equal(classifyOtpVerifyFailure("too_many_attempts"), "locked");
assert.equal(classifyOtpVerifyFailure("network"), "transient");
assert.equal(classifyOtpVerifyFailure("auth_failed"), "transient");

const baseUi = {
  digits: "12345",
  length: 6,
  online: true,
  loading: false,
  lockRemaining: 0,
  lastSubmitted: null as string | null,
  failureKind: null as ReturnType<typeof classifyOtpVerifyFailure>,
};

assert.deepEqual(resolveOtpVerifyUi(baseUi), {
  phase: "normal_entry",
  showManualVerifyCta: false,
  autoVerifyDisabled: false,
});

assert.equal(
  resolveOtpVerifyUi({ ...baseUi, digits: "123456" }).showManualVerifyCta,
  false,
  "complete code happy path has no permanent Verify CTA"
);

assert.deepEqual(
  resolveOtpVerifyUi({ ...baseUi, digits: "123456", loading: true }),
  {
    phase: "auto_verifying",
    showManualVerifyCta: false,
    autoVerifyDisabled: true,
  }
);

assert.deepEqual(
  resolveOtpVerifyUi({
    ...baseUi,
    digits: "123456",
    failureKind: "invalid_code",
    lastSubmitted: "123456",
  }),
  {
    phase: "code_error",
    showManualVerifyCta: false,
    autoVerifyDisabled: false,
  },
  "incorrect code: edit to retry — no Verify button"
);

assert.deepEqual(
  resolveOtpVerifyUi({
    ...baseUi,
    digits: "",
    failureKind: "expired",
  }),
  {
    phase: "expired",
    showManualVerifyCta: false,
    autoVerifyDisabled: false,
  }
);

assert.deepEqual(
  resolveOtpVerifyUi({
    ...baseUi,
    digits: "123456",
    failureKind: "transient",
    lastSubmitted: "123456",
  }),
  {
    phase: "manual_retry_available",
    showManualVerifyCta: true,
    autoVerifyDisabled: true,
  },
  "transport failure: compact Try again only"
);

assert.deepEqual(
  resolveOtpVerifyUi({ ...baseUi, digits: "123456", online: false }),
  {
    phase: "offline",
    showManualVerifyCta: false,
    autoVerifyDisabled: true,
  }
);

assert.match(OTP_OFFLINE_VERIFY_MESSAGE, /offline/i);
assert.match(OTP_OFFLINE_VERIFY_MESSAGE, /internet/i);

console.log("onboardingOtpModel.test.ts: ok");
