import React, { memo } from "react";
import { StyleSheet, View } from "react-native";

import { spacing } from "@/theme";

import { SkeletonCard } from "./SkeletonCard";
import { SkeletonLine } from "./SkeletonLine";

/** Matches diary `EntryRow` card layout. */
export const SkeletonDashboardPreview = memo(function SkeletonDashboardPreview() {
  return (
    <SkeletonCard elevated={false}>
      <View style={styles.header}>
        <SkeletonLine size="title" widthPct={58} style={styles.flex} />
        <SkeletonLine size="caption" widthPct={22} style={styles.flexEnd} />
      </View>
      <View style={styles.chipRow}>
        <SkeletonLine size="caption" widthPct={26} style={{ marginBottom: 0 }} />
      </View>
      <SkeletonLine size="body" widthPct={88} />
      <SkeletonLine size="body" widthPct={64} style={{ marginBottom: 0 }} />
    </SkeletonCard>
  );
});

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
    alignItems: "center",
  },
  flex: { flex: 1, marginBottom: 0 },
  flexEnd: { marginBottom: 0, alignSelf: "flex-start" },
  chipRow: { marginTop: spacing.sm, marginBottom: spacing.xs },
});
