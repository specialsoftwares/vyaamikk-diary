import React from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import { spacing, useThemedStyles } from "@/theme";

interface FormActionBarProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** When true, adds keyboard inset on Android (iOS handled by parent Screen). */
  keyboardAware?: boolean;
}

/** Compact pinned or inline form actions — Save, Draft, PDF, Share, Cancel. */
export function FormActionBar({ children, style, keyboardAware = true }: FormActionBarProps) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardInset(keyboardAware);
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      bar: {
        gap: spacing.sm,
        paddingTop: spacing.md,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: c.divider,
        backgroundColor: c.surface,
      },
    })
  );

  const bottomPad =
    Math.max(insets.bottom, spacing.sm) +
    (keyboardAware && Platform.OS === "android" ? keyboardHeight : 0);

  return (
    <View style={[styles.bar, { paddingBottom: bottomPad }, style]}>{children}</View>
  );
}
