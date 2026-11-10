/**
 * Locked Android delivery: automatic collection is always disabled. The native
 * bootstrap resets persistent SDK/RNFirebase overrides BEFORE Firebase init.
 * Account-scoped, revision-acknowledged manual dispatch is separate from local
 * sanitized recording. A successful bridge call is not an upload receipt.
 * Signed-device startup/upgrade/withdrawal checks — NOT RUN.
 */

export type CrashSdkBridge = {
  /** Opens only the native manual-reporting session; automatic collection stays off. */
  setSessionReportingEnabled: (enabled: boolean, ownerUid?: string | null, consentRevision?: number | null) => Promise<unknown>;
  /** FirebaseCrashlytics.deleteUnsentReports. Resolving is not a deletion receipt. */
  deleteUnsentReports?: () => Promise<unknown> | void;
  /**
   * FirebaseCrashlytics.recordException. Used because the RNFirebase recordError
   * method no-ops while the auto-collection preference stays false.
   */
  recordDiagnostic?: (message: string) => Promise<unknown> | void;
  /** FirebaseCrashlytics.log. Same preference bypass as recordDiagnostic. */
  logDiagnostic?: (message: string) => Promise<unknown> | void;
};

export type PreferenceWriter = {
  /** RNFirebase setter. Production calls this with false only. */
  setCrashlyticsCollectionEnabled: (enabled: boolean) => Promise<unknown>;
  deleteUnsentReports?: () => Promise<unknown> | void;
};

let bridgeOverride: CrashSdkBridge | null | undefined;

export function __setCrashSdkBridgeForTests(bridge: CrashSdkBridge | null | undefined): void {
  bridgeOverride = bridge;
}

export function __resetCrashSdkBridgeForTests(): void {
  bridgeOverride = undefined;
}

export function getCrashSdkBridge(): CrashSdkBridge | null {
  if (bridgeOverride !== undefined) return bridgeOverride;
  try {
    const reactNative = require("react-native") as {
      NativeModules?: { CrashConsentBridge?: CrashSdkBridge };
    };
    const native = reactNative.NativeModules?.CrashConsentBridge;
    if (!native || typeof native.setSessionReportingEnabled !== "function") return null;
    return native;
  } catch {
    return null;
  }
}

/** Actual SDK precedence before the guarded bootstrap migration runs. */
export function nextProcessCrashCollectionEnabled(input: {
  sdkOverride?: boolean | null;
  preference: boolean | null;
  firebaseJson: boolean | null;
  manifest: boolean | null;
}): boolean {
  if (input.sdkOverride != null) return input.sdkOverride;
  if (input.manifest !== null) return input.manifest;
  return true;
}

/** Persist auto-collection off. Never writes the RNFirebase preference true. */
export async function writeAutoCollectionPreferenceFalse(
  writer: PreferenceWriter | null
): Promise<"written" | "missing" | "failed"> {
  if (!writer) return "missing";
  try {
    await writer.setCrashlyticsCollectionEnabled(false);
    return "written";
  } catch {
    return "failed";
  }
}

export async function setRuntimeSdkCollection(enabled: boolean, scope?: { ownerUid?: string; consentRevision?: number }): Promise<"set" | "unavailable" | "failed"> {
  const bridge = getCrashSdkBridge();
  if (!bridge) return "unavailable";
  try {
    await bridge.setSessionReportingEnabled(enabled, scope?.ownerUid ?? null, scope?.consentRevision ?? null);
    return "set";
  } catch {
    return "failed";
  }
}

/**
 * Asks the bridge, or the RNFirebase deleter if the bridge is absent, to drop
 * unsent reports. The call has no completion proof. Uploaded reports stay.
 */
export async function requestUnsentReportDeletion(
  writer: PreferenceWriter | null
): Promise<"deletion_requested" | "unavailable" | "error"> {
  const bridge = getCrashSdkBridge();
  const deleter = bridge?.deleteUnsentReports ?? writer?.deleteUnsentReports;
  if (typeof deleter !== "function") return "unavailable";
  try {
    await deleter();
    return "deletion_requested";
  } catch {
    return "error";
  }
}
