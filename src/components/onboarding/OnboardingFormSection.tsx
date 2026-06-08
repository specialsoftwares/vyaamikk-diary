import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { spacing, typography, useThemedStyles } from "@/theme";

interface OnboardingFormSectionProps {
  title: string;
  children: React.ReactNode;
}

/** Groups onboarding fields under a compact section heading. */
export function OnboardingFormSection({ title, children }: OnboardingFormSectionProps) {
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      wrap: { gap: spacing.md + 2 },
      title: {
        ...typography.captionStrong,
        color: c.textMuted,
        textTransform: "uppercase",
        letterSpacing: 0.55,
        fontWeight: "700",
      },
      fields: { gap: spacing.lg + 2 },
    })
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.fields}>{children}</View>
    </View>
  );
}
