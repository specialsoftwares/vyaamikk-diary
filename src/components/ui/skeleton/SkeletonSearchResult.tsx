import React, { memo } from "react";
import { StyleSheet, View } from "react-native";

import { radius, spacing, useThemedStyles } from "@/theme";

import { SkeletonBase } from "./SkeletonBase";
import { SkeletonLine } from "./SkeletonLine";

/** Matches `GlobalSearchResultRow` / `CalendarMapRecordRow` / `AtAGlanceRow`. */
export const SkeletonSearchResult = memo(function SkeletonSearchResult() {
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      row: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: spacing.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: c.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
        borderLeftWidth: 3,
        borderLeftColor: c.divider,
      },
      icon: { width: 36, height: 36, borderRadius: 18 },
      body: { flex: 1, gap: 2 },
    })
  );

  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <SkeletonBase width={36} height={36} borderRadius={18} style={styles.icon} />
      <View style={styles.body}>
        <SkeletonLine size="caption" widthPct={28} />
        <SkeletonLine size="title" widthPct={78} />
        <SkeletonLine size="caption" widthPct={95} />
        <SkeletonLine size="caption" widthPct={62} />
        <SkeletonLine size="caption" widthPct={24} style={{ marginBottom: 0 }} />
      </View>
    </View>
  );
});
