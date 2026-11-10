/**
 * Runtime crash collection vs the persisted RNFirebase auto-collection preference.
 *
 * Signed-device checks — NOT RUN. This file is not evidence that they passed.
 * After a signed build that includes modules/crash-consent:
 * - Allow enables collection only in the current process.
 * - Force-stop, then relaunch, stays disabled until Allow again.
 * - Withdrawal disables collection.
 * - Switching accounts does not keep the previous grant.
 * - logcat or a debug readout must show the RNFirebase auto-collection preference false.
 *
 * @react-native-firebase/crashlytics 24.1.0 Android:
 * setCrashlyticsCollectionEnabled only writes the auto-collection preference and
 * resolves. It does not call FirebaseCrashlytics.setCrashlyticsCollectionEnabled.
 * A resolved preference write is not proof the running SDK changed collection.
 * InitProvider.onCreate applies that preference once, before JavaScript consent.
 * deleteUnsentReports has no completion proof. Never call sendUnsentReports.
 * recordError, log, and setUserId on the RNFirebase module no-op while the
 * preference gate is false. JavaScript reports go through recordDiagnostic
 * and logDiagnostic on this bridge, which call the Firebase SDK directly.
 */

export type CrashSdkBridge = {
  /** FirebaseCrashlytics.setCrashlyticsCollectionEnabled. Does not touch the preference. */
  setSdkCollectionEnabled: (enabled: boolean) => Promise<unknown>;
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
    if (!native || typeof native.setSdkCollectionEnabled !== "function") return null;
    return native;
  } catch {
    return null;
  }
}

/**
 * Next process start, matching InitProvider.isCrashlyticsCollectionEnabled then
 * FirebaseCrashlytics.setCrashlyticsCollectionEnabled once. A stored preference
 * wins over firebase.json and the manifest. The in-memory SDK flag does not survive.
 * Preference false means the next process starts disabled.
 */
export function nextProcessCrashCollectionEnabled(input: {
  /** null when the preference key is absent. */
  preference: boolean | null;
  /** null when firebase.json has no crashlytics_auto_collection_enabled value. */
  firebaseJson: boolean | null;
  /** null when manifest meta is absent. */
  manifest: boolean | null;
}): boolean {
  if (input.preference !== null) return input.preference;
  if (input.firebaseJson !== null) return input.firebaseJson;
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

export async function setRuntimeSdkCollection(enabled: boolean): Promise<"set" | "unavailable" | "failed"> {
  const bridge = getCrashSdkBridge();
  if (!bridge) return "unavailable";
  try {
    await bridge.setSdkCollectionEnabled(enabled);
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
