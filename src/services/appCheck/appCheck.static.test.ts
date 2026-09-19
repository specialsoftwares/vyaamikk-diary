import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { attemptNativeToJsCustomProviderBridge } from "./customProviderBridge";
import { initializeAppCheckLayer } from "./bootstrap";
import { APP_CHECK_CUSTOM_PROVIDER_BRIDGE_FAILURE } from "./appCheckTypes";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

async function main() {
  {
    const attempt = attemptNativeToJsCustomProviderBridge({
      nativeToken: "mocked-native-app-check-token",
    });
    assert.equal(attempt.mockedTokenReturned, true);
    assert.equal(attempt.acceptedAsDualSdkCoverage, false);
    assert.match(attempt.failure, /not accepted/);
  }

  {
    const report = await initializeAppCheckLayer({ isProduction: true });
    assert.equal(report.customProviderBridgeAccepted, false);
    assert.equal(report.bridgeFailure, APP_CHECK_CUSTOM_PROVIDER_BRIDGE_FAILURE);
  }

  {
    const pkg = JSON.parse(read("package.json")) as {
      dependencies?: Record<string, string>;
    };
    assert.equal(pkg.dependencies?.["@react-native-firebase/app-check"], "^24.1.0");
    assert.equal(pkg.dependencies?.["@react-native-firebase/app"], "^24.1.0");
    assert.match(pkg.dependencies?.firebase ?? "", /\^12\./);
  }

  {
    const appJson = read("app.json");
    assert.match(appJson, /@react-native-firebase\/app-check/);
    const eas = read("eas.json");
    assert.doesNotMatch(eas, /FIREBASE_APP_CHECK_DEBUG_TOKEN/);
    const rules = read("firestore.rules");
    assert.doesNotMatch(rules, /request\.appCheck/);
    const functionsIndex = read("functions/src/index.ts");
    assert.doesNotMatch(functionsIndex, /enforceAppCheck:\s*true/);
    const coordinator = read("src/startup/coordinator.ts");
    assert.match(coordinator, /initializeAppCheckLayer/);
    const guards = read("src/startup/guards.ts");
    assert.match(guards, /EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN/);
  }

  console.log("appCheck.static.test.ts: ok");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
