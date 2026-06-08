import React from "react";
import {
  StyleSheet,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { LuxuryPressable } from "@/components/ui/LuxuryPressable";
import { executiveCardDepth } from "@/theme/cardDepth";
import { spacing, useTheme, useThemedStyles } from "@/theme";

interface PremiumCardProps {
  children: React.ReactNode;
  onPress?: (e: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  /** Soft elevation — off inside long scroll lists. */
  elevated?: boolean;
  testID?: string;
}

/** Static premium surface (no blur) — settings blocks, success panels. */
export function PremiumCard({
  children,
  onPress,
  style,
  padded = true,
  elevated = true,
  testID,
}: PremiumCardProps) {
  const { resolvedMode, colors } = useTheme();
  const isDark = resolvedMode === "dark";
  const depth = executiveCardDepth(isDark, colors, elevated ? 2 : 3);
  const styles = useThemedStyles(() =>
    StyleSheet.create({
      card: depth,
      padded: { padding: spacing.lg + 2 },
    })
  );

  const content = (
    <View style={[styles.card, padded && styles.padded, style]} testID={testID}>
      {children}
    </View>
  );

  if (!onPress) return content;
  return (
    <LuxuryPressable onPress={onPress} android_ripple={{ color: colors.primaryLight }}>
      {content}
    </LuxuryPressable>
  );
}
