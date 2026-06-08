import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { executiveCardDepth } from "@/theme/cardDepth";
import { executivePressFeedback } from "@/theme/executiveLayer";
import { spacing, typography, useTheme, useThemedStyles } from "@/theme";
import type { CategoryAccentKey } from "@/theme/categoryAccents";
import { useCategoryAccent } from "@/theme/useBrandTokens";

interface DashboardStatTileProps {
  value: number;
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  accentKey?: CategoryAccentKey;
}

export function DashboardStatTile({
  value,
  label,
  onPress,
  accessibilityLabel,
  accentKey = "work",
}: DashboardStatTileProps) {
  const { colors, resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";
  const accent = useCategoryAccent(accentKey);
  const depth = executiveCardDepth(isDark, colors, 2);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      card: {
        ...depth,
        flex: 1,
        paddingVertical: spacing.md + 4,
        paddingHorizontal: spacing.sm + 2,
        alignItems: "center",
        justifyContent: "center",
        minHeight: 84,
        gap: 6,
        borderTopWidth: 3,
      },
      cardPressed: {
        backgroundColor: c.surfaceMuted,
      },
      value: { ...typography.titleLg, fontVariant: ["tabular-nums"] },
      label: {
        ...typography.micro,
        color: c.textMuted,
        textAlign: "center",
        letterSpacing: 0.4,
        fontWeight: "600",
        textTransform: "uppercase",
      },
    })
  );

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { borderTopColor: accent.main },
        pressed && [styles.cardPressed, executivePressFeedback(pressed)],
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={[styles.value, { color: accent.main }]}>{value}</Text>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}
