import React from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";

import {
  glassBlurIntensity,
  glassCardTint,
  glassChromeTint,
  glassFallbackFill,
  glassFallbackMuted,
  glassTabBarIntensity,
  useNativeGlassBlur,
} from "@/theme/glass";
import { radius, spacing, useTheme, useThemedStyles } from "@/theme";

export type GlassVariant = "card" | "chrome" | "pill";

interface GlassSurfaceProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: GlassVariant;
  padded?: boolean;
  hairline?: boolean;
  testID?: string;
}

/** Small frosted surfaces — settings cards, segmented tracks. Not for scroll lists. */
export function GlassSurface({
  children,
  style,
  variant = "card",
  padded = true,
  hairline = true,
  testID,
}: GlassSurfaceProps) {
  const { resolvedMode } = useTheme();
  const nativeBlur = useNativeGlassBlur();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      outer: {
        borderRadius: variant === "pill" ? radius.pill : radius.lg,
        overflow: "hidden",
        borderWidth: hairline ? StyleSheet.hairlineWidth : 0,
        borderColor: c.divider,
      },
      blur: { ...StyleSheet.absoluteFillObject },
      fallback: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor:
          variant === "pill" ? glassFallbackMuted(resolvedMode) : glassFallbackFill(resolvedMode),
      },
      content: {
        padding: padded ? (variant === "pill" ? spacing.xs : spacing.lg) : 0,
      },
    })
  );

  const tint = variant === "chrome" ? glassChromeTint(resolvedMode) : glassCardTint(resolvedMode);

  return (
    <View style={[styles.outer, style]} testID={testID}>
      {nativeBlur ? (
        <BlurView
          tint={tint}
          intensity={glassBlurIntensity(resolvedMode)}
          style={styles.blur}
        />
      ) : (
        <View style={styles.fallback} />
      )}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

/** Tab bar backdrop — render only via tabBarBackground, never inside lists. */
export function GlassTabBarBackdrop() {
  const { resolvedMode } = useTheme();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      root: { flex: 1, overflow: "hidden" },
      blur: { ...StyleSheet.absoluteFillObject },
      fallback: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: glassFallbackFill(resolvedMode),
      },
      hairline: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: StyleSheet.hairlineWidth,
        backgroundColor: c.divider,
        opacity: Platform.OS === "ios" ? 0.55 : 0.85,
      },
    })
  );

  if (useNativeGlassBlur()) {
    return (
      <View style={styles.root}>
        <BlurView
          tint={glassChromeTint(resolvedMode)}
          intensity={glassTabBarIntensity(resolvedMode)}
          style={styles.blur}
        />
        <View style={styles.hairline} pointerEvents="none" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.fallback} />
      <View style={styles.hairline} pointerEvents="none" />
    </View>
  );
}
