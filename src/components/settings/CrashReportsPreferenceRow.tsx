import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";

import { chooseCrashDiagnostics, currentPurposeConsentState, presentCrashConsent, subscribePurposeConsent, reconcilePurposeConsent } from "@/services/consent/purposeConsent";
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
  }), [user?.uid]);
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
  }, [user?.uid]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  const onPress = useCallback(async () => {
    if (!user) return;
    const next = !receipt?.localGrant;
    await chooseCrashDiagnostics(next, user.uid);
    setReceipt(currentPurposeConsentState(user.uid));
  }, [receipt?.localGrant, user]);

  const presentation = presentCrashConsent(receipt);
  const value = t(presentation.valueKey);
  const enabled = presentation.status === "on";

  return (
    <View style={styles.inset}>
      <SettingsPreferenceRow
        icon="bug-outline"
        label={t("settings.crashReportsTitle")}
        value={value}
        valueTone={enabled ? "positive" : presentation.status === "activation_failed" || presentation.status === "unavailable" ? "warning" : "muted"}
        onPress={() => void onPress()}
        accessibilityLabel={`${t("settings.crashReportsTitle")}, ${value}`}
      />
      <LocaleUiText style={styles.note}>{t("settings.crashReportsBody")}</LocaleUiText>
      {presentation.noteKey ? (
        <LocaleUiText style={styles.note}>{t(presentation.noteKey)}</LocaleUiText>
      ) : null}
    </View>
  );
}
