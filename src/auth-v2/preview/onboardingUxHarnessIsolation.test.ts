import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { __setRuntimeSignalsForTests } from "@/config/env";
import { isOnboardingUxPreviewEnabled } from "./onboardingPreviewGate";

const root = join(__dirname, "../../..");

assert.equal(existsSync(join(root, "tools/onboarding-ux-harness/app.json")), true);
assert.equal(existsSync(join(root, "tools/onboarding-ux-harness/src/HarnessApp.tsx")), true);

const layout = readFileSync(join(root, "app/_layout.tsx"), "utf8");
assert.equal(layout.includes("onboarding-ux-harness"), false);
assert.equal(layout.includes("HarnessApp"), false);

const authGate = readFileSync(join(root, "src/auth-v2/AuthFlowGate.tsx"), "utf8");
assert.equal(authGate.includes("onboarding-ux-harness"), false);
assert.equal(authGate.includes("tools/onboarding"), false);

const eas = readFileSync(join(root, "eas.json"), "utf8");
assert.equal(eas.includes("onboarding-ux-harness"), false);

const appJson = JSON.parse(readFileSync(join(root, "app.json"), "utf8")) as {
  expo: { android?: { package?: string } };
};
assert.equal(appJson.expo.android?.package, "com.specialsoftwares.vyaamikkdiary");

const harnessApp = JSON.parse(
  readFileSync(join(root, "tools/onboarding-ux-harness/app.json"), "utf8")
) as { expo: { android?: { package?: string }; slug: string } };
assert.notEqual(harnessApp.expo.android?.package, "com.specialsoftwares.vyaamikkdiary");
assert.equal(harnessApp.expo.slug, "vyaamikk-onboarding-ux-harness");

const prev = process.env.EXPO_PUBLIC_APP_MODE;
process.env.EXPO_PUBLIC_APP_MODE = "production";
__setRuntimeSignalsForTests({
  appOwnership: "standalone",
  isDev: false,
  platform: "android",
});
try {
  assert.equal(isOnboardingUxPreviewEnabled(), false);
} finally {
  __setRuntimeSignalsForTests(null);
  if (prev == null) delete process.env.EXPO_PUBLIC_APP_MODE;
  else process.env.EXPO_PUBLIC_APP_MODE = prev;
}

console.log("onboardingUxHarnessIsolation.test.ts: ok");
