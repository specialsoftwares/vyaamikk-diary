import React, { useCallback, useEffect, useState } from "react";

import { TelemetryConsentModal } from "@/components/TelemetryConsentModal";
import { useT } from "@/i18n";
import { useAuth } from "@/state/auth";
import {
  chooseCrashDiagnostics,
  currentPurposeConsentState,
  presentCrashConsent,
  reconcilePurposeConsent,
  subscribePurposeConsent,
} from "@/services/consent/purposeConsent";

/**
 * One-time crash-report consent. Mounted only on the main tab shell, so auth,
 * onboarding, and boot never see it. The choice belongs to the current account.
 * The prompt stays up when activation fails so the failure is explained.
 */
export function TelemetryConsentHost() {
  const t = useT();
  const { status, user } = useAuth();
  const [receipt, setReceipt] = useState(currentPurposeConsentState(user?.uid ?? null));
  const [forcedOpen, setForcedOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const onboardingComplete = Boolean(user?.profileCompletedAt);
  const eligible = status === "signed_in" && onboardingComplete && Boolean(user);

  useEffect(() => subscribePurposeConsent(() => {
    setReceipt(currentPurposeConsentState(user?.uid ?? null));
  }), [user?.uid]);

  useEffect(() => {
    setForcedOpen(false);
    setBusy(false);
    if (!eligible || !user) return;
    let cancelled = false;
    void reconcilePurposeConsent(user.uid).then(() => {
      if (cancelled) return;
      const next = currentPurposeConsentState(user.uid);
      setReceipt(next);
      if (!next?.hasChoice) setForcedOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, [eligible, user?.uid]);

  const presentation = presentCrashConsent(receipt);
  const visible = eligible && (
    forcedOpen
    || presentation.status === "activation_failed"
    || presentation.status === "unavailable"
  );

  const choose = useCallback(async (enabled: boolean) => {
    if (!user || busy) return;
    setBusy(true);
    try {
      await chooseCrashDiagnostics(enabled, user.uid);
    } finally {
      setBusy(false);
    }
    const next = currentPurposeConsentState(user.uid);
    setReceipt(next);
    const nextStatus = presentCrashConsent(next).status;
    if (!next?.hasChoice || nextStatus === "activation_failed" || nextStatus === "unavailable") {
      setForcedOpen(true);
      return;
    }
    setForcedOpen(false);
  }, [busy, user]);

  const statusMessage = !visible ? null
    : busy ? t("settings.crashReportsSavingNote")
    : presentation.status === "activation_failed" ? t("settings.crashReportsActivationFailedNote")
    : presentation.status === "unavailable" ? t("settings.crashReportsUnavailableNote")
    : null;

  return (
    <TelemetryConsentModal
      visible={visible}
      statusMessage={statusMessage}
      onAllow={() => void choose(true)}
      onDecline={() => void choose(false)}
    />
  );
}
