import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { OnboardingV2Shell } from "@/auth-v2/components/OnboardingV2Shell";
import { useAuthV2Theme } from "@/auth-v2/hooks/useAuthV2Theme";
import { spacing, typography } from "@/theme";

/**
 * Preview-only stand-in for the You tab — no production routing / data.
 */
export function YouPreview({ displayName }: { displayName: string }) {
  const { tokens } = useAuthV2Theme();
  const name = displayName.trim() || "Owner";

  return (
    <OnboardingV2Shell
      stageLabel="You"
      title="You"
      subtitle="Preview workspace — no production data."
    >
      <View
        style={[
          styles.card,
          { backgroundColor: tokens.cardBg, borderColor: tokens.cardBorder },
        ]}
      >
        <Text style={[styles.greeting, { color: tokens.heading }]}>Hello, {name}</Text>
        <Text style={[styles.note, { color: tokens.muted }]}>
          DEV harness destination after Workspace Ready. Production You is unchanged.
        </Text>
      </View>
    </OnboardingV2Shell>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  greeting: { ...typography.titleMd },
  note: { ...typography.caption, lineHeight: 18 },
});
