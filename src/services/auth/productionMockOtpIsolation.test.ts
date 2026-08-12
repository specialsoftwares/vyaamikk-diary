/**
 * Prove mock OTP codes cannot be accepted under store-or-standalone / production isolation.
 */
import assert from "node:assert/strict";

import {
  assertDeterministicLocalMockMobileOtpAllowed,
  isApprovedLocalMockMobileOtpEnvironment,
} from "@/services/auth/localMockMobileOtpGuard";
import {
  assertDeterministicLocalMockOtpAllowed,
  isApprovedLocalMockEmailOtpEnvironment,
} from "@/services/auth/localMockEmailOtp";
import { __setRuntimeSignalsForTests } from "@/config/env";
import { LOCAL_MOCK_DETERMINISTIC_MOBILE_OTP } from "@/services/auth/mobileOtpConstants";
import { LOCAL_MOCK_DETERMINISTIC_EMAIL_OTP } from "@/services/auth/emailOtpConstants";
import { AppError } from "@/domain/errors";
import { isOnboardingUxPreviewEnabled } from "@/auth-v2/preview/onboardingPreviewGate";

function withStoreSignals(fn: () => void): void {
  // Force production-like standalone signals for this process.
  process.env.EXPO_PUBLIC_APP_MODE = "production";
  __setRuntimeSignalsForTests({
    appOwnership: "standalone",
    isDev: false,
    platform: "android",
  });
  try {
    fn();
  } finally {
    __setRuntimeSignalsForTests(null);
  }
}

withStoreSignals(() => {
  assert.equal(isApprovedLocalMockMobileOtpEnvironment(), false);
  assert.equal(isApprovedLocalMockEmailOtpEnvironment(), false);
  assert.equal(
    isOnboardingUxPreviewEnabled(),
    false,
    "onboarding UX preview must stay production-inaccessible"
  );

  let mobileBlocked = false;
  try {
    assertDeterministicLocalMockMobileOtpAllowed(LOCAL_MOCK_DETERMINISTIC_MOBILE_OTP);
  } catch (e) {
    mobileBlocked = e instanceof AppError && e.code === "permission_denied";
  }
  assert.equal(mobileBlocked, true, "store-or-standalone must reject mobile 000000");

  let emailBlocked = false;
  try {
    assertDeterministicLocalMockOtpAllowed(LOCAL_MOCK_DETERMINISTIC_EMAIL_OTP);
  } catch (e) {
    emailBlocked = e instanceof AppError && e.code === "permission_denied";
  }
  assert.equal(emailBlocked, true, "store-or-standalone must reject email 000000");
});

console.log("productionMockOtpIsolation.test.ts: ok");
