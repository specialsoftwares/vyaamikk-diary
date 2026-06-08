import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import React, { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { FreightDispatchMapIntelView } from "@/components/calendarMaps/FreightDispatchMapIntelView";
import { CategoryAccentChip } from "@/components/ui/CategoryAccentChip";
import type { CalendarMapRecord } from "@/services/calendarMaps";
import {
  freightDispatchCalendarSnippet,
  freightDispatchClusterEntryMeta,
} from "@/services/calendarMaps/freightDispatchMapIntel";
import { formatShortDate } from "@/utils/date";
import { radius, spacing, typography, useThemedStyles } from "@/theme";
import {
  accentKeyForCalendarCategory,
  accentKeyFromTypeLabelKey,
} from "@/theme/categoryAccentResolver";
import { useCategoryAccent } from "@/theme/useBrandTokens";

interface CalendarMapRecordRowProps {
  record: CalendarMapRecord;
  typeLabel: string;
  onPress: () => void;
  /** Map cluster sheet: route is in header; show bill/LR/vehicle only. */
  clusterMode?: boolean;
}

export const CalendarMapRecordRow = memo(function CalendarMapRecordRow({
  record,
  typeLabel,
  onPress,
  clusterMode = false,
}: CalendarMapRecordRowProps) {
  const accentKey =
    record.entityType === "statutory_info"
      ? "statutory"
      : record.entryType
        ? accentKeyFromTypeLabelKey(`composer.types.${record.entryType}`)
        : accentKeyForCalendarCategory(record.categoryKey);
  const accent = useCategoryAccent(accentKey);
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
      },
      rowPressed: { opacity: 0.9 },
      iconWrap: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
      },
      body: { flex: 1, gap: 2 },
      title: { ...typography.bodyStrong, color: c.text },
      snippet: { ...typography.caption, color: c.textMuted },
      meta: { ...typography.caption, color: c.textSubtle, marginTop: 2 },
    })
  );

  const dispatchIntel = record.dispatchIntel;
  const dispatchSnippet = dispatchIntel
    ? clusterMode
      ? freightDispatchClusterEntryMeta(dispatchIntel)
      : freightDispatchCalendarSnippet(dispatchIntel)
    : "";
  const locationLine =
    !dispatchIntel && record.manualLocationLabel?.trim()
      ? record.manualLocationLabel.trim()
      : "";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderLeftColor: accent.main },
        clusterMode && { paddingVertical: spacing.sm },
        pressed && styles.rowPressed,
      ]}
      accessibilityRole="button"
    >
      <View style={[styles.iconWrap, { backgroundColor: accent.soft }]}>
        <MaterialCommunityIcons
          name={record.iconName as keyof typeof MaterialCommunityIcons.glyphMap}
          size={20}
          color={accent.main}
        />
      </View>
      <View style={styles.body}>
        <CategoryAccentChip accentKey={accentKey} label={typeLabel} compact />
        <Text style={styles.title} numberOfLines={1}>
          {record.title}
        </Text>
        {dispatchIntel && dispatchSnippet ? (
          <FreightDispatchMapIntelView
            intel={dispatchIntel}
            variant={clusterMode ? "cluster" : "calendar"}
            snippet={clusterMode ? undefined : dispatchSnippet}
          />
        ) : record.subtitle ? (
          <Text style={styles.snippet} numberOfLines={2}>
            {record.subtitle}
          </Text>
        ) : null}
        <Text style={styles.meta}>
          {formatShortDate(record.sortMs)}
          {locationLine ? ` · ${locationLine}` : ""}
        </Text>
      </View>
    </Pressable>
  );
});
