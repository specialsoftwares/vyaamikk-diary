import React from "react";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { authV2GradientStops } from "@/auth-v2/theme/authV2Theme";
import { useT } from "@/i18n";
import { luxuryCardShadow } from "@/theme/luxuryTokens";
import { spacing, typography, useTheme } from "@/theme";

export function SettingsInfoHero() {
  const t = useT();
  const { resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";
  const gradient = authV2GradientStops(isDark);

  const shellStyle = [styles.card, !isDark && luxuryCardShadow(false)];

  return (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={shellStyle}
    >
      <View style={styles.topRow}>
        <MaterialCommunityIcons name="tune-variant" size={22} color="rgba(255,255,255,0.9)" />
        <LocaleUiText style={styles.kicker}>{t("settings.heroKicker")}</LocaleUiText>
      </View>
      <LocaleUiText style={styles.title}>{t("settings.title")}</LocaleUiText>
      <LocaleUiText style={styles.subtitle}>{t("settings.heroSubtitle")}</LocaleUiText>
      <LocaleUiText style={styles.tagline}>{t("app.tagline")}</LocaleUiText>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  kicker: {
    ...typography.micro,
    color: "rgba(255,255,255,0.6)",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  title: {
    ...typography.displayMd,
    fontSize: 26,
    lineHeight: 32,
    color: "#FFFFFF",
    letterSpacing: -0.4,
  },
  subtitle: {
    ...typography.body,
    color: "rgba(255,255,255,0.78)",
    lineHeight: 22,
    marginTop: spacing.xs,
  },
  tagline: {
    ...typography.caption,
    color: "rgba(255,255,255,0.55)",
    marginTop: spacing.sm,
    lineHeight: 18,
  },
});
