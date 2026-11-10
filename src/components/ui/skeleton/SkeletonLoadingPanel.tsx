import React, { memo, type ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { spacing, typography, useThemedStyles } from "@/theme";

import { skeletonPanelMode } from "./skeletonPanelMode";
import { useLoadingSlowWarning } from "./useLoadingSlowWarning";

export interface SkeletonLoadingPanelProps {
  loading: boolean;
  children: ReactNode;
  slowMessage: string;
  style?: StyleProp<ViewStyle>;
}

export { skeletonPanelMode } from "./skeletonPanelMode";
export type { SkeletonPanelMode } from "./skeletonPanelMode";

/**
 * Shows skeleton children while `loading`.
 * After ~6.5s, keeps those children and adds a slow-load message.
 * Renders nothing when `loading` is false — children are the skeleton, not page content.
 */
export const SkeletonLoadingPanel = memo(function SkeletonLoadingPanel({
  loading,
  children,
  slowMessage,
  style,
}: SkeletonLoadingPanelProps) {
  const slow = useLoadingSlowWarning(loading);
  const mode = skeletonPanelMode(loading, slow, false);
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      slowWrap: {
        paddingVertical: spacing.xl,
        paddingHorizontal: spacing.lg,
        alignItems: "center",
      },
      slowText: {
        ...typography.body,
        color: c.textMuted,
        textAlign: "center",
        lineHeight: 22,
      },
    })
  );

  if (mode === "hidden" || mode === "content") return null;

  return (
    <View style={style}>
      {children}
      {mode === "skeleton-and-slow" ? (
        <View style={styles.slowWrap} accessibilityLiveRegion="polite">
          <Text style={styles.slowText}>{slowMessage}</Text>
        </View>
      ) : null}
    </View>
  );
});
