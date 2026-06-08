import React, { memo, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { executiveCardDepth } from "@/theme/cardDepth";
import { radius, spacing, useThemedStyles } from "@/theme";
import { useTheme } from "@/theme/ThemeContext";

import { SkeletonLine } from "./SkeletonLine";

export interface SkeletonCardProps {
  children?: ReactNode;
  /** Preset line layout when children omitted. */
  lines?: number;
  elevated?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const SkeletonCard = memo(function SkeletonCard({
  children,
  lines = 3,
  elevated = false,
  style,
}: SkeletonCardProps) {
  const { resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      card: {
        padding: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: c.surface,
        gap: spacing.xs,
        ...(elevated ? executiveCardDepth(isDark, c, 2) : {}),
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
      },
    })
  );

  return (
    <View style={[styles.card, style]}>
      {children ??
        Array.from({ length: lines }, (_, i) => (
          <SkeletonLine key={i} widthPct={i === 0 ? 72 : i === lines - 1 ? 48 : 92} />
        ))}
    </View>
  );
});
