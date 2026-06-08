import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { LANDING_PREVIEW } from "@/components/landing/landingCopy";
import { LANDING_COLORS, landingTypography } from "@/components/landing/landingTokens";
import { useLandingFloat } from "@/components/landing/useLandingMotion";
import { BRAND_GOLD } from "@/config/brandMotion";
import { radius, spacing } from "@/theme";

export function LandingDashboardPreview() {
  const { translateY } = useLandingFloat(true);

  return (
    <View style={[styles.wrap, { transform: [{ translateY }] }]}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.dotRow}>
            <View style={[styles.dot, { backgroundColor: "#FF6B6B" }]} />
            <View style={[styles.dot, { backgroundColor: BRAND_GOLD }]} />
            <View style={[styles.dot, { backgroundColor: "#4ADE80" }]} />
          </View>
          <Text style={styles.cardTitle}>Workspace overview</Text>
        </View>

        <View style={styles.metricGrid}>
          {LANDING_PREVIEW.metrics.map((m) => (
            <View key={m.label} style={styles.metricTile}>
              <Text style={styles.metricValue}>{m.value}</Text>
              <Text style={styles.metricLabel}>{m.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.docCard}>
          <Text style={styles.docTitle}>{LANDING_PREVIEW.documentTitle}</Text>
          {LANDING_PREVIEW.documentRows.map((row) => (
            <View key={row.label} style={styles.docRow}>
              <Text style={styles.docKey}>{row.label}</Text>
              <Text style={styles.docVal}>{row.value}</Text>
            </View>
          ))}
          <View style={styles.docRule} />
          <Text style={styles.docFooter}>{LANDING_PREVIEW.documentFooter}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
  },
  card: {
    backgroundColor: LANDING_COLORS.cardBg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: LANDING_COLORS.cardBorder,
    padding: spacing.lg,
    gap: spacing.lg,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  cardHeader: {
    gap: spacing.sm,
  },
  dotRow: {
    flexDirection: "row",
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cardTitle: {
    ...landingTypography.caption,
    color: LANDING_COLORS.textMuted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  metricTile: {
    width: "47%",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: LANDING_COLORS.cardBorder,
  },
  metricValue: {
    ...landingTypography.sectionTitle,
    fontSize: 18,
    marginBottom: 2,
  },
  metricLabel: {
    ...landingTypography.caption,
    color: LANDING_COLORS.textSubtle,
  },
  docCard: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: LANDING_COLORS.accentBorder,
  },
  docTitle: {
    ...landingTypography.bodySm,
    color: LANDING_COLORS.textPrimary,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  docRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  docKey: {
    ...landingTypography.caption,
    color: LANDING_COLORS.textMuted,
  },
  docVal: {
    ...landingTypography.caption,
    color: LANDING_COLORS.textPrimary,
  },
  docRule: {
    height: 2,
    backgroundColor: BRAND_GOLD,
    opacity: 0.75,
    marginVertical: spacing.sm,
    width: 48,
  },
  docFooter: {
    ...landingTypography.caption,
    color: LANDING_COLORS.textSubtle,
    fontSize: 10,
  },
});
