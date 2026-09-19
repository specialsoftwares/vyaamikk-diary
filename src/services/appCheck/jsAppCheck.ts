/**
 * JS Firebase App Check on getFirebaseApp(). Native RNFirebase tokens do not
 * stamp JS Firestore/Functions. initializeAppCheck is not called with an
 * unproven CustomProvider — that would attach a failing token source.
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
};

export async function initializeJsAppCheck(_input: {
  isProduction: boolean;
  getApp: () => unknown;
}): Promise<JsAppCheckInitResult> {
  const bridgeFailure = APP_CHECK_CUSTOM_PROVIDER_BRIDGE_FAILURE;
  try {
    await import("firebase/app-check");
    return {
      status: "not_attempted",
      provider: "none",
      customProviderBridgeAccepted: false,
      bridgeFailure,
      sdkModulePresent: true,
    };
  } catch {
    return {
      status: "module_unavailable",
      provider: "none",
      customProviderBridgeAccepted: false,
      bridgeFailure,
      sdkModulePresent: false,
    };
  }
}
