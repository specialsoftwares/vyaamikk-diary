/**
 * Prove Firebase Phone Auth test-mode cannot activate in preview/production,
 * and that it stays off for ordinary development-client real-number sessions.
 */
import assert from "node:assert/strict";

import { __setRuntimeSignalsForTests } from "@/config/env";
import {
  applyFirebasePhoneAuthTestingSettingsIfAllowed,
  isFirebasePhoneAuthTestModeActive,
} from "@/services/auth/firebasePhoneAuthTestMode";

const prevFlag = process.env.EXPO_PUBLIC_FIREBASE_PHONE_AUTH_TEST_MODE;

function restore(): void {
  if (prevFlag === undefined) {
    delete process.env.EXPO_PUBLIC_FIREBASE_PHONE_AUTH_TEST_MODE;
  } else {
    process.env.EXPO_PUBLIC_FIREBASE_PHONE_AUTH_TEST_MODE = prevFlag;
  }
  __setRuntimeSignalsForTests(null);
}

try {
  // Ordinary development-client Metro: flag unset → inactive (physical daily path).
  delete process.env.EXPO_PUBLIC_FIREBASE_PHONE_AUTH_TEST_MODE;
  __setRuntimeSignalsForTests({
    appOwnership: null,
    isDev: true,
    platform: "android",
  });
  assert.equal(isFirebasePhoneAuthTestModeActive(), false);

  const settingsOff: {
    appVerificationDisabledForTesting?: boolean;
    forceRecaptchaFlowForTesting?: boolean;
  } = {};
  const off = applyFirebasePhoneAuthTestingSettingsIfAllowed(settingsOff);
  assert.equal(off.applied, false);
  assert.equal(settingsOff.appVerificationDisabledForTesting, undefined);
  assert.equal(settingsOff.forceRecaptchaFlowForTesting, undefined);

  // Explicit opt-in + development-client + __DEV__ → active; never forceRecaptcha.
  process.env.EXPO_PUBLIC_FIREBASE_PHONE_AUTH_TEST_MODE = "1";
  __setRuntimeSignalsForTests({
    appOwnership: null,
    isDev: true,
    platform: "android",
  });
  assert.equal(isFirebasePhoneAuthTestModeActive(), true);
  const settingsOn: {
    appVerificationDisabledForTesting?: boolean;
    forceRecaptchaFlowForTesting?: boolean;
  } = {};
  const on = applyFirebasePhoneAuthTestingSettingsIfAllowed(settingsOn);
  assert.equal(on.applied, true);
  assert.equal(settingsOn.appVerificationDisabledForTesting, true);
  assert.equal(settingsOn.forceRecaptchaFlowForTesting, undefined);
  assert.equal(on.forceRecaptchaFlowForTesting, false);

  // Preview / store standalone: even with flag=1, must stay inactive.
  process.env.EXPO_PUBLIC_FIREBASE_PHONE_AUTH_TEST_MODE = "1";
  __setRuntimeSignalsForTests({
    appOwnership: "standalone",
    isDev: false,
    platform: "android",
  });
  assert.equal(isFirebasePhoneAuthTestModeActive(), false);
  const storeSettings: {
    appVerificationDisabledForTesting?: boolean;
    forceRecaptchaFlowForTesting?: boolean;
  } = {};
  const store = applyFirebasePhoneAuthTestingSettingsIfAllowed(storeSettings);
  assert.equal(store.applied, false);
  assert.equal(storeSettings.appVerificationDisabledForTesting, undefined);

  console.log("firebasePhoneAuthTestMode.test.ts: ok");
} finally {
  restore();
}
