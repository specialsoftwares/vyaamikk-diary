/**
 * Crash reporting service — wraps Firebase Crashlytics.
 * All methods are no-ops if Crashlytics is unavailable or user has not consented.
 * Collection stays off until setCrashReportingEnabled(true).
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
};

/** Result of asking the native SDK to collect or stop. Never treats a missing module or a rejected call as success. */
export type CrashActivationResult = Readonly<{
  ok: boolean;
  status: "enabled" | "disabled" | "unavailable" | "rejected";
  /** This client has no unsent-report deletion API. Queued reports are not separately deletable. */
  queuedReportsSeparatelyDeletable: false;
  unsentReports: "not_applicable" | "not_separately_deletable";
}>;

let _enabled = false;
let _activationEpoch = 0;
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
  _testClient = undefined;
}

function failedActivation(status: "unavailable" | "rejected"): CrashActivationResult {
  return {
    ok: false,
    status,
    queuedReportsSeparatelyDeletable: false,
    unsentReports: "not_separately_deletable",
  };
}

/**
 * Enables or disables native collection and reports whether that call stuck.
 * Automatic collection stays off until a successful enable result.
 * Withdrawal disables collection. The installed client has no API to delete
 * unsent reports, so those stay queued and are not separately deletable.
 */
export function setCrashReportingEnabled(enabled: boolean): Promise<CrashActivationResult> {
  const epoch = ++_activationEpoch;
  const stillCurrent = () => epoch === _activationEpoch;
  const client = getCrashlytics();
  if (!client) {
    if (stillCurrent()) _enabled = false;
    return Promise.resolve(failedActivation("unavailable"));
  }
  let pending: Promise<unknown>;
  try {
    pending = Promise.resolve(client.setCrashlyticsCollectionEnabled(enabled));
  } catch {
    if (stillCurrent()) _enabled = false;
    return Promise.resolve(failedActivation("rejected"));
  }
  // Opt-out drops the pseudonymous user id so a later enable cannot resend it.
  // The consent toggle and decline paths call this function, not clearUser().
  if (!enabled) {
    try {
      void Promise.resolve(client.setUserId("")).catch(() => undefined);
    } catch {
      // The collection flag is still the gate. Identity cleanup is best-effort.
    }
  }
  // A present client applies the flag when the call is invoked so redaction
  // tests can observe the same turn. Only this call may roll the gate back.
  // An older rejection must not clear a newer allow, and an older success
  // must not turn the gate on after a newer withdrawal.
  if (stillCurrent()) _enabled = enabled;
  return pending.then(
    () => ({
      ok: true,
      status: enabled ? "enabled" : "disabled",
      queuedReportsSeparatelyDeletable: false,
      unsentReports: enabled ? "not_applicable" : "not_separately_deletable",
    }),
    () => {
      if (stillCurrent()) _enabled = false;
      return failedActivation("rejected");
    }
  );
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
