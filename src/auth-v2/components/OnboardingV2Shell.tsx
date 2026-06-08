import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { AuthShell } from "@/auth-v2/components/AuthShell";
import { useAuthV2Theme } from "@/auth-v2/hooks/useAuthV2Theme";
import { spacing, typography } from "@/theme";

interface OnboardingV2ShellProps {
  title: string;
  subtitle?: string;
  stageLabel?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onBack?: () => void;
  showBack?: boolean;
}

/** Premium indigo shell for post-auth onboarding (identity → UEID → footprint). */
export function OnboardingV2Shell({
  title,
  subtitle,
  stageLabel,
  children,
  footer,
  onBack,
  showBack = true,
}: OnboardingV2ShellProps) {
  const { tokens } = useAuthV2Theme();

  return (
    <AuthShell
      title={title}
      subtitle={subtitle}
      onBack={onBack}
      showBack={showBack}
      headerTop={
        stageLabel ? (
          <Text style={[styles.stage, { color: tokens.muted }]}>{stageLabel}</Text>
        ) : null
      }
      footer={footer}
    >
      {children}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    marginHorizontal: -spacing.lg,
  },
  stage: {
    ...typography.micro,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    marginHorizontal: -spacing.lg,
  },
  stageSpacer: { flex: 1 },
});
