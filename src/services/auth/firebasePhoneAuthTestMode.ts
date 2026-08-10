/**
 * Official Firebase "Phone numbers for testing" support — isolated from
 * production Phone Auth and from the app's historical local-mock OTP mode.
 *
 * Firebase Console fictional numbers remain external configuration.
 * This module never hardcodes a phone number or OTP.
 *
 * `appVerificationDisabledForTesting` may be applied ONLY when ALL of:
 *   - runtimeKind === development-client (Metro __DEV__; never preview / store)
 *   - EXPO_PUBLIC_FIREBASE_PHONE_AUTH_TEST_MODE=1 (explicit opt-in)
 *
 * Never for ordinary real-number login on a physical development client.
 * Distinct from EXPO_PUBLIC_LOCAL_MOCK_* (Expo Go mock OTP).
 */

import { env } from "@/config/env";

export const FIREBASE_PHONE_AUTH_TEST_MODE_ENV =
  "EXPO_PUBLIC_FIREBASE_PHONE_AUTH_TEST_MODE" as const;

function flagEnabled(): boolean {
  return process.env.EXPO_PUBLIC_FIREBASE_PHONE_AUTH_TEST_MODE === "1";
}

/**
 * True only for an explicit development-client Firebase test-phone session.
 * Preview / production standalone always false even if the env var were somehow present.
 */
export function isFirebasePhoneAuthTestModeActive(): boolean {
  if (!flagEnabled()) return false;
  // development-client is only detected when Metro __DEV__ is true.
  if (env.runtimeKind !== "development-client") return false;
  return true;
}

export type FirebasePhoneAuthTestingSettingsApplied = {
  applied: boolean;
  appVerificationDisabledForTesting: boolean;
  forceRecaptchaFlowForTesting: boolean;
  reason: string;
};

/**
 * Apply Firebase Auth testing settings for Console fictional numbers.
 * Does not enable local-mock OTP. Does not set forceRecaptchaFlowForTesting
 * (that remains diagnostic-only and is never part of ordinary behaviour).
 */
export function applyFirebasePhoneAuthTestingSettingsIfAllowed(authSettings: {
  appVerificationDisabledForTesting?: boolean;
  forceRecaptchaFlowForTesting?: boolean;
}): FirebasePhoneAuthTestingSettingsApplied {
  if (!isFirebasePhoneAuthTestModeActive()) {
    return {
      applied: false,
      appVerificationDisabledForTesting: false,
      forceRecaptchaFlowForTesting: false,
      reason: "firebase_phone_auth_test_mode_inactive",
    };
  }
  authSettings.appVerificationDisabledForTesting = true;
  return {
    applied: true,
    appVerificationDisabledForTesting: true,
    forceRecaptchaFlowForTesting: false,
    reason: "firebase_console_test_phones_dev_client",
  };
}
