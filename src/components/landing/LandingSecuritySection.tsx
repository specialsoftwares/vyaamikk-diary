import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { LANDING_SECURITY } from "@/components/landing/landingCopy";
import { LANDING_COLORS, LANDING_LAYOUT, landingTypography } from "@/components/landing/landingTokens";
import { useLandingFadeIn } from "@/components/landing/useLandingMotion";
import { radius, spacing } from "@/theme";

export function LandingSecuritySection() {
  const fade = useLandingFadeIn(400);

  return (
    <View style={[styles.section, { opacity: fade.opacity }]}>
      <Text style={[landingTypography.mono, styles.eyebrow]}>Security</Text>
      <Text style={landingTypography.displaySm}>{LANDING_SECURITY.title}</Text>
      <View style={styles.panel}>
        {LANDING_SECURITY.bullets.map((bullet) => (
          <View key={bullet} style={styles.row}>
            <View style={styles.check} />
            <Text style={[landingTypography.bodySm, styles.text]}>{bullet}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: LANDING_LAYOUT.sectionPaddingH,
    paddingVertical: LANDING_LAYOUT.sectionPaddingV,
    maxWidth: LANDING_LAYOUT.maxWidth,
    width: "100%",
    alignSelf: "center",
    gap: spacing.lg,
  },
  eyebrow: {
    color: LANDING_COLORS.accent,
  },
  panel: {
    backgroundColor: LANDING_COLORS.cardBg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: LANDING_COLORS.cardBorder,
    padding: spacing.xl,
    gap: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  check: {
    width: 8,
    height: 8,
    borderRadius: 2,
    backgroundColor: LANDING_COLORS.accent,
    marginTop: 6,
  },
  text: {
    flex: 1,
    color: LANDING_COLORS.textSecondary,
  },
});
