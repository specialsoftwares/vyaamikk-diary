import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";

import { LocaleUiText } from "@/components/ui";
import { chooseCrashDiagnostics, currentPurposeConsentState, subscribePurposeConsent, reconcilePurposeConsent } from "@/services/consent/purposeConsent";
import { crashConsentCopy } from "@/services/telemetry/crashConsentCopy";
import {
  crashConsentStatus,
  initialCrashConsent,
  type CrashConsentModel,
} from "@/services/telemetry/crashConsentState";
import { useI18n } from "@/i18n";
import { useAuth } from "@/state/auth";
import { spacing, typography, useThemedStyles } from "@/theme";

import { SettingsPreferenceRow } from "./SettingsPreferenceRow";

export function CrashReportsPreferenceRow() {
  const { lang } = useI18n();
  const copy = crashConsentCopy(lang);
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [consent, setConsent] = useState<CrashConsentModel>(
    () => currentPurposeConsentState(uid)?.consent ?? initialCrashConsent(uid ?? "")
  );
  const styles = useThemedStyles((colors) =>
    StyleSheet.create({
      inset: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      },
      note: {
        ...typography.caption,
        color: colors.textMuted,
        paddingHorizontal: spacing.md,
        paddingBottom: spacing.sm,
      },
    })
  );

  const read = useCallback(() => {
    setConsent(currentPurposeConsentState(uid)?.consent ?? initialCrashConsent(uid ?? ""));
  }, [uid]);

  useEffect(() => subscribePurposeConsent(read), [read]);

  const reload = useCallback(async () => {
    if (uid) await reconcilePurposeConsent(uid);
    read();
  }, [read, uid]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  const status = crashConsentStatus(consent);
  const onPress = useCallback(async () => {
    if (!uid) return;
    const retryFailed = status === "failed";
    const turnOn = retryFailed ? consent.choice.decision !== "withdraw" : consent.choice.decision !== "allow";
    await chooseCrashDiagnostics(turnOn, uid);
    read();
  }, [consent.choice.decision, read, status, uid]);

  const value = copy.status[status];
  const valueTone = status === "active" ? "positive" : status === "failed" ? "warning" : "muted";

  return (
    <View style={styles.inset}>
      <SettingsPreferenceRow
        icon="bug-outline"
        label={copy.title}
        value={value}
        valueTone={valueTone}
        onPress={() => void onPress()}
        accessibilityLabel={`${copy.title}, ${value}`}
      />
      <LocaleUiText style={styles.note}>{copy.detail[status]}</LocaleUiText>
      {consent.unsentDeletionRequested && consent.choice.decision === "withdraw" ? (
        <LocaleUiText style={styles.note}>{copy.unsentDeletionRequested}</LocaleUiText>
      ) : null}
    </View>
  );
}
