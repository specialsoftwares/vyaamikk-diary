/**
 * App Check source integration (no production enforcement).
 * Native RNFirebase App Check and JS firebase/app-check are separate SDK
 * contexts. A copied native token is not dual-SDK coverage.
 */

export type AppCheckProviderKind = "playIntegrity" | "appAttest" | "debug" | "none";

export type AppCheckInitStatus =
  | "initialized"
  | "skipped_non_native"
  | "module_unavailable"
  | "failed"
  | "not_attempted";

export interface AppCheckInitReport {
  native: AppCheckInitStatus;
  js: AppCheckInitStatus;
  nativeProvider: AppCheckProviderKind;
  jsProvider: AppCheckProviderKind;
  debugTokenConfigured: boolean;
  productionDebugTokenForbidden: boolean;
  customProviderBridgeAccepted: false;
  bridgeFailure: string;
}

export const APP_CHECK_CUSTOM_PROVIDER_BRIDGE_FAILURE =
  "Native-to-JS CustomProvider is not accepted: a token string returned from a mock or native getToken does not prove JS app/project binding, refresh, or backend acceptance on firebase@12 / @react-native-firebase/app-check@24.";
