import React, { memo, type ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { spacing, typography, useThemedStyles } from "@/theme";

import { useLoadingSlowWarning } from "./useLoadingSlowWarning";

export interface SkeletonLoadingPanelProps {
  loading: boolean;
  children: ReactNode;
  slowMessage: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Shows skeleton children while `loading`; after ~6.5s shows a slow-load message instead.
 * Does not render when `loading` is false.
 */
export const SkeletonLoadingPanel = memo(function SkeletonLoadingPanel({
  loading,
  children,
  slowMessage,
  style,
}: SkeletonLoadingPanelProps) {
  const slow = useLoadingSlowWarning(loading);
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

  if (!loading) return null;

  if (slow) {
    return (
      <View style={[styles.slowWrap, style]}>
        <Text style={styles.slowText}>{slowMessage}</Text>
      </View>
    );
  }

  return <View style={style}>{children}</View>;
});
