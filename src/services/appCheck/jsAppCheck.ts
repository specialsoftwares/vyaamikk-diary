/**
 * JS Firebase App Check probe. Native RNFirebase tokens do not stamp JS
 * Firestore/Functions. initializeAppCheck is not called: attaching
 * CustomProvider with a native token would bind a failing/wrong-app source.
 */

import {
  APP_CHECK_CUSTOM_PROVIDER_BRIDGE_FAILURE,
  type AppCheckInitStatus,
  type AppCheckProviderKind,
} from "./appCheckTypes";

export type JsAppCheckInitResult = {
  status: AppCheckInitStatus;
  provider: AppCheckProviderKind;
  customProviderBridgeAccepted: false;
  bridgeFailure: string;
  sdkModulePresent: boolean;
  customProviderApiPresent: boolean;
  initializeAppCheckApiPresent: boolean;
  recaptchaProviderPresent: boolean;
  jsAppId: string | null;
  initializeAppCheckCalled: false;
};

export type JsAppCheckSdkModule = {
  CustomProvider?: unknown;
  initializeAppCheck?: unknown;
  ReCaptchaV3Provider?: unknown;
  ReCaptchaEnterpriseProvider?: unknown;
};

export async function initializeJsAppCheck(input: {
  isProduction: boolean;
  getApp: () => unknown;
  importSdk?: () => Promise<JsAppCheckSdkModule>;
}): Promise<JsAppCheckInitResult> {
  const bridgeFailure = APP_CHECK_CUSTOM_PROVIDER_BRIDGE_FAILURE;
  let sdk: JsAppCheckSdkModule;
  try {
    sdk = input.importSdk ? await input.importSdk() : ((await import("firebase/app-check")) as JsAppCheckSdkModule);
  } catch {
    return {
      status: "module_unavailable",
      provider: "none",
      customProviderBridgeAccepted: false,
      bridgeFailure,
      sdkModulePresent: false,
      customProviderApiPresent: false,
      initializeAppCheckApiPresent: false,
      recaptchaProviderPresent: false,
      jsAppId: readAppId(input.getApp),
      initializeAppCheckCalled: false,
    };
  }

  const customProviderApiPresent = typeof sdk.CustomProvider === "function";
  const initializeAppCheckApiPresent = typeof sdk.initializeAppCheck === "function";
  const recaptchaProviderPresent =
    typeof sdk.ReCaptchaV3Provider === "function" || typeof sdk.ReCaptchaEnterpriseProvider === "function";
  const jsAppId = readAppId(input.getApp);

  return {
    status: initializeAppCheckApiPresent ? "unsupported_identity" : "not_attempted",
    provider: "none",
    customProviderBridgeAccepted: false,
    bridgeFailure,
    sdkModulePresent: true,
    customProviderApiPresent,
    initializeAppCheckApiPresent,
    recaptchaProviderPresent,
    jsAppId,
    initializeAppCheckCalled: false,
  };
}

function readAppId(getApp: () => unknown): string | null {
  try {
    const app = getApp() as { options?: { appId?: unknown } } | null;
    const id = app?.options?.appId;
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}
