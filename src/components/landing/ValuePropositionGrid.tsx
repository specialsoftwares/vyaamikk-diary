import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import {
  LANDING_VALUE_OWNERS,
  LANDING_VALUE_PROFESSIONAL,
  LANDING_VALUE_TABS,
} from "@/components/landing/landingCopy";
import { LANDING_COLORS, LANDING_LAYOUT, landingTypography } from "@/components/landing/landingTokens";
import { useLandingFadeIn } from "@/components/landing/useLandingMotion";
import { radius, spacing } from "@/theme";

type TabKey = "owners" | "professional";

export function ValuePropositionGrid() {
  const [tab, setTab] = useState<TabKey>("owners");
  const { width } = useWindowDimensions();
  const isWide = width >= LANDING_LAYOUT.breakpointTablet;
  const fade = useLandingFadeIn(240);
  const items = tab === "owners" ? LANDING_VALUE_OWNERS : LANDING_VALUE_PROFESSIONAL;

  return (
    <View style={[styles.section, { opacity: fade.opacity }]}>
      <Text style={[landingTypography.mono, styles.eyebrow]}>Workflows</Text>
      <Text style={landingTypography.displaySm}>Dual-engine value for every business rhythm</Text>

      <View style={styles.tabRow}>
        {(["owners", "professional"] as const).map((key) => {
          const active = tab === key;
          const label = key === "owners" ? LANDING_VALUE_TABS.owners : LANDING_VALUE_TABS.professional;
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setTab(key)}
              style={({ pressed }) => [
                styles.tab,
                active && styles.tabActive,
                pressed && styles.tabPressed,
              ]}
            >
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.grid, isWide ? styles.gridWide : null]}>
        {items.map((item) => (
          <View key={item.title} style={[styles.card, isWide ? styles.cardWide : null]}>
            <Text style={landingTypography.sectionTitle}>{item.title}</Text>
            <Text style={[landingTypography.bodySm, styles.body]}>{item.body}</Text>
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
  tabRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  tab: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: LANDING_COLORS.cardBorder,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  tabActive: {
    borderColor: LANDING_COLORS.accentBorder,
    backgroundColor: LANDING_COLORS.accentSoft,
  },
  tabPressed: {
    opacity: 0.88,
  },
  tabLabel: {
    ...landingTypography.caption,
    color: LANDING_COLORS.textMuted,
    fontSize: 13,
  },
  tabLabelActive: {
    color: LANDING_COLORS.textPrimary,
  },
  grid: {
    gap: spacing.md,
  },
  gridWide: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  card: {
    backgroundColor: LANDING_COLORS.cardBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: LANDING_COLORS.cardBorder,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardWide: {
    width: "48%",
    flexGrow: 1,
    minWidth: 260,
  },
  body: {
    color: LANDING_COLORS.textMuted,
  },
});
