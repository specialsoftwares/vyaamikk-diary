import React, { memo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "@/theme";

type Corner = "topLeft" | "topRight" | "bottomRight";

interface SubtlePatternCornerProps {
  /** 0–1; keep low (≤0.08) for corporate restraint */
  opacity?: number;
  corner?: Corner;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Mandala-inspired radial dot motif — decorative only, never behind forms.
 */
function SubtlePatternCornerInner({
  opacity = 0.06,
  corner = "topRight",
  color,
  style,
}: SubtlePatternCornerProps) {
  const { colors } = useTheme();
  const tint = color ?? colors.primary;
  const position =
    corner === "topLeft"
      ? styles.topLeft
      : corner === "bottomRight"
        ? styles.bottomRight
        : styles.topRight;

  const dots = [
    { size: 28, dx: 0, dy: 0 },
    { size: 14, dx: -22, dy: 8 },
    { size: 10, dx: 12, dy: -16 },
    { size: 8, dx: -8, dy: -20 },
    { size: 6, dx: 20, dy: 12 },
    { size: 5, dx: -18, dy: -6 },
  ];

  return (
    <View pointerEvents="none" style={[styles.host, position, style]}>
      {dots.map((d, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            {
              width: d.size,
              height: d.size,
              borderRadius: d.size / 2,
              backgroundColor: tint,
              opacity,
              transform: [{ translateX: d.dx }, { translateY: d.dy }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    width: 56,
    height: 56,
    overflow: "hidden",
  },
  topRight: { top: 0, right: 0 },
  topLeft: { top: 0, left: 0 },
  bottomRight: { bottom: 0, right: 0 },
  dot: { position: "absolute", top: 8, right: 8 },
});

export const SubtlePatternCorner = memo(SubtlePatternCornerInner);
