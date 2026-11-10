/**
 * Crash reporting service — wraps Firebase Crashlytics.
 * All methods are no-ops if Crashlytics is unavailable or user has not consented.
 * The JS gate opens only after the runtime bridge enables the running SDK.
 * A resolved RNFirebase preference write is not that proof, and this module
 * never writes the auto-collection preference true.
 * A development session does not enable collection on its own. Consent is required.
 *
 * Locked SDK: @react-native-firebase/crashlytics 24.1.0.
 * setCrashlyticsCollectionEnabled only persists KEY_CRASHLYTICS_AUTO_COLLECTION_ENABLED.
 * The running SDK is changed only through CrashConsentBridge.
 * deleteUnsentReports deletes unsent reports only, with no completion proof.
 * It does not delete reports that have already been uploaded.
 * This module does not call sendUnsentReports.
 * If a test double omits deleteUnsentReports, this module does not invent the call.
 *
 * JavaScript reports go through the runtime bridge. The RNFirebase recordError
 * and log methods are not used: they no-op while the preference stays false.
 * The original application Error is never copied or mutated.
 */

import {
  classifyContext,
  createSafeDiagnosticError,
} from "@/utils/safeDiagnostics";
import {
  __resetCrashSdkBridgeForTests,
  getCrashSdkBridge,
  requestUnsentReportDeletion,
  setRuntimeSdkCollection,
  writeAutoCollectionPreferenceFalse,
  type PreferenceWriter,
} from "@/services/telemetry/crashNativeCollection";

type CrashlyticsClient = PreferenceWriter & {
  log: (message: string) => void;
  recordError: (error: Error) => void;
  setUserId: (id: string) => Promise<unknown> | void;
};

/** A deletion request is not proof that native deletion finished, and it is not a remote recall. */
export type UnsentReportState = "not_applicable" | "retained" | "deletion_requested" | "unavailable" | "error";
export type CrashStopOptions = Readonly<{ deleteUnsentReports?: boolean }>;
export type CrashActivationResult = Readonly<{
  ok: boolean;
  status: "enabled" | "disabled" | "unavailable" | "rejected" | "superseded";
  queuedReportsSeparatelyDeletable: boolean;
  unsentReports: UnsentReportState;
  /** This attempt never writes the auto-collection preference true. */
  preference: false;
  /** Running SDK collection after the bridge call. False when the bridge did not enable it. */
  sdkCollection: boolean;
}>;

let _enabled = false;
let _activationEpoch = 0;
let _nativeQueue: Promise<void> = Promise.resolve();
let _cleanupRequired = false;
let _cleanupEpoch = 0;
let _testClient: CrashlyticsClient | null | undefined;

function getCrashlytics(): CrashlyticsClient | null {
  if (_testClient !== undefined) return _testClient;
  try {
    // Loaded on use so a missing native binary cannot crash module import.
    const mod = require("@react-native-firebase/crashlytics") as {
      default: () => CrashlyticsClient;
    };
    return mod.default();
  } catch {
    return null;
  }
}

/** Test-only injected port. Pass null to simulate a missing native SDK. */
export function __setCrashlyticsClientForTests(client: CrashlyticsClient | null | undefined): void {
  _testClient = client;
}

export { __setCrashSdkBridgeForTests } from "@/services/telemetry/crashNativeCollection";

/** Test-only. Restores disabled default and clears the injected port. */
export function __resetCrashReportingForTests(): void {
  _enabled = false;
  _activationEpoch += 1;
  _nativeQueue = Promise.resolve();
  _cleanupRequired = false;
  _cleanupEpoch = 0;
  _testClient = undefined;
  __resetCrashSdkBridgeForTests();
}

function result(
  status: CrashActivationResult["status"],
  unsentReports: UnsentReportState,
  canDelete: boolean,
  sdkCollection: boolean
): CrashActivationResult {
  return {
    ok: status === "enabled" || status === "disabled",
    status,
    queuedReportsSeparatelyDeletable: canDelete,
    unsentReports,
    preference: false,
    sdkCollection,
  };
}

function canDeleteUnsent(writer: PreferenceWriter | null): boolean {
  return typeof (getCrashSdkBridge()?.deleteUnsentReports ?? writer?.deleteUnsentReports) === "function";
}

/**
 * Close the JS reporting gate synchronously, including when native calls throw.
 * Native operations are ordered so an older enable cannot finish after the
 * final disable. Pausing retains cached reports while authority is uncertain.
 * Explicit withdrawal and account retirement request deletion of unsent reports.
 * Disable runs immediately, without waiting for an older enable. Already
 * uploaded reports cannot be recalled by this API.
 * Enabling does not write the RNFirebase preference true and does not open the
 * JS gate unless the runtime bridge reports the running SDK enabled.
 */
