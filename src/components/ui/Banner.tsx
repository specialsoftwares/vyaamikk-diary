import React from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  radius,
  spacing,
  typography,
  useTheme,
  type ColorScheme,
  type ResolvedThemeMode,
} from "@/theme";

type Tone = "info" | "warning" | "danger" | "success";

interface BannerProps {
  tone?: Tone;
  title?: string;
  message: string;
}

export function Banner({ tone = "info", title, message }: BannerProps) {
  const { colors, resolvedMode } = useTheme();
  const palette = paletteFor(tone, colors, resolvedMode);
  return (
    <View
      style={[
        styles.container,
        { backgroundColor: palette.bg, borderColor: palette.border },
      ]}
    >
      {title ? <Text style={[styles.title, { color: palette.fg }]}>{title}</Text> : null}
      <Text style={[styles.message, { color: palette.fg }]}>{message}</Text>
    </View>
  );
}

function paletteFor(tone: Tone, c: ColorScheme, mode: ResolvedThemeMode) {
  const dark = mode === "dark";
  switch (tone) {
    case "warning":
      return {
        bg: dark ? "#3A2E14" : "#FFF6E5",
        border: dark ? "#5A4628" : "#F1D6A0",
        fg: c.warning,
      };
    case "danger":
      return { bg: c.dangerSoft, border: "transparent", fg: c.danger };
    case "success":
      return {
        bg: dark ? "#103424" : "#E6F6EE",
        border: dark ? "#1A5D40" : "#B7E0C7",
        fg: c.success,
      };
    case "info":
    default:
      return {
        bg: c.primaryLight,
        border: dark ? "rgba(139, 145, 255, 0.28)" : "rgba(59, 65, 197, 0.2)",
        fg: c.primaryDark,
      };
  }
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.xs,
  },
  title: { ...typography.bodyStrong },
  message: { ...typography.body },
});
