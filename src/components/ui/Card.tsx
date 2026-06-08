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
import { spacing, useTheme, useThemedStyles, useThemeColors } from "@/theme";

interface CardProps {
  children: React.ReactNode;
  onPress?: (e: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  /** When false, skips drop shadow — use in lists for smoother scrolling. */
  elevated?: boolean;
  testID?: string;
}

export function Card({
  children,
  onPress,
  style,
  padded = true,
  elevated = true,
  testID,
}: CardProps) {
  const colors = useThemeColors();
  const { resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";
  const depth = executiveCardDepth(isDark, colors, elevated ? 2 : 3);
  const styles = useThemedStyles(() =>
    StyleSheet.create({
      padded: { padding: spacing.lg + 2 },
    })
  );

  const content = (
    <View style={[depth, padded && styles.padded, style]}>
      {children}
    </View>
  );
  if (!onPress) return <View testID={testID}>{content}</View>;
  return (
    <LuxuryPressable
      testID={testID}
      onPress={onPress}
      android_ripple={{ color: colors.primaryLight }}
    >
      {content}
    </LuxuryPressable>
  );
}
