import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { OnboardingWizardStep } from "@/auth/onboardingWizard";
import {
  onboardingJourneyIndex,
  onboardingJourneyStage,
  shouldShowOnboardingProgress,
  type IdentityPhase,
} from "@/auth-v2/onboardingJourney";
import {
  ONBOARDING_JOURNEY_STAGES,
  onboardingJourneyLabel,
} from "@/auth-v2/theme/onboardingMotion";
import { spacing, typography } from "@/theme";

interface WizardProgressProps {
  step: OnboardingWizardStep;
  tone?: "light" | "dark";
  verifiedMobile?: boolean;
  verifiedEmail?: boolean;
  identityPhase?: IdentityPhase;
}

/**
 * Subtle Profile → Location bar. Hidden during phone/email authentication.
 */
export function WizardProgress({
  step,
  tone = "dark",
  identityPhase = "details",
}: WizardProgressProps) {
  if (!shouldShowOnboardingProgress(step)) return null;
  const stage = onboardingJourneyStage(step, identityPhase);
  if (!stage) return null;
  const activeIndex = onboardingJourneyIndex(stage);
  const muted = tone === "dark" ? "rgba(255,255,255,0.42)" : "#64748B";
  const active = tone === "dark" ? "rgba(224,231,255,0.88)" : "#312E81";
  const track = tone === "dark" ? "rgba(255,255,255,0.1)" : "rgba(15,23,42,0.1)";
  const fill = tone === "dark" ? "rgba(165,180,252,0.7)" : "#4338CA";
  const progress = (activeIndex + 1) / ONBOARDING_JOURNEY_STAGES.length;

  return (
    <View style={styles.wrap} accessibilityRole="summary" testID="onboarding-business-progress">
      <View style={[styles.track, { backgroundColor: track }]}>
        <View style={[styles.fill, { width: `${Math.round(progress * 100)}%`, backgroundColor: fill }]} />
      </View>
      <View style={styles.labels}>
        {ONBOARDING_JOURNEY_STAGES.map((id, index) => (
          <Text
            key={id}
            style={[
              styles.stage,
              { color: index === activeIndex ? active : muted },
              index === activeIndex && styles.stageActive,
            ]}
          >
            {onboardingJourneyLabel(id)}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginHorizontal: -spacing.lg,
    gap: 6,
  },
  track: {
    height: 2,
    borderRadius: 1,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 1,
  },
  labels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  stage: {
    ...typography.micro,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    fontSize: 10,
  },
  stageActive: {
    fontWeight: "600",
  },
});
