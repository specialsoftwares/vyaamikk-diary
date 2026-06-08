import { LinearGradient } from "expo-linear-gradient";
import React, { memo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import {
  dashboardGreetingDepth,
  dashboardGreetingGradient,
} from "@/theme/executiveLayer";
import { useTheme } from "@/theme";

interface DashboardGreetingHeroSurfaceProps {
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
}

/**
 * You-dashboard greeting hero — stronger contrast, depth, and gradient vs page bg.
 * Visual-only surface; used exclusively by UserGreetingHeader.
 */
function DashboardGreetingHeroSurfaceInner({
  children,
  contentStyle,
  style,
}: DashboardGreetingHeroSurfaceProps) {
  const { colors, resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";
  const stops = dashboardGreetingGradient(resolvedMode);
  const depth = dashboardGreetingDepth(isDark, colors);

  return (
    <View style={[depth, styles.shell, style]}>
      <LinearGradient
        colors={stops}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View
          pointerEvents="none"
          style={[
            styles.edgeHighlight,
            isDark ? styles.edgeHighlightDark : styles.edgeHighlightLight,
          ]}
        />
        <View style={[styles.content, contentStyle]}>{children}</View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {},
  gradient: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 20,
  },
  edgeHighlight: {
    position: "absolute",
    top: 0,
    left: 12,
    right: 12,
    height: 1,
    borderRadius: 999,
  },
  edgeHighlightLight: {
    backgroundColor: "rgba(255, 255, 255, 0.72)",
  },
  edgeHighlightDark: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  content: {
    position: "relative",
    zIndex: 1,
  },
});

export const DashboardGreetingHeroSurface = memo(DashboardGreetingHeroSurfaceInner);
