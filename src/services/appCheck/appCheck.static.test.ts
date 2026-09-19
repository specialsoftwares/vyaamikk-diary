import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { attemptNativeToJsCustomProviderBridge } from "./customProviderBridge";
import {
  getAppCheckDiagnosticPromise,
  initializeAppCheckLayer,
} from "./bootstrap";
import { initializeJsAppCheck } from "./jsAppCheck";
import { initializeNativeAppCheck, probeNativeAppCheckTokens } from "./nativeAppCheck";
import {
  APP_CHECK_CUSTOM_PROVIDER_BRIDGE_FAILURE,
  getLastAppCheckInitReport,
  setLastAppCheckInitReport,
} from "./appCheckTypes";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

async function main() {
  setLastAppCheckInitReport(null);

  {
    const attempt = attemptNativeToJsCustomProviderBridge({
      nativeToken: "real-or-mocked-token",
      jsAppId: "1:web-app-id",
      nativeAppId: "1:android-app-id",
    });
    assert.equal(attempt.nativeTokenPresent, true);
    assert.equal(attempt.acceptedAsDualSdkCoverage, false);
    assert.equal(attempt.appIdentityCompatible, false);
    assert.match(attempt.failure, /app identity/);
  }

  {
    const js = await initializeJsAppCheck({
      isProduction: true,
      getApp: () => ({ options: { appId: "1:proj:web:abc" } }),
      importSdk: async () => ({
        CustomProvider: function CustomProvider() {},
        initializeAppCheck: function initializeAppCheck() {},
        ReCaptchaV3Provider: function ReCaptchaV3Provider() {},
      }),
    });
    assert.equal(js.sdkModulePresent, true);
    assert.equal(js.customProviderApiPresent, true);
    assert.equal(js.initializeAppCheckApiPresent, true);
    assert.equal(js.initializeAppCheckCalled, false);
    assert.equal(js.jsAppId, "1:proj:web:abc");
    assert.equal(js.status, "unsupported_identity");
  }

  {
    const ios = await initializeNativeAppCheck({
      isProduction: true,
      debugTokenPresent: false,
      port: {
        platform: "ios",
        nativeAppId: "1:proj:ios:xyz",
        initialize: async () => undefined,
        getToken: async () => ({ token: "attest-token", expireTimeMillis: Date.now() + 3600_000 }),
      },
    });
    assert.equal(ios.provider, "appAttest");
    assert.equal(ios.tokenObtained, false);
    assert.notEqual(ios.provider, "playIntegrity");
    const probedIos = await probeNativeAppCheckTokens({
      port: {
        platform: "ios",
        nativeAppId: "1:proj:ios:xyz",
        initialize: async () => undefined,
        getToken: async () => ({ token: "attest-token", expireTimeMillis: Date.now() + 3600_000 }),
      },
    });
    assert.equal(probedIos.tokenObtained, true);
  }

  {
    const android = await initializeNativeAppCheck({
      isProduction: true,
      debugTokenPresent: false,
      port: {
        platform: "android",
        nativeAppId: "1:proj:android:xyz",
        initialize: async () => undefined,
        getToken: async () => {
          throw new Error("Play Integrity unavailable in this harness");
        },
      },
    });
    assert.equal(android.provider, "playIntegrity");
    assert.equal(android.tokenObtained, false);
    assert.equal(android.status, "initialized");
  }

  {
    const refreshCalls: boolean[] = [];
    await initializeNativeAppCheck({
      isProduction: true,
      debugTokenPresent: false,
      port: {
        platform: "android",
        nativeAppId: "1:proj:android:xyz",
        initialize: async () => undefined,
        getToken: async (forceRefresh) => {
          refreshCalls.push(forceRefresh);
          return { token: "native-token", expireTimeMillis: Date.now() - 1 };
        },
      },
    });
    assert.deepEqual(refreshCalls, []);
    const probed = await probeNativeAppCheckTokens({
      port: {
        platform: "android",
        nativeAppId: "1:proj:android:xyz",
        initialize: async () => undefined,
        getToken: async (forceRefresh) => {
          refreshCalls.push(forceRefresh);
          return { token: "native-token", expireTimeMillis: Date.now() - 1 };
        },
      },
      forceRefresh: true,
    });
    assert.deepEqual(refreshCalls, [false, true]);
    assert.equal(probed.tokenObtained, true);
  }

  {
    const prev = process.env.FIREBASE_APP_CHECK_DEBUG_TOKEN;
    process.env.FIREBASE_APP_CHECK_DEBUG_TOKEN = "forbidden-debug";
    try {
      const report = await initializeAppCheckLayer({
        isProduction: true,
        getJsApp: () => ({ options: { appId: "1:proj:web:abc" } }),
        importJsSdk: async () => ({
          CustomProvider: function CustomProvider() {},
          initializeAppCheck: function initializeAppCheck() {},
        }),
      });
      assert.equal(report.productionDebugTokenForbidden, true);
      assert.equal(report.native, "failed");
      assert.equal(report.nativeProvider, "debug");
    } finally {
      if (prev === undefined) delete process.env.FIREBASE_APP_CHECK_DEBUG_TOKEN;
      else process.env.FIREBASE_APP_CHECK_DEBUG_TOKEN = prev;
    }
  }

  {
    let jsInitializeCalled = false;
    const report = await initializeAppCheckLayer({
      isProduction: true,
      getJsApp: () => ({ options: { appId: "1:proj:web:abc" } }),
      nativePort: {
        platform: "android",
        nativeAppId: "1:proj:android:xyz",
        initialize: async () => undefined,
        getToken: async () => ({ token: "native-token" }),
      },
      importJsSdk: async () => ({
        CustomProvider: function CustomProvider() {},
        initializeAppCheck: () => {
          jsInitializeCalled = true;
        },
      }),
    });
    assert.equal(jsInitializeCalled, false);
    assert.equal(report.initializeAppCheckCalledOnJs, false);
    assert.equal(report.customProviderBridgeAccepted, false);
    assert.equal(report.nativeProvider, "playIntegrity");
    assert.equal(report.jsProvider, "none");
    assert.equal(report.nativeTokenObtained, false);
    assert.equal(report.jsAppId, "1:proj:web:abc");
    assert.equal(report.nativeAppId, "1:proj:android:xyz");
    assert.equal(report.bridgeFailure, APP_CHECK_CUSTOM_PROVIDER_BRIDGE_FAILURE);
    const stored = getLastAppCheckInitReport();
    assert.equal(stored?.nativeTokenObtained, false);
    const diagnostic = await getAppCheckDiagnosticPromise();
    assert.equal(diagnostic?.nativeTokenObtained, true);
  }

  {
    const bootstrap = read("src/services/appCheck/bootstrap.ts");
    assert.doesNotMatch(bootstrap, /mocked-native-app-check-token/);
    assert.match(bootstrap, /setLastAppCheckInitReport/);
    const coordinator = read("src/startup/coordinator.ts");
    assert.match(coordinator, /initializeAppCheckLayer/);
    assert.doesNotMatch(coordinator, /getToken\(true\)/);
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
    const guards = read("src/startup/guards.ts");
    assert.match(guards, /EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN/);
  }

  console.log("appCheck.static.test.ts: ok");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
