import React, { memo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { CalendarMapRecordRow } from "@/components/calendarMaps/CalendarMapRecordRow";
import { LocaleUiText } from "@/components/ui";
import { useVyaaflowCopy } from "@/content/vyaaflow/useVyaaflowCopy";
import { useT } from "@/i18n";
import type { BusinessPinGroupView } from "@/services/calendarMaps/mapMarkerRecords";
import type { CalendarMapRecord } from "@/services/calendarMaps";
import { spacing, typography, useThemedStyles } from "@/theme";

interface BusinessPinRecordListProps {
  groups: readonly BusinessPinGroupView[];
  onOpenRecord: (record: CalendarMapRecord) => void;
}

export const BusinessPinRecordList = memo(function BusinessPinRecordList({
  groups,
  onOpenRecord,
}: BusinessPinRecordListProps) {
  const t = useT();
  const copy = useVyaaflowCopy();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      list: { flex: 1, minHeight: 0 },
      content: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        paddingBottom: spacing.xl,
        gap: spacing.md,
      },
      note: {
        fontFamily: typography.caption.fontFamily,
        fontSize: typography.caption.fontSize,
        fontWeight: typography.caption.fontWeight,
        color: c.textMuted,
      },
      group: { gap: spacing.sm },
      heading: {
        fontFamily: typography.titleSm.fontFamily,
        fontSize: typography.titleSm.fontSize,
        fontWeight: typography.titleSm.fontWeight,
        color: c.text,
      },
      area: {
        fontFamily: typography.caption.fontFamily,
        fontSize: typography.caption.fontSize,
        fontWeight: typography.caption.fontWeight,
        color: c.textMuted,
      },
    })
  );

  return (
    <ScrollView style={styles.list} contentContainerStyle={styles.content}>
      <LocaleUiText style={styles.note}>{copy.pinList.mapNote}</LocaleUiText>
      {groups.length === 0 ? (
        <LocaleUiText style={styles.note}>{copy.pinList.empty}</LocaleUiText>
      ) : (
        groups.map((group) => {
          const sideLabel = group.side === "from" ? copy.pinList.from : copy.pinList.to;
          const heading = `${sideLabel} ${group.pinCode}`;
          const placement = !group.valid
            ? copy.pinList.invalid
            : group.latitude == null
              ? copy.pinList.unplotted
              : copy.pinList.approximate;
          return (
            <View key={group.id} style={styles.group}>
              <LocaleUiText style={styles.heading} accessibilityRole="header">
                {heading}
              </LocaleUiText>
              {group.areaLabel ? (
                <LocaleUiText style={styles.area}>{group.areaLabel}</LocaleUiText>
              ) : null}
              <LocaleUiText style={styles.area}>{placement}</LocaleUiText>
              {group.records.map((record) => (
                <CalendarMapRecordRow
                  key={record.id}
                  record={record}
                  typeLabel={t(record.categoryLabelKey)}
                  onPress={() => onOpenRecord(record)}
                />
              ))}
            </View>
          );
        })
      )}
    </ScrollView>
  );
});
