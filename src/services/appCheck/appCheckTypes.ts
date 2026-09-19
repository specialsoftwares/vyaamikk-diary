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
  | "not_attempted"
  | "unsupported_identity";

export interface AppCheckInitReport {
  native: AppCheckInitStatus;
  js: AppCheckInitStatus;
  nativeProvider: AppCheckProviderKind;
  jsProvider: AppCheckProviderKind;
  debugTokenConfigured: boolean;
  productionDebugTokenForbidden: boolean;
  customProviderBridgeAccepted: false;
  bridgeFailure: string;
  nativeTokenObtained: boolean;
  jsAppId: string | null;
  nativeAppId: string | null;
  jsCustomProviderApiPresent: boolean;
  jsInitializeApiPresent: boolean;
  initializeAppCheckCalledOnJs: false;
}

export const APP_CHECK_CUSTOM_PROVIDER_BRIDGE_FAILURE =
  "Native-to-JS CustomProvider is unsupported for this app identity: RNFirebase tokens bind to the native Android/iOS app, while firebase/app-check tokens bind to the JS/web appId. Copying getToken output does not prove JS project binding, refresh, or backend acceptance. initializeAppCheck is not called on the JS SDK in this candidate.";

let lastReport: AppCheckInitReport | null = null;

export function setLastAppCheckInitReport(report: AppCheckInitReport | null): void {
  lastReport = report;
}

export function getLastAppCheckInitReport(): AppCheckInitReport | null {
  return lastReport;
}
