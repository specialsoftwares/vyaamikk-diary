import React, { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";

import {
  applyDiagnosticsChoice,
  currentDiagnosticsPreference,
  loadDiagnosticsPreference,
  type DiagnosticsPreference,
} from "@/services/telemetry/diagnosticsPreference";
import { useT } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";

import { SettingsPreferenceRow } from "./SettingsPreferenceRow";
import { LocaleUiText } from "@/components/ui";

export function CrashReportsPreferenceRow() {
  const t = useT();
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
    setPref(await loadDiagnosticsPreference());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  const onPress = useCallback(async () => {
    const next = pref.desired !== "on";
    setPref(await applyDiagnosticsChoice(next));
  }, [pref.desired]);

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
      {pref.error ? (
        <LocaleUiText style={styles.note}>{t("settings.crashReportsSaveFailed")}</LocaleUiText>
      ) : null}
    </View>
  );
}
