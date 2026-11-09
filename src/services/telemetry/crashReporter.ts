/**
 * Crash reporting service — wraps Firebase Crashlytics.
 * All methods are no-ops if Crashlytics is unavailable or user has not consented.
 * Collection stays off until setCrashReportingEnabled(true) resolves successfully.
 * A development session does not enable collection on its own. Consent is required.
 *
 * Locked SDK: @react-native-firebase/crashlytics 24.1.0.
 * Methods used: setCrashlyticsCollectionEnabled, and deleteUnsentReports.
 * This SDK exports deleteUnsentReports on the TypeScript client and the Android
 * module (FirebaseCrashlytics.deleteUnsentReports). It deletes unsent reports
 * only. It does not delete reports that have already been uploaded.
 * If a test double omits deleteUnsentReports, this module does not invent the call.
 *
 * Native recordError/log receive only safe diagnostic values. The original
 * application Error is never copied or mutated.
 */

import {
  classifyContext,
  createSafeDiagnosticError,
} from "@/utils/safeDiagnostics";

type CrashlyticsClient = {
  setCrashlyticsCollectionEnabled: (enabled: boolean) => Promise<unknown>;
  log: (message: string) => void;
  recordError: (error: Error) => void;
  setUserId: (id: string) => Promise<unknown> | void;
  deleteUnsentReports?: () => Promise<void> | void;
};

/** A deletion request is not proof that native deletion finished, and it is not a remote recall. */
export type UnsentReportState = "not_applicable" | "retained" | "deletion_requested" | "unavailable" | "error";
export type CrashStopOptions = Readonly<{ deleteUnsentReports?: boolean }>;
export type CrashActivationResult = Readonly<{
  ok: boolean;
  status: "enabled" | "disabled" | "unavailable" | "rejected" | "superseded";
  queuedReportsSeparatelyDeletable: boolean;
  unsentReports: UnsentReportState;
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

/** Test-only. Restores disabled default and clears the injected port. */
export function __resetCrashReportingForTests(): void {
  _enabled = false;
  _activationEpoch += 1;
  _nativeQueue = Promise.resolve();
  _cleanupRequired = false;
  _cleanupEpoch = 0;
  _testClient = undefined;
}

function result(
  status: CrashActivationResult["status"],
  unsentReports: UnsentReportState,
  canDelete: boolean
): CrashActivationResult {
  return {
    ok: status === "enabled" || status === "disabled",
    status,
    queuedReportsSeparatelyDeletable: canDelete,
    unsentReports,
  };
}

/**
 * Close the JS reporting gate synchronously, including when native calls throw.
 * Native operations are ordered so an older enable cannot finish after the
 * final disable. Pausing retains cached reports while authority is uncertain.
 * Explicit withdrawal and account retirement request deletion of unsent reports.
 * Disable runs immediately, without waiting for an older enable. Already
 * uploaded reports cannot be recalled by this API.
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
  const client = getCrashlytics();
  if (!client) return Promise.resolve(result("unavailable", "unavailable", false));
  const canDelete = typeof client.deleteUnsentReports === "function";
  let immediateStop: Promise<boolean> | null = null;
  if (!enabled) {
    try {
      immediateStop = Promise.resolve(client.setCrashlyticsCollectionEnabled(false)).then(
        () => true,
        () => false
      );
    } catch {
      immediateStop = Promise.resolve(false);
    }
    try {
      void Promise.resolve(client.setUserId("")).catch(() => undefined);
    } catch {
      // Best effort. The gate is already closed.
    }
  }
  const work = async (): Promise<CrashActivationResult> => {
    if (enabled && !stillCurrent()) return result("superseded", "not_applicable", canDelete);
    try {
      if (immediateStop) await immediateStop;
      // A failed unsent-report deletion must not let those reports leave on the next enable.
      if (!enabled || _cleanupRequired) {
        await client.setCrashlyticsCollectionEnabled(false);
        if (!_cleanupRequired) {
          return result(stillCurrent() ? "disabled" : "superseded", "retained", canDelete);
        }
        if (!canDelete) return result("unavailable", "unavailable", false);
        try {
          const cleanupEpoch = _cleanupEpoch;
          await client.deleteUnsentReports!();
          if (cleanupEpoch === _cleanupEpoch) _cleanupRequired = false;
        } catch {
          return result("rejected", "error", true);
        }
        if (!enabled) {
          return result(stillCurrent() ? "disabled" : "superseded", "deletion_requested", true);
        }
      }
      if (!stillCurrent()) return result("superseded", "not_applicable", canDelete);
      await client.setCrashlyticsCollectionEnabled(true);
      if (!stillCurrent()) return result("superseded", "not_applicable", canDelete);
      _enabled = true;
      return result("enabled", "not_applicable", canDelete);
    } catch {
      if (stillCurrent()) _enabled = false;
      return result("rejected", enabled ? "not_applicable" : "error", canDelete);
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
    const client = getCrashlytics();
    if (!client) return;
    const safeContext = classifyContext(context);
    const safe = createSafeDiagnosticError(error, safeContext);
    if (safeContext) client.log(safeContext);
    client.recordError(safe);
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
    const safe = classifyContext(message) ?? "app";
    getCrashlytics()?.log(safe);
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
