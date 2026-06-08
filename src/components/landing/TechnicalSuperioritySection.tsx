import React from "react";
import { Platform, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { LANDING_TECH } from "@/components/landing/landingCopy";
import { LANDING_COLORS, LANDING_LAYOUT, landingTypography } from "@/components/landing/landingTokens";
import { useLandingFadeIn } from "@/components/landing/useLandingMotion";
import { radius, spacing } from "@/theme";

export function TechnicalSuperioritySection() {
  const { width } = useWindowDimensions();
  const isCompact = width < LANDING_LAYOUT.breakpointTablet;
  const fade = useLandingFadeIn(320);

  return (
    <View style={[styles.section, { opacity: fade.opacity }]}>
      <Text style={[landingTypography.mono, styles.eyebrow]}>Architecture</Text>
      <Text style={landingTypography.displaySm}>{LANDING_TECH.title}</Text>
      <Text style={[landingTypography.body, styles.subtitle]}>{LANDING_TECH.subtitle}</Text>

      <View style={[styles.pipeline, isCompact ? styles.pipelineCompact : null]}>
        {LANDING_TECH.nodes.map((node, index) => (
          <React.Fragment key={node}>
            <View style={styles.node}>
              <Text style={landingTypography.mono}>{node}</Text>
            </View>
            {index < LANDING_TECH.nodes.length - 1 ? (
              <View style={[styles.connector, isCompact ? styles.connectorCompact : null]}>
                <Text style={styles.arrow}>{isCompact ? "↓" : "→"}</Text>
              </View>
            ) : null}
          </React.Fragment>
        ))}
      </View>

      <View style={styles.bulletPanel}>
        {LANDING_TECH.bullets.map((bullet) => (
          <View key={bullet} style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={[landingTypography.bodySm, styles.bulletText]}>{bullet}</Text>
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
  subtitle: {
    maxWidth: 640,
  },
  pipeline: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  pipelineCompact: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  node: {
    backgroundColor: LANDING_COLORS.cardBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: LANDING_COLORS.accentBorder,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    ...(Platform.OS === "web" ? ({ flexShrink: 1 } as object) : null),
  },
  connector: {
    paddingHorizontal: 4,
  },
  connectorCompact: {
    alignSelf: "center",
    paddingVertical: 2,
  },
  arrow: {
    color: LANDING_COLORS.textSubtle,
    fontSize: 14,
    fontWeight: "600",
  },
  bulletPanel: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: LANDING_COLORS.cardBorder,
    padding: spacing.lg,
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: LANDING_COLORS.gold,
    marginTop: 7,
  },
  bulletText: {
    flex: 1,
    color: LANDING_COLORS.textSecondary,
  },
});
