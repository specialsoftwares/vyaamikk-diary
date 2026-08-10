import assert from "node:assert/strict";

import { __setRuntimeSignalsForTests } from "@/config/env";
import { isOnboardingUxPreviewEnabled } from "./onboardingPreviewGate";

const prevMode = process.env.EXPO_PUBLIC_APP_MODE;
process.env.EXPO_PUBLIC_APP_MODE = "production";
__setRuntimeSignalsForTests({
  appOwnership: "standalone",
  isDev: false,
  platform: "android",
});
try {
  assert.equal(
    isOnboardingUxPreviewEnabled(),
    false,
    "store-or-standalone must never expose onboarding UX preview"
  );
} finally {
  __setRuntimeSignalsForTests(null);
  if (prevMode == null) delete process.env.EXPO_PUBLIC_APP_MODE;
  else process.env.EXPO_PUBLIC_APP_MODE = prevMode;
}

console.log("onboardingPreviewGate.test.ts: ok");
