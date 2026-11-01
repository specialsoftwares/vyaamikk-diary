import { clearUser, setCrashReportingEnabled, type UnsentReportState, type CrashStopOptions, type CrashActivationResult } from "@/services/telemetry/crashReporter";
import { readTelemetryConsent, writeTelemetryConsent } from "@/services/telemetry/telemetryConsent";

export type DiagnosticsPreference = Readonly<{
  desired: "unknown" | "off" | "on";
  persisted: boolean;
  nativeState: "off" | "on" | "next_launch" | "unavailable" | "error";
  revision: number;
  error: string | null;
  /** Native deletion requested is not a remote recall or deletion receipt. */
  unsentReports: UnsentReportState;
}>;

let revision = 0;
let chain: Promise<void> = Promise.resolve();
let latest: DiagnosticsPreference = {
  desired: "unknown",
  persisted: false,
  nativeState: "off",
  revision: 0,
  error: null,
  unsentReports: "not_applicable",
};

export function currentDiagnosticsPreference(): DiagnosticsPreference {
  return latest;
}

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const run = chain.then(work, work);
  chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export function resetDiagnosticsPreferenceForTests(): void {
  revision = 0;
  chain = Promise.resolve();
  latest = {
    desired: "unknown",
    persisted: false,
    nativeState: "off",
    revision: 0,
    error: null,
    unsentReports: "not_applicable",
  };
}

export function loadDiagnosticsPreference(): Promise<DiagnosticsPreference> {
  const seen = revision;
  return enqueue(async () => {
    if (seen !== revision) return latest;
    if (latest.revision > 0 && !latest.persisted) return latest;
    const stored = await readTelemetryConsent();
    if (seen !== revision) return latest;
    if (latest.revision > 0 && !latest.persisted) return latest;
    const enabled = stored === true;
    // The legacy on-device flag is not server acknowledgement. Keep collection
    // off until the purpose-consent queue activates it for this session.
    const closed = await setCrashReportingEnabled(false);
    if (seen !== revision) return latest;
    latest = {
      desired: stored == null ? "unknown" : enabled ? "on" : "off",
      persisted: stored != null,
      nativeState: closed.ok ? "off" : nativeFailure(closed),
      revision: seen,
      error: closed.ok ? null : "activation_failed",
      unsentReports: closed.unsentReports,
    };
    return latest;
  });
}

/** Production bridge entry. Applies stored consent only when it is still current. */
export async function runCrashReportingBridge(): Promise<DiagnosticsPreference> {
  const pref = await loadDiagnosticsPreference();
  clearUser();
  return pref;
}

function nativeFailure(activation: CrashActivationResult): DiagnosticsPreference["nativeState"] {
  return activation.status === "unavailable" ? "unavailable" : "error";
}

/**
 * Opt-out closes the session gate before persistence. A failed write does not
 * turn reporting back on. Opt-in enables sends only after the choice is stored
 * and the native SDK accepts collection. A missing or rejected SDK stays off.
 * Native collection changes can take effect on the next launch.
 */
export function applyDiagnosticsChoice(
  enabled: boolean, options: CrashStopOptions = { deleteUnsentReports: !enabled }
): Promise<DiagnosticsPreference> {
  const rev = ++revision;
  if (!enabled) void setCrashReportingEnabled(false, options);
  return enqueue(async () => {
    try {
      await writeTelemetryConsent(enabled);
      if (rev !== revision) return latest;
      const activation = await setCrashReportingEnabled(enabled, options);
      if (rev !== revision) return latest;
      if (!activation.ok) {
        latest = {
          desired: enabled ? "on" : "off",
          persisted: true,
          nativeState: nativeFailure(activation),
          revision: rev,
          error: activation.status === "unavailable" ? "unavailable" : "activation_failed",
          unsentReports: activation.unsentReports,
        };
        return latest;
      }
      latest = {
        desired: enabled ? "on" : "off",
        persisted: true,
        nativeState: enabled ? "next_launch" : "off",
        revision: rev,
        error: null,
        unsentReports: activation.unsentReports,
      };
    } catch {
      if (rev !== revision) return latest;
      const closed = await setCrashReportingEnabled(false, enabled ? {} : options);
      latest = {
        desired: enabled ? "on" : "off",
        persisted: false,
        nativeState: "error",
        revision: rev,
        error: "save_failed",
        unsentReports: closed.unsentReports,
      };
    }
    return latest;
  });
}
