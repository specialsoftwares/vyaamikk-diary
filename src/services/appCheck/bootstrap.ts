/**
 * Dual-SDK App Check bootstrap. Failures are reported, not used to crash
 * startup, because backend enforcement is off. Production debug tokens are
 * forbidden.
 */

import { attemptNativeToJsCustomProviderBridge } from "./customProviderBridge";
import { initializeJsAppCheck } from "./jsAppCheck";
import { initializeNativeAppCheck } from "./nativeAppCheck";
import {
  APP_CHECK_CUSTOM_PROVIDER_BRIDGE_FAILURE,
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
}): Promise<AppCheckInitReport> {
  const debug = debugTokenPresent();
  const productionDebugTokenForbidden = input.isProduction && debug;
  const native = productionDebugTokenForbidden
    ? { status: "failed" as const, provider: "debug" as const }
    : await initializeNativeAppCheck({
        isProduction: input.isProduction,
        debugTokenPresent: debug,
      });
  const js = input.getJsApp
    ? await initializeJsAppCheck({
        isProduction: input.isProduction,
        getApp: input.getJsApp,
      })
    : {
        status: "not_attempted" as const,
        provider: "none" as const,
        customProviderBridgeAccepted: false as const,
        bridgeFailure: APP_CHECK_CUSTOM_PROVIDER_BRIDGE_FAILURE,
        sdkModulePresent: false,
      };
  const bridge = attemptNativeToJsCustomProviderBridge({
    nativeToken: "mocked-native-app-check-token",
  });
  return {
    native: native.status,
    js: js.status,
    nativeProvider: native.provider,
    jsProvider: js.provider,
    debugTokenConfigured: debug,
    productionDebugTokenForbidden,
    customProviderBridgeAccepted: bridge.acceptedAsDualSdkCoverage,
    bridgeFailure: bridge.failure,
  };
}
