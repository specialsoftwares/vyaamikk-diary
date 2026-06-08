import React, { memo } from "react";
import { StyleSheet, View } from "react-native";

import { radius, spacing, useThemedStyles } from "@/theme";

import { SkeletonLine } from "./SkeletonLine";

/** Matches `DraftListRow` divider layout. */
export const SkeletonDraftRow = memo(function SkeletonDraftRow() {
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      row: {
        paddingVertical: spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: c.divider,
        gap: 4,
      },
    })
  );

  return (
    <View style={styles.row}>
      <SkeletonLine size="caption" widthPct={22} />
      <SkeletonLine size="title" widthPct={82} />
      <SkeletonLine size="caption" widthPct={68} style={{ marginBottom: 0 }} />
    </View>
  );
});

/** Matches statutory list cards. */
export const SkeletonStatutoryCard = memo(function SkeletonStatutoryCard() {
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      card: {
        padding: spacing.md,
        borderRadius: 12,
        backgroundColor: c.surfaceMuted,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
        borderLeftWidth: 3,
        borderLeftColor: c.divider,
        marginBottom: spacing.sm,
        gap: spacing.xs,
      },
    })
  );

  return (
    <View style={styles.card}>
      <SkeletonLine size="title" widthPct={75} />
      <SkeletonLine size="caption" widthPct={45} />
      <SkeletonLine size="body" widthPct={92} />
      <SkeletonLine size="body" widthPct={60} style={{ marginBottom: 0 }} />
    </View>
  );
});

/** Matches letterhead history `Card` rows. */
export const SkeletonLetterheadCard = memo(function SkeletonLetterheadCard() {
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      card: {
        padding: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: c.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
        gap: spacing.sm,
      },
      pill: { alignSelf: "flex-start" },
      actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
    })
  );

  return (
    <View style={styles.card}>
      <SkeletonLine size="caption" widthPct={24} style={styles.pill} />
      <SkeletonLine size="title" widthPct={70} />
      <SkeletonLine size="caption" widthPct={52} />
      <View style={styles.actions}>
        <SkeletonLine size="body" widthPct={38} style={{ marginBottom: 0 }} />
        <SkeletonLine size="body" widthPct={28} style={{ marginBottom: 0 }} />
      </View>
    </View>
  );
});
