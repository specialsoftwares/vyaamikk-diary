import React, { useEffect } from "react";

import { useAuth } from "@/state/auth";

import { runCrashReportingBridge } from "./diagnosticsPreference";

/**
 * Applies stored crash-report consent after auth is available.
 * Missing consent stays off. Never enables collection by default.
 * A newer opt-out, including one whose save failed, wins over this read.
 */
export function CrashReportingBridge() {
  const { status, user } = useAuth();
  const uid = status === "signed_in" ? user?.uid : undefined;

  useEffect(() => {
    let cancelled = false;
    void runCrashReportingBridge().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return null;
}
