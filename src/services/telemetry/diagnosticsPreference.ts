import { clearUser, setCrashReportingEnabled } from "@/services/telemetry/crashReporter";
import { readTelemetryConsent, writeTelemetryConsent } from "@/services/telemetry/telemetryConsent";

export type DiagnosticsPreference = Readonly<{
  desired: "unknown" | "off" | "on";
  persisted: boolean;
  nativeState: "off" | "on" | "next_launch" | "unavailable" | "error";
  revision: number;
  error: string | null;
}>;

let revision = 0;
let chain: Promise<void> = Promise.resolve();
let latest: DiagnosticsPreference = {
  desired: "unknown",
  persisted: false,
  nativeState: "off",
  revision: 0,
  error: null,
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
    if (enabled) setCrashReportingEnabled(true);
    else setCrashReportingEnabled(false);
    latest = {
      desired: stored == null ? "unknown" : enabled ? "on" : "off",
      persisted: stored != null,
      nativeState: enabled ? "on" : "off",
      revision: seen,
      error: null,
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

/**
 * Opt-out closes the session gate before persistence. A failed write does not
 * turn reporting back on. Opt-in enables sends only after the choice is stored.
 * Native collection changes can take effect on the next launch.
 */
export function applyDiagnosticsChoice(enabled: boolean): Promise<DiagnosticsPreference> {
  const rev = ++revision;
  if (!enabled) setCrashReportingEnabled(false);
  return enqueue(async () => {
    try {
      await writeTelemetryConsent(enabled);
      if (rev !== revision) return latest;
      if (enabled) setCrashReportingEnabled(true);
      latest = {
        desired: enabled ? "on" : "off",
        persisted: true,
        nativeState: enabled ? "next_launch" : "off",
        revision: rev,
        error: null,
      };
    } catch {
      if (rev !== revision) return latest;
      setCrashReportingEnabled(false);
      latest = {
        desired: enabled ? "on" : "off",
        persisted: false,
        nativeState: "error",
        revision: rev,
        error: "save_failed",
      };
    }
    return latest;
  });
}
