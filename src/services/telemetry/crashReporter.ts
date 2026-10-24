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

let _enabled = false;
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
  _testClient = undefined;
}

export function setCrashReportingEnabled(enabled: boolean): void {
  _enabled = enabled;
  try {
    const client = getCrashlytics();
    if (!client) return;
    void client.setCrashlyticsCollectionEnabled(enabled).catch(() => {});
  } catch {
    // Never throw from the crash reporter.
  }
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

export function setUserId(uid: string): void {
  if (!_enabled) return;
  try {
    const client = getCrashlytics();
    if (!client) return;
    // Store only a truncated UID — never the full UID in crash reports.
    void Promise.resolve(client.setUserId(uid.slice(0, 8))).catch(() => {});
  } catch {
    // Never throw from the crash reporter.
  }
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
