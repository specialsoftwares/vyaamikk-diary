import React, { useCallback, useEffect, useRef, useState } from "react";

import { TelemetryConsentModal } from "@/components/TelemetryConsentModal";
import { useAuth } from "@/state/auth";
import { chooseCrashDiagnostics, currentPurposeConsentState, reconcilePurposeConsent } from "@/services/consent/purposeConsent";

/**
 * One-time crash-report consent. Mounted only on the main tab shell, so auth,
 * onboarding, and boot never see it. The choice belongs to the current account.
 */
export function TelemetryConsentHost() {
  const { status, user } = useAuth();
  const [visible, setVisible] = useState(false);
  const choiceEpoch = useRef(0);
  const onboardingComplete = Boolean(user?.profileCompletedAt);

  useEffect(() => {
    setVisible(false);
    if (status !== "signed_in" || !onboardingComplete) {
      setVisible(false);
      return;
    }
    let cancelled = false;
    const epoch = choiceEpoch.current;
    void reconcilePurposeConsent(user!.uid).then(() => {
      if (cancelled || choiceEpoch.current !== epoch) return;
      if (!currentPurposeConsentState(user!.uid)?.hasChoice) setVisible(true);
    });
    return () => {
      cancelled = true;
    };
  }, [status, onboardingComplete, user?.uid]);

  const choose = useCallback(async (enabled: boolean) => {
    choiceEpoch.current += 1;
    setVisible(false);
    if (user) await chooseCrashDiagnostics(enabled, user.uid);
  }, [user?.uid]);

  return (
    <TelemetryConsentModal
      visible={visible}
      onAllow={() => void choose(true)}
      onDecline={() => void choose(false)}
    />
  );
}
