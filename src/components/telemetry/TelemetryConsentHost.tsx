import React, { useCallback, useEffect, useState } from "react";

import { TelemetryConsentModal } from "@/components/TelemetryConsentModal";
import { useAuth } from "@/state/auth";
import { setCrashReportingEnabled } from "@/services/telemetry/crashReporter";
import { readTelemetryConsent, writeTelemetryConsent } from "@/services/telemetry/telemetryConsent";

/**
 * One-time crash-report consent. Mounted only on the main tab shell, so auth,
 * onboarding, and boot never see it. An existing AsyncStorage answer hides it
 * forever.
 */
export function TelemetryConsentHost() {
  const { status, user } = useAuth();
  const [visible, setVisible] = useState(false);
  const onboardingComplete = Boolean(user?.profileCompletedAt);

  useEffect(() => {
    if (status !== "signed_in" || !onboardingComplete) {
      setVisible(false);
      return;
    }
    let cancelled = false;
    void readTelemetryConsent().then((stored) => {
      if (!cancelled && stored === null) setVisible(true);
    });
    return () => {
      cancelled = true;
    };
  }, [status, onboardingComplete, user?.uid]);

  const choose = useCallback(async (enabled: boolean) => {
    setVisible(false);
    try {
      await writeTelemetryConsent(enabled);
    } catch {
      // Preference write failed; keep collection off.
      setCrashReportingEnabled(false);
      return;
    }
    setCrashReportingEnabled(enabled);
  }, []);

  return (
    <TelemetryConsentModal
      visible={visible}
      onAllow={() => void choose(true)}
      onDecline={() => void choose(false)}
    />
  );
}
