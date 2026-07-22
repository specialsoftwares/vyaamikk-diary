import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { spacing, typography } from "@/theme";
import type { OnboardingWizardStep } from "@/auth/onboardingWizard";
import { wizardStageModel } from "@/auth/wizardNavigationController";

interface WizardProgressProps {
  step: OnboardingWizardStep;
  tone?: "light" | "dark";
  verifiedMobile?: boolean;
  verifiedEmail?: boolean;
}

/**
 * Contextual Account / Identity / Review chrome bound to the visible logical step.
 * Never shows numeric “Step N of M”.
 */
export function WizardProgress({
  step,
  tone = "dark",
  verifiedMobile,
  verifiedEmail,
}: WizardProgressProps) {
  const model = wizardStageModel(step);
  const muted = tone === "dark" ? "rgba(255,255,255,0.65)" : "#64748B";
  const active = tone === "dark" ? "#C7D2FE" : "#4338CA";
  const chip = tone === "dark" ? "rgba(165,180,252,0.25)" : "rgba(99,102,241,0.12)";
  const chipText = tone === "dark" ? "#C7D2FE" : "#4338CA";
  const track = tone === "dark" ? "rgba(255,255,255,0.2)" : "rgba(15,23,42,0.12)";

  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <Text style={[styles.label, { color: muted }]}>{model.heading}</Text>
      <View style={styles.stages} accessibilityRole="text">
        {model.stages.map((s, index) => (
          <React.Fragment key={s.id}>
            {index > 0 ? <View style={[styles.connector, { backgroundColor: track }]} /> : null}
            <Text
              style={[
                styles.stage,
                { color: s.active ? active : muted },
                s.active && styles.stageActive,
              ]}
            >
              {s.label}
            </Text>
          </React.Fragment>
        ))}
      </View>
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
  stages: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  stage: {
    ...typography.caption,
  },
  stageActive: {
    fontWeight: "700",
  },
  connector: {
    width: 12,
    height: 2,
    borderRadius: 1,
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
