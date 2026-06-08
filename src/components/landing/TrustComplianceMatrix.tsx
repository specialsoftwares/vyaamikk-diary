import React from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import { LANDING_TRUST } from "@/components/landing/landingCopy";
import { LANDING_COLORS, LANDING_LAYOUT, landingTypography } from "@/components/landing/landingTokens";
import { useLandingFadeIn } from "@/components/landing/useLandingMotion";
import { radius, spacing } from "@/theme";

export function TrustComplianceMatrix() {
  const { width } = useWindowDimensions();
  const isWide = width >= LANDING_LAYOUT.breakpointTablet;
  const fade = useLandingFadeIn(160);

  const cards = LANDING_TRUST.map((item) => (
    <View key={item.title} style={[styles.card, isWide ? styles.cardWide : null]}>
      <View style={styles.accentRule} />
      <Text style={landingTypography.sectionTitle}>{item.title}</Text>
      <Text style={[landingTypography.bodySm, styles.body]}>{item.body}</Text>
    </View>
  ));

  return (
    <View style={[styles.section, { opacity: fade.opacity }]}>
      <Text style={[landingTypography.mono, styles.eyebrow]}>Trust & compliance</Text>
      {isWide ? (
        <View style={styles.grid}>{cards}</View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.strip}
        >
          {cards}
        </ScrollView>
      )}
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
    gap: spacing.xl,
  },
  eyebrow: {
    color: LANDING_COLORS.accent,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  strip: {
    gap: spacing.md,
    paddingRight: spacing.lg,
  },
  card: {
    width: 280,
    backgroundColor: LANDING_COLORS.cardBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: LANDING_COLORS.accentBorder,
    padding: spacing.lg,
    gap: spacing.sm,
    ...(Platform.OS === "web"
      ? ({ transitionProperty: "opacity, border-color", transitionDuration: "180ms" } as object)
      : null),
  },
  cardWide: {
    width: "31%",
    minWidth: 240,
    flexGrow: 1,
  },
  accentRule: {
    width: 32,
    height: 2,
    backgroundColor: LANDING_COLORS.gold,
    opacity: 0.8,
    marginBottom: spacing.xs,
  },
  body: {
    color: LANDING_COLORS.textMuted,
  },
});
