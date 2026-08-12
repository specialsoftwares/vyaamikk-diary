import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { AuthV2PrimaryButton } from "@/auth-v2/components/AuthV2PrimaryButton";
import { OnboardingV2Shell } from "@/auth-v2/components/OnboardingV2Shell";
import { OnboardingInlineMessage } from "@/auth-v2/components/OnboardingInlineMessage";
import { useAuthV2Theme } from "@/auth-v2/hooks/useAuthV2Theme";
import { spacing, typography } from "@/theme";

interface ReviewEditShellProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  primaryCta: string;
  onPrimary: () => void;
  onBack: () => void;
  primaryLoading?: boolean;
  primaryDisabled?: boolean;
  error?: string | null;
  children: React.ReactNode;
  testID?: string;
}

/**
 * Enterprise Review Edit chrome — production visual language only.
 */
export function ReviewEditShell({
  eyebrow,
  title,
  subtitle,
  primaryCta,
  onPrimary,
  onBack,
  primaryLoading = false,
  primaryDisabled = false,
  error = null,
  children,
  testID,
}: ReviewEditShellProps) {
  const { tokens } = useAuthV2Theme();

  return (
    <OnboardingV2Shell
      stageLabel={eyebrow}
      title={title}
      subtitle={subtitle}
      onBack={onBack}
      footer={
        <>
          {error ? <OnboardingInlineMessage tone="danger" message={error} /> : null}
          <AuthV2PrimaryButton
            label={primaryCta}
            loading={primaryLoading}
            loadingLabel={
              /save/i.test(primaryCta)
                ? "Saving…"
                : /continue|confirm/i.test(primaryCta)
                  ? "Continuing…"
                  : undefined
            }
            disabled={primaryDisabled || primaryLoading}
            onPress={onPrimary}
            purpose="save"
            testID={testID ?? "review-edit-primary"}
            activeBg={tokens.ctaActiveBg}
            activeText={tokens.ctaActiveText}
            mutedBg={tokens.ctaMutedBg}
            mutedText={tokens.ctaMutedText}
            mutedBorder={tokens.ctaMutedBorder}
          />
        </>
      }
    >
      <View style={styles.body}>{children}</View>
    </OnboardingV2Shell>
  );
}

export type ReviewStatusKind = "verified" | "optional" | "not_added" | "requires_verification";

export function ReviewStatusBadge({ kind }: { kind: ReviewStatusKind }) {
  const { tokens } = useAuthV2Theme();
  const label =
    kind === "verified"
      ? "Verified"
      : kind === "optional"
        ? "Optional"
        : kind === "requires_verification"
          ? "Requires verification"
          : "Not added";
  const color =
    kind === "verified"
      ? tokens.secondaryActiveFg
      : kind === "requires_verification"
        ? "#FCD34D"
        : tokens.muted;
  return (
    <View
      style={[styles.badge, { borderColor: color }]}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

export function ReviewInfoCard({
  children,
}: {
  children: React.ReactNode;
}) {
  const { tokens } = useAuthV2Theme();
  return (
    <View
      style={[
        styles.infoCard,
        { backgroundColor: tokens.cardBg, borderColor: tokens.cardBorder },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md, marginTop: spacing.xs },
  badge: {
    alignSelf: "flex-start",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    ...typography.captionStrong,
    letterSpacing: 0.3,
  },
  infoCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.sm,
  },
});
