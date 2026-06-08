import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { spacing, typography, useThemedStyles, useThemeColors } from "@/theme";

interface LoaderProps {
  message?: string;
  fullscreen?: boolean;
}

export function Loader({ message, fullscreen = false }: LoaderProps) {
  const colors = useThemeColors();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      container: {
        alignItems: "center",
        justifyContent: "center",
        padding: spacing.lg,
        gap: spacing.sm,
      },
      fullscreen: { flex: 1, backgroundColor: c.background },
      message: { ...typography.caption, color: c.textMuted },
    })
  );
  return (
    <View style={[styles.container, fullscreen && styles.fullscreen]}>
      <ActivityIndicator color={colors.primary} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}
