import React from "react";
import { Linking, Platform, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { LandingButton } from "@/components/landing/LandingButton";
import { LANDING_CTA } from "@/components/landing/landingCopy";
import { LANDING_COLORS, LANDING_LAYOUT, landingTypography } from "@/components/landing/landingTokens";
import { useLandingFadeIn } from "@/components/landing/useLandingMotion";
import { getAuthEntryHref } from "@/config/authWrapper";
import { legal } from "@/config/legal";
import { radius, spacing } from "@/theme";

export function LandingCTA() {
  const router = useRouter();
  const fade = useLandingFadeIn(480);

  const contactCompany = () => {
    const mailto = `mailto:${legal.supportEmail}?subject=${encodeURIComponent("Vyaamikk Diary — business enquiry")}`;
    void Linking.openURL(mailto);
  };

  return (
    <View style={[styles.section, { opacity: fade.opacity }]}>
      <View style={styles.panel}>
        <Text accessibilityRole="header" style={landingTypography.displaySm}>
          {LANDING_CTA.headline}
        </Text>
        <Text style={[landingTypography.body, styles.subtext]}>{LANDING_CTA.subtext}</Text>
        <View style={styles.actions}>
          <LandingButton
            label={LANDING_CTA.primary}
            onPress={() => router.push(getAuthEntryHref())}
            style={styles.btn}
          />
          <LandingButton
            label={LANDING_CTA.secondary}
            variant="ghost"
            onPress={contactCompany}
            style={styles.btn}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: LANDING_LAYOUT.sectionPaddingH,
    paddingBottom: LANDING_LAYOUT.sectionPaddingV,
    maxWidth: LANDING_LAYOUT.maxWidth,
    width: "100%",
    alignSelf: "center",
  },
  panel: {
    backgroundColor: LANDING_COLORS.accentSoft,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: LANDING_COLORS.accentBorder,
    padding: spacing.xxxl,
    gap: spacing.lg,
    alignItems: Platform.OS === "web" ? ("center" as const) : "stretch",
  },
  subtext: {
    textAlign: Platform.OS === "web" ? "center" : "left",
    maxWidth: 560,
  },
  actions: {
    gap: spacing.md,
    width: "100%",
    maxWidth: 420,
    marginTop: spacing.sm,
  },
  btn: {
    width: "100%",
  },
});
