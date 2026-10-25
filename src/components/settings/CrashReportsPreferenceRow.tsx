import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";

import { chooseCrashDiagnostics, currentPurposeConsentState, subscribePurposeConsent, reconcilePurposeConsent } from "@/services/consent/purposeConsent";
import {
  currentDiagnosticsPreference,
  type DiagnosticsPreference,
} from "@/services/telemetry/diagnosticsPreference";
import { useAuth } from "@/state/auth";
import { useT } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";

import { SettingsPreferenceRow } from "./SettingsPreferenceRow";
import { LocaleUiText } from "@/components/ui";

export function CrashReportsPreferenceRow() {
  const t = useT();
  const { user } = useAuth();
  const [receipt, setReceipt] = useState(currentPurposeConsentState(user?.uid ?? null));
  useEffect(() => subscribePurposeConsent(() => {
    setReceipt(currentPurposeConsentState(user?.uid ?? null));
    setPref(currentDiagnosticsPreference());
  }), [user?.uid]);
  const [pref, setPref] = useState<DiagnosticsPreference>(currentDiagnosticsPreference());
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

  const reload = useCallback(async () => {
    if (user) await reconcilePurposeConsent(user.uid);
    setReceipt(currentPurposeConsentState(user?.uid ?? null));
    setPref(currentDiagnosticsPreference());
  }, [user?.uid]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  const onPress = useCallback(async () => {
    if (!user) return;
    const next = !receipt?.localGrant;
    setPref(await chooseCrashDiagnostics(next, user.uid));
  }, [receipt?.localGrant, user?.uid]);

  const enabled = pref.desired === "on" && pref.persisted;
  const value = enabled ? t("settings.crashReportsOn") : t("settings.crashReportsOff");

  return (
    <View style={styles.inset}>
      <SettingsPreferenceRow
        icon="bug-outline"
        label={t("settings.crashReportsTitle")}
        value={value}
        valueTone={enabled ? "positive" : "muted"}
        onPress={() => void onPress()}
        accessibilityLabel={`${t("settings.crashReportsTitle")}, ${value}`}
      />
      <LocaleUiText style={styles.note}>{t("settings.crashReportsBody")}</LocaleUiText>
      {receipt?.sync === "pending" || receipt?.sync === "unknown" ? (
        <LocaleUiText style={styles.note}>{t("settings.crashReportsPending")}</LocaleUiText>
      ) : null}
      {receipt?.sync === "conflict" ? (
        <LocaleUiText style={styles.note}>{t("settings.crashReportsConflict")}</LocaleUiText>
      ) : null}
      {pref.error || receipt?.sync === "storage_error" ? (
        <LocaleUiText style={styles.note}>{t("settings.crashReportsSaveFailed")}</LocaleUiText>
      ) : null}
    </View>
  );
}
