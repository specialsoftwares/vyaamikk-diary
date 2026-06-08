import React, { memo, useEffect, useRef } from "react";
import { Animated, StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import { radius, useTheme, useThemeColors } from "@/theme";
import { luxurySkeletonTint } from "@/theme/luxuryTokens";

export interface SkeletonBaseProps {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

/** Lightweight placeholder block with a gentle opacity pulse (no shimmer). */
export const SkeletonBase = memo(function SkeletonBase({
  width = "100%",
  height = 12,
  borderRadius = radius.sm,
  style,
}: SkeletonBaseProps) {
  const colors = useThemeColors();
  const { resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";
  const pulse = useRef(new Animated.Value(0.5)).current;
  const tint = luxurySkeletonTint(isDark, colors);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.88,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.42,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        styles.base,
        {
          width,
          height,
          borderRadius,
          backgroundColor: tint,
          opacity: pulse,
        },
        style,
      ]}
    />
  );
});

const styles = StyleSheet.create({
  base: {
    overflow: "hidden",
  },
});
