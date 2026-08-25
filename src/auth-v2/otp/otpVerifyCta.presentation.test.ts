import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  OTP_OFFLINE_VERIFY_MESSAGE,
  classifyOtpVerifyFailure,
  resolveOtpVerifyUi,
  shouldAutoVerifyOtp,
} from "./onboardingOtpModel";

const screen = readFileSync(join(__dirname, "../screens/OtpVerificationScreen.tsx"), "utf8");

assert.ok(screen.includes("showManualVerifyCta"), "Verify CTA must be gated");
assert.ok(screen.includes('testID="auth-v2-otp-verify"'));
assert.ok(
  screen.indexOf("ui.showManualVerifyCta") < screen.indexOf('testID="auth-v2-otp-verify"'),
  "permanent Verify CTA must not render unless recovery state"
);
assert.equal(screen.includes("disabled={!complete"), false, "must not leave a visible disabled Verify");
assert.ok(screen.includes("tokens.secondaryAction"));
assert.ok(screen.includes("AuthTertiaryTextAction"));
assert.ok(screen.includes("Resend OTP"));
assert.ok(screen.includes("authV2.otp.changeNumber"));
assert.ok(screen.includes("OTP_OFFLINE_VERIFY_MESSAGE"));
assert.ok(screen.includes("One-time password. Verifying your code."));

// Recovery CTA uses the same invokeVerify / onVerify path.
assert.ok(screen.includes("onPress={() => invokeVerify(code)}"));
assert.match(screen, /label=\{t\("common\.retry"\)\}/);

const incomplete = resolveOtpVerifyUi({
  digits: "12",
  length: 6,
  online: true,
  loading: false,
  lockRemaining: 0,
  lastSubmitted: null,
  failureKind: null,
});
assert.equal(incomplete.showManualVerifyCta, false);
assert.equal(incomplete.phase, "normal_entry");

const completeHappy = resolveOtpVerifyUi({
  digits: "847291",
  length: 6,
  online: true,
  loading: false,
  lockRemaining: 0,
  lastSubmitted: null,
  failureKind: null,
});
assert.equal(completeHappy.showManualVerifyCta, false);
assert.equal(
  shouldAutoVerifyOtp({
    digits: "847291",
    length: 6,
    lastSubmitted: null,
    inFlight: false,
    disabled: completeHappy.autoVerifyDisabled,
  }),
  true
);

const retry = resolveOtpVerifyUi({
  digits: "847291",
  length: 6,
  online: true,
  loading: false,
  lockRemaining: 0,
  lastSubmitted: "847291",
  failureKind: classifyOtpVerifyFailure("network"),
});
assert.equal(retry.phase, "manual_retry_available");
assert.equal(retry.showManualVerifyCta, true);
assert.equal(
  shouldAutoVerifyOtp({
    digits: "847291",
    length: 6,
    lastSubmitted: "847291",
    inFlight: false,
    disabled: retry.autoVerifyDisabled,
  }),
  false,
  "recovery CTA must not double-fire auto-submit"
);

const offline = resolveOtpVerifyUi({
  digits: "847291",
  length: 6,
  online: false,
  loading: false,
  lockRemaining: 0,
  lastSubmitted: null,
  failureKind: null,
});
assert.equal(offline.phase, "offline");
assert.equal(offline.showManualVerifyCta, false);
assert.equal(
  shouldAutoVerifyOtp({
    digits: "847291",
    length: 6,
    lastSubmitted: null,
    inFlight: false,
    disabled: offline.autoVerifyDisabled,
  }),
  false,
  "no verification call while offline"
);
assert.equal(
  shouldAutoVerifyOtp({
    digits: "847291",
    length: 6,
    lastSubmitted: null,
    inFlight: false,
    disabled: false,
  }),
  true,
  "coming back online with complete code may auto-retry once"
);
assert.equal(OTP_OFFLINE_VERIFY_MESSAGE.includes("wrong"), false);

const invalid = resolveOtpVerifyUi({
  digits: "000000",
  length: 6,
  online: true,
  loading: false,
  lockRemaining: 0,
  lastSubmitted: "000000",
  failureKind: classifyOtpVerifyFailure("invalid_otp"),
});
assert.equal(invalid.showManualVerifyCta, false);
assert.equal(invalid.phase, "code_error");

const networkKind = classifyOtpVerifyFailure("network");
const invalidKind = classifyOtpVerifyFailure("invalid_otp");
assert.notEqual(networkKind, invalidKind, "network error must not be presented as invalid-code");

console.log("otpVerifyCta.presentation.test.ts: ok");
