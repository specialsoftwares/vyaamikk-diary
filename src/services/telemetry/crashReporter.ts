/**
 * Crash reporting service — wraps Firebase Crashlytics.
 * All methods are no-ops if Crashlytics is unavailable or user has not consented.
 * Collection stays off until setCrashReportingEnabled(true).
 */

type CrashlyticsClient = {
  setCrashlyticsCollectionEnabled: (enabled: boolean) => Promise<unknown>;
  log: (message: string) => void;
  recordError: (error: Error) => void;
  setUserId: (id: string) => Promise<unknown> | void;
};

let _enabled = false;

function getCrashlytics(): CrashlyticsClient | null {
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
    if (context) client.log(context);
    client.recordError(error);
  } catch {
    // Never throw from the crash reporter.
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
    getCrashlytics()?.log(message);
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
