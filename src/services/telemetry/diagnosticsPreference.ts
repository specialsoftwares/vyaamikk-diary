import {
  clearUser,
  setCrashReportingEnabled,
  type UnsentReportState,
  type CrashStopOptions,
  type CrashActivationResult,
} from "@/services/telemetry/crashReporter";
import { readTelemetryConsent, writeTelemetryConsent } from "@/services/telemetry/telemetryConsent";

export type DiagnosticsPreference = Readonly<{
  desired: "unknown" | "off" | "on";
  persisted: boolean;
  nativeState: "off" | "on" | "next_launch" | "unavailable" | "error";
  revision: number;
  error: string | null;
  /** Native deletion requested is not a remote recall or a deletion receipt. */
  unsentReports: UnsentReportState;
  /** Running SDK collection. Absent means this record is not bridge proof. */
  sessionReporting?: boolean;
  /** RNFirebase auto-collection preference. Production leaves this false. */
  preference?: false;
  status?: CrashActivationResult["status"];
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
    // The legacy on-device flag is not consent for this account and it is not
    // a server acknowledgement. Debug and production startups keep collection off.
    const closed = await setCrashReportingEnabled(false);
    if (seen !== revision) return latest;
    const enabled = stored === true;
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

/** Production bridge entry. Does not enable collection from the legacy flag. */
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
 */
export function applyDiagnosticsChoice(
  enabled: boolean,
  options: CrashStopOptions = { deleteUnsentReports: !enabled }
): Promise<DiagnosticsPreference> {
  const rev = ++revision;
  if (!enabled) void setCrashReportingEnabled(false, options);
  return enqueue(async () => {
    try {
      await writeTelemetryConsent(enabled);
      if (rev !== revision) return latest;
      const activation = await setCrashReportingEnabled(enabled, options);
      if (rev !== revision) return latest;
      const bridgeOn =
        enabled &&
        activation.status === "enabled" &&
        activation.sessionReporting === true &&
        activation.preference === false;
      if (!activation.ok || (enabled && !bridgeOn)) {
        const unavailable =
          activation.status === "unavailable" ||
          (enabled && !bridgeOn && activation.status !== "rejected");
        latest = {
          desired: enabled ? "on" : "off",
          persisted: true,
          nativeState: unavailable ? "unavailable" : nativeFailure(activation),
          revision: rev,
          error: unavailable ? "unavailable" : "activation_failed",
          unsentReports: activation.unsentReports,
          sessionReporting: activation.sessionReporting,
          preference: false,
          status: unavailable ? "unavailable" : activation.status,
        };
        return latest;
      }
      latest = {
        desired: enabled ? "on" : "off",
        persisted: true,
        nativeState: bridgeOn ? "on" : "off",
        revision: rev,
        error: null,
        unsentReports: activation.unsentReports,
        sessionReporting: activation.sessionReporting,
        preference: false,
        status: activation.status,
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
