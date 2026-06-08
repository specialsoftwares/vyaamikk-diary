import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { executiveCardDepth } from "@/theme/cardDepth";
import { spacing, typography, useTheme, useThemedStyles } from "@/theme";
import { Button } from "./Button";

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  retryLabel = "Try again",
}: ErrorStateProps) {
  const { colors, resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      container: {
        ...executiveCardDepth(isDark, colors, 2),
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: spacing.xxxl,
        paddingHorizontal: spacing.xl + 4,
        gap: spacing.sm,
      },
      title: { ...typography.titleMd, color: c.danger, textAlign: "center" },
      message: { ...typography.body, color: c.textMuted, textAlign: "center" },
      action: { marginTop: spacing.md },
    })
  );
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry ? (
        <View style={styles.action}>
          <Button label={retryLabel} onPress={onRetry} variant="secondary" fullWidth={false} />
        </View>
      ) : null}
    </View>
  );
}
