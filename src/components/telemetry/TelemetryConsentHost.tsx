import React, { useCallback, useEffect, useRef, useState } from "react";

import { TelemetryConsentModal } from "@/components/TelemetryConsentModal";
import { useAuth } from "@/state/auth";
import { chooseCrashDiagnostics } from "@/services/consent/purposeConsent";
import { loadDiagnosticsPreference } from "@/services/telemetry/diagnosticsPreference";

/**
 * One-time crash-report consent. Mounted only on the main tab shell, so auth,
 * onboarding, and boot never see it. An existing AsyncStorage answer hides it
 * forever.
 */
export function TelemetryConsentHost() {
  const { status, user } = useAuth();
  const [visible, setVisible] = useState(false);
  const choiceEpoch = useRef(0);
  const onboardingComplete = Boolean(user?.profileCompletedAt);

  useEffect(() => {
    if (status !== "signed_in" || !onboardingComplete) {
      setVisible(false);
      return;
    }
    let cancelled = false;
    const epoch = choiceEpoch.current;
    void loadDiagnosticsPreference().then((pref) => {
      if (cancelled || choiceEpoch.current !== epoch) return;
      if (pref.desired === "unknown") setVisible(true);
    });
    return () => {
      cancelled = true;
    };
  }, [status, onboardingComplete, user?.uid]);

  const choose = useCallback(async (enabled: boolean) => {
    choiceEpoch.current += 1;
    setVisible(false);
    await chooseCrashDiagnostics(enabled);
  }, []);

  return (
    <TelemetryConsentModal
      visible={visible}
      onAllow={() => void choose(true)}
      onDecline={() => void choose(false)}
    />
  );
}
