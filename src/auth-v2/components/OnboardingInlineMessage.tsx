import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useAuthV2Theme } from "@/auth-v2/hooks/useAuthV2Theme";
import { spacing, typography } from "@/theme";

interface OnboardingInlineMessageProps {
  tone?: "info" | "danger" | "muted";
  message: string;
  testID?: string;
}

export function OnboardingInlineMessage({
  tone = "muted",
  message,
  testID,
}: OnboardingInlineMessageProps) {
  const { tokens } = useAuthV2Theme();
  const color =
    tone === "danger" ? tokens.danger : tone === "info" ? tokens.secondaryAction : tokens.muted;
  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      <Text style={[styles.text, { color }]} testID={testID}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.xs },
  text: { ...typography.caption, lineHeight: 18 },
});
