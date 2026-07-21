import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { spacing, typography } from "@/theme";
import { wizardProgressLabel, type OnboardingWizardStep } from "@/auth/onboardingWizard";

interface WizardProgressProps {
  step: OnboardingWizardStep;
  tone?: "light" | "dark";
  verifiedMobile?: boolean;
  verifiedEmail?: boolean;
}

/** Compact “Step N of M” + optional verified chips for the pre-dashboard wizard. */
export function WizardProgress({
  step,
  tone = "dark",
  verifiedMobile,
  verifiedEmail,
}: WizardProgressProps) {
  const { label } = wizardProgressLabel(step);
  const muted = tone === "dark" ? "rgba(255,255,255,0.65)" : "#64748B";
  const chip = tone === "dark" ? "rgba(165,180,252,0.25)" : "rgba(99,102,241,0.12)";
  const chipText = tone === "dark" ? "#C7D2FE" : "#4338CA";

  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <Text style={[styles.label, { color: muted }]}>{label}</Text>
      <View style={styles.chips}>
        {verifiedMobile ? (
          <Text style={[styles.chip, { backgroundColor: chip, color: chipText }]}>
            Mobile verified
          </Text>
        ) : null}
        {verifiedEmail ? (
          <Text style={[styles.chip, { backgroundColor: chip, color: chipText }]}>
            Email verified
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    marginHorizontal: -spacing.lg,
    gap: spacing.xs,
  },
  label: {
    ...typography.micro,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    ...typography.caption,
    overflow: "hidden",
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
});
