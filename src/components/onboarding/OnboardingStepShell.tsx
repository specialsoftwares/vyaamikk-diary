import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { SignatureHeroSurface } from "@/components/signature";
import { spacing, typography, useThemedStyles } from "@/theme";

interface OnboardingStepShellProps {
  stepLabel: string;
  title: string;
  body: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Shared premium shell for first-time onboarding steps (profile, UEID, location).
 */
export function OnboardingStepShell({
  stepLabel,
  title,
  body,
  children,
  footer,
  style,
}: OnboardingStepShellProps) {
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      wrap: { gap: spacing.lg },
      heroContent: {
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md + 2,
        gap: spacing.sm,
      },
      step: {
        ...typography.micro,
        color: c.textSubtle,
        letterSpacing: 1.2,
        textTransform: "uppercase",
      },
      heroTitle: { ...typography.titleMd, color: c.text, lineHeight: 26 },
      heroBody: { ...typography.body, color: c.textMuted, lineHeight: 22 },
      panel: { gap: spacing.lg },
      footer: { marginTop: spacing.xs },
    })
  );

  return (
    <View style={[styles.wrap, style]}>
      <SignatureHeroSurface variant="identity" padded={false} contentStyle={styles.heroContent}>
        <Text style={styles.step}>{stepLabel}</Text>
        <Text style={styles.heroTitle} accessibilityRole="header">
          {title}
        </Text>
        <Text style={styles.heroBody}>{body}</Text>
      </SignatureHeroSurface>
      <View style={styles.panel}>{children}</View>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}
