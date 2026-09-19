/**
 * Dual-SDK App Check bootstrap. Failures are reported, not used to crash
 * startup, because backend enforcement is off. Production debug tokens are
 * forbidden. Native getToken is never copied into JS CustomProvider.
 */

import { evaluateNativeToJsCustomProvider } from "./customProviderBridge";
import { initializeJsAppCheck } from "./jsAppCheck";
import { initializeNativeAppCheck } from "./nativeAppCheck";
import {
  APP_CHECK_CUSTOM_PROVIDER_BRIDGE_FAILURE,
  setLastAppCheckInitReport,
  type AppCheckInitReport,
} from "./appCheckTypes";

function debugTokenPresent(): boolean {
  return Boolean(
    process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN ||
      process.env.FIREBASE_APP_CHECK_DEBUG_TOKEN
  );
}

export async function initializeAppCheckLayer(input: {
  isProduction: boolean;
  getJsApp?: () => unknown;
  nativePort?: Parameters<typeof initializeNativeAppCheck>[0]["port"];
  importJsSdk?: Parameters<typeof initializeJsAppCheck>[0]["importSdk"];
}): Promise<AppCheckInitReport> {
  const debug = debugTokenPresent();
  const productionDebugTokenForbidden = input.isProduction && debug;
  const native = productionDebugTokenForbidden
    ? { status: "failed" as const, provider: "debug" as const, tokenObtained: false, appId: null }
    : await initializeNativeAppCheck({
        isProduction: input.isProduction,
        debugTokenPresent: debug,
        port: input.nativePort,
      });
  const js = input.getJsApp
    ? await initializeJsAppCheck({
        isProduction: input.isProduction,
        getApp: input.getJsApp,
        importSdk: input.importJsSdk,
      })
    : {
        status: "not_attempted" as const,
        provider: "none" as const,
        customProviderBridgeAccepted: false as const,
        bridgeFailure: APP_CHECK_CUSTOM_PROVIDER_BRIDGE_FAILURE,
        sdkModulePresent: false,
        customProviderApiPresent: false,
        initializeAppCheckApiPresent: false,
        recaptchaProviderPresent: false,
        jsAppId: null,
        initializeAppCheckCalled: false as const,
      };
  const bridge = evaluateNativeToJsCustomProvider({
    nativeTokenPresent: native.tokenObtained,
    jsAppId: js.jsAppId,
    nativeAppId: native.appId,
  });
  const report: AppCheckInitReport = {
    native: native.status,
    js: js.status,
    nativeProvider: native.provider,
    jsProvider: js.provider,
    debugTokenConfigured: debug,
    productionDebugTokenForbidden,
    customProviderBridgeAccepted: false,
    bridgeFailure: bridge.failure,
    nativeTokenObtained: native.tokenObtained,
    jsAppId: js.jsAppId,
    nativeAppId: native.appId,
    jsCustomProviderApiPresent: js.customProviderApiPresent,
    jsInitializeApiPresent: js.initializeAppCheckApiPresent,
    initializeAppCheckCalledOnJs: false,
  };
  setLastAppCheckInitReport(report);
  return report;
}
