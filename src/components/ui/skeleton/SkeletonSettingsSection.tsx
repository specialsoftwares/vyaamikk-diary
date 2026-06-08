import React, { memo } from "react";
import { StyleSheet, View } from "react-native";

import { spacing, typography, useThemedStyles } from "@/theme";

import { SkeletonBase } from "./SkeletonBase";
import { SkeletonLine } from "./SkeletonLine";

/** Settings hero + nav card placeholders. */
export const SkeletonSettingsSection = memo(function SkeletonSettingsSection() {
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      hero: {
        padding: spacing.lg,
        borderRadius: 16,
        backgroundColor: c.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
        marginBottom: spacing.lg,
        gap: spacing.sm,
      },
      sectionLabel: {
        ...typography.captionStrong,
        color: c.textMuted,
        marginBottom: spacing.sm,
        marginTop: spacing.md,
      },
      nav: {
        padding: spacing.md,
        borderRadius: 14,
        backgroundColor: c.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        marginBottom: spacing.sm,
      },
      navIcon: { width: 40, height: 40, borderRadius: 12 },
      navBody: { flex: 1, gap: 4 },
    })
  );

  return (
    <View accessibilityLabel="Loading settings">
      <View style={styles.hero}>
        <SkeletonBase width={56} height={56} borderRadius={28} />
        <SkeletonLine size="title" widthPct={55} />
        <SkeletonLine size="caption" widthPct={40} style={{ marginBottom: 0 }} />
      </View>
      <SkeletonLine size="caption" widthPct={32} style={styles.sectionLabel} />
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.nav}>
          <SkeletonBase width={40} height={40} borderRadius={12} style={styles.navIcon} />
          <View style={styles.navBody}>
            <SkeletonLine size="body" widthPct={70} />
            <SkeletonLine size="caption" widthPct={90} style={{ marginBottom: 0 }} />
          </View>
        </View>
      ))}
    </View>
  );
});