export function setCrashReportingEnabled(
  enabled: boolean,
  options: CrashStopOptions = {}
): Promise<CrashActivationResult> {
  const epoch = ++_activationEpoch;
  const stillCurrent = () => epoch === _activationEpoch;
  _enabled = false;
  if (!enabled && options.deleteUnsentReports) {
    _cleanupRequired = true;
    _cleanupEpoch += 1;
  }
  if (!enabled) {
    const writer = getCrashlytics();
    void writeAutoCollectionPreferenceFalse(writer);
    void setRuntimeSdkCollection(false);
    if (options.deleteUnsentReports) void requestUnsentReportDeletion(writer);
    try {
      void Promise.resolve(writer?.setUserId("")).catch(() => undefined);
    } catch {
      // Best effort. The gate is already closed.
    }
  }
  const work = async (): Promise<CrashActivationResult> => {
    const writer = getCrashlytics();
    const canDelete = canDeleteUnsent(writer);
    if (enabled && !stillCurrent()) return result("superseded", "not_applicable", canDelete, false);
    const preferenceWrite = await writeAutoCollectionPreferenceFalse(writer);
    if (preferenceWrite === "failed") {
      if (stillCurrent()) _enabled = false;
      return result("rejected", enabled ? "not_applicable" : "error", canDelete, false);
    }
    try {
      if (!enabled || _cleanupRequired) {
        const closed = await setRuntimeSdkCollection(false);
        if (closed === "failed") return result("rejected", "error", canDelete, false);
        if (!_cleanupRequired) {
          return result(stillCurrent() ? "disabled" : "superseded", "retained", canDelete, false);
        }
        if (!canDelete) return result("unavailable", "unavailable", false, false);
        const cleanupEpoch = _cleanupEpoch;
        const deletion = await requestUnsentReportDeletion(writer);
        if (deletion === "error") return result("rejected", "error", true, false);
        if (cleanupEpoch === _cleanupEpoch && deletion === "deletion_requested") _cleanupRequired = false;
        if (!enabled) {
          if (deletion !== "deletion_requested") return result("unavailable", "unavailable", false, false);
          return result(stillCurrent() ? "disabled" : "superseded", "deletion_requested", true, false);
        }
      }
      if (!stillCurrent()) {
        await setRuntimeSdkCollection(false);
        return result("superseded", "not_applicable", canDelete, false);
      }
      const opened = await setRuntimeSdkCollection(true);
      if (!stillCurrent()) {
        await setRuntimeSdkCollection(false);
        return result("superseded", "not_applicable", canDelete, false);
      }
      if (opened !== "set") {
        if (opened === "failed") await setRuntimeSdkCollection(false);
        _enabled = false;
        return result(opened === "unavailable" ? "unavailable" : "rejected", "not_applicable", canDelete, false);
      }
      _enabled = true;
      return result("enabled", "not_applicable", canDelete, true);
    } catch {
      if (stillCurrent()) _enabled = false;
      return result("rejected", enabled ? "not_applicable" : "error", canDelete, false);
    }
  };
  const pending = _nativeQueue.then(work, work);
  _nativeQueue = pending.then(
    () => undefined,
    () => undefined
  );
  return pending;
}

export function recordError(error: Error, context?: string): void {
  if (!_enabled) return;
  try {
    const bridge = getCrashSdkBridge();
    if (!bridge?.recordDiagnostic) return;
    const safeContext = classifyContext(context);
    const safe = createSafeDiagnosticError(error, safeContext);
    if (safeContext && bridge.logDiagnostic) {
      void Promise.resolve(bridge.logDiagnostic(safeContext)).catch(() => undefined);
    }
    void Promise.resolve(bridge.recordDiagnostic(`${safe.name}:${safe.message}`)).catch(() => undefined);
  } catch {
    // Never throw from the crash reporter. Never print the raw input.
  }
}

export function setUserId(_uid: string): void {
  if (!_enabled) return;
  // Account identifiers are not diagnostic user ids, including a prefix.
  clearUser();
}

export function log(message: string): void {
  if (!_enabled) return;
  try {
    const bridge = getCrashSdkBridge();
    if (!bridge?.logDiagnostic) return;
    const safe = classifyContext(message) ?? "app";
    void Promise.resolve(bridge.logDiagnostic(safe)).catch(() => undefined);
  } catch {
    // Never throw from the crash reporter.
  }
}

export function clearUser(): void {
  try {
    const client = getCrashlytics();
    if (!client) return;
    void Promise.resolve(client.setUserId("")).catch(() => {});
  } catch {
    // Never throw from the crash reporter.
  }
}
