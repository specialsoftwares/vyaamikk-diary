import React, { useEffect } from "react";

import { useAuth } from "@/state/auth";

import { clearUser, setCrashReportingEnabled, setUserId } from "./crashReporter";
import { readTelemetryConsent } from "./telemetryConsent";

/**
 * Applies stored crash-report consent after auth is available.
 * Missing consent stays off. Never enables collection by default.
 */
export function CrashReportingBridge() {
  const { status, user } = useAuth();
  const uid = status === "signed_in" ? user?.uid : undefined;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const consent = await readTelemetryConsent();
      if (cancelled) return;
      const enabled = consent === true;
      setCrashReportingEnabled(enabled);
      if (enabled && uid) setUserId(uid);
      else clearUser();
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return null;
}
