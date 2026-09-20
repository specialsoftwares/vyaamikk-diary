import assert from "node:assert/strict";

import { __setRuntimeSignalsForTests } from "@/config/env";

import { isBillingUxPreviewEnabled } from "./billingUxPreviewGate";

const prevMode = process.env.EXPO_PUBLIC_APP_MODE;
process.env.EXPO_PUBLIC_APP_MODE = "production";
__setRuntimeSignalsForTests({
  appOwnership: "standalone",
  isDev: false,
  platform: "android",
});
try {
  assert.equal(
    isBillingUxPreviewEnabled(),
    false,
    "store-or-standalone must never expose billing UX preview"
  );
} finally {
  __setRuntimeSignalsForTests(null);
  if (prevMode == null) delete process.env.EXPO_PUBLIC_APP_MODE;
  else process.env.EXPO_PUBLIC_APP_MODE = prevMode;
}

console.log("billingUxPreviewGate.test.ts: ok");
