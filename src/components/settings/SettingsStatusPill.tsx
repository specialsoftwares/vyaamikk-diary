import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { radius, typography, useThemedStyles } from "@/theme";

export type SettingsStatusTone = "neutral" | "positive" | "muted" | "warning";

interface SettingsStatusPillProps {
  label: string;
  tone?: SettingsStatusTone;
}

export function SettingsStatusPill({ label, tone = "neutral" }: SettingsStatusPillProps) {
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      pill: {
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: radius.pill,
        borderWidth: StyleSheet.hairlineWidth,
        maxWidth: "58%",
      },
      neutral: {
        backgroundColor: c.surfaceMuted,
        borderColor: c.divider,
      },
      positive: {
        backgroundColor: c.primaryLight,
        borderColor: c.primary,
      },
      muted: {
        backgroundColor: c.surfaceMuted,
        borderColor: c.divider,
      },
      warning: {
        backgroundColor: c.dangerSoft,
        borderColor: c.danger,
      },
      text: { ...typography.captionStrong, color: c.text },
      textPositive: { color: c.primaryDark },
      textMuted: { color: c.textMuted },
      textWarning: { color: c.danger },
    })
  );

  const pillStyle =
    tone === "positive"
      ? styles.positive
      : tone === "warning"
        ? styles.warning
        : tone === "muted"
          ? styles.muted
          : styles.neutral;

  const textStyle =
    tone === "positive"
      ? styles.textPositive
      : tone === "warning"
        ? styles.textWarning
        : tone === "muted"
          ? styles.textMuted
          : styles.text;

  return (
    <View style={[styles.pill, pillStyle]}>
      <Text style={[styles.text, textStyle]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
