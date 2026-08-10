import assert from "node:assert/strict";

import {
  isOtpComplete,
  normalizeOtpDigits,
  otpCellsFromValue,
  shouldAutoVerifyOtp,
} from "./onboardingOtpModel";

assert.equal(normalizeOtpDigits("12 34-56", 6), "123456");
assert.equal(normalizeOtpDigits("1234567890", 6), "123456");
assert.deepEqual(otpCellsFromValue("12", 6), ["1", "2", "", "", "", ""]);
assert.equal(isOtpComplete("123456", 6), true);
assert.equal(isOtpComplete("12345", 6), false);

assert.equal(
  shouldAutoVerifyOtp({
    digits: "123456",
    length: 6,
    lastSubmitted: null,
    inFlight: false,
    disabled: false,
  }),
  true
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
  "rerender / autofill must not verify twice"
);
assert.equal(
  shouldAutoVerifyOtp({
    digits: "123456",
    length: 6,
    lastSubmitted: null,
    inFlight: true,
    disabled: false,
  }),
  false
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

console.log("onboardingOtpModel.test.ts: ok");
