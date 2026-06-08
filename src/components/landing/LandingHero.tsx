import React from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";

import { LandingButton } from "@/components/landing/LandingButton";
import { LandingDashboardPreview } from "@/components/landing/LandingDashboardPreview";
import { LANDING_HERO } from "@/components/landing/landingCopy";
import { LANDING_COLORS, LANDING_LAYOUT, landingTypography } from "@/components/landing/landingTokens";
import { useLandingFadeIn } from "@/components/landing/useLandingMotion";
import { getAuthEntryHref } from "@/config/authWrapper";
import { spacing } from "@/theme";

export function LandingHero() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= LANDING_LAYOUT.breakpointDesktop;
  const fade = useLandingFadeIn(80);

  return (
    <View style={[styles.section, { opacity: fade.opacity }]}>
      <View style={[styles.row, isWide ? styles.rowWide : null]}>
        <View style={[styles.copy, isWide ? styles.copyWide : null]}>
          <Text accessibilityRole="header" style={landingTypography.display}>
            {LANDING_HERO.headline}
          </Text>
          <Text style={[landingTypography.body, styles.subhead]}>{LANDING_HERO.subheadline}</Text>
          <Text style={[landingTypography.caption, styles.trust]}>{LANDING_HERO.trustLine}</Text>
          <View style={[styles.ctaRow, isWide ? styles.ctaRowWide : null]}>
            <LandingButton
              label={LANDING_HERO.primaryCta}
              onPress={() => router.push(getAuthEntryHref())}
              style={styles.cta}
            />
            <LandingButton
              label={LANDING_HERO.secondaryCta}
              variant="ghost"
              onPress={() => router.push({ pathname: "/legal/[doc]", params: { doc: "privacy" } })}
              style={styles.cta}
            />
          </View>
        </View>
        <View style={[styles.previewCol, isWide ? styles.previewColWide : null]}>
          <LandingDashboardPreview />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: LANDING_LAYOUT.sectionPaddingH,
    paddingTop: spacing.xxxl + 56,
    paddingBottom: LANDING_LAYOUT.sectionPaddingV,
    maxWidth: LANDING_LAYOUT.maxWidth,
    width: "100%",
    alignSelf: "center",
  },
  row: {
    gap: spacing.xxxl,
  },
  rowWide: {
    flexDirection: "row",
    alignItems: "center",
  },
  copy: {
    gap: spacing.lg,
  },
  copyWide: {
    flex: 1.05,
  },
  subhead: {
    maxWidth: 560,
  },
  trust: {
    color: LANDING_COLORS.textMuted,
    maxWidth: 520,
    lineHeight: 18,
  },
  ctaRow: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  ctaRowWide: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  cta: {
    alignSelf: "stretch",
    maxWidth: 320,
  },
  previewCol: {
    width: "100%",
  },
  previewColWide: {
    flex: 0.95,
  },
});
