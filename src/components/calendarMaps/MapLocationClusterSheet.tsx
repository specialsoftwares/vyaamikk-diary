import React, { memo, useMemo } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { CalendarMapRecordRow } from "@/components/calendarMaps/CalendarMapRecordRow";
import type { MapLocationCluster } from "@/services/calendarMaps/mapClustering";
import type { CalendarMapCategoryKey, CalendarMapRecord } from "@/services/calendarMaps";
import { radius, spacing, typography, useThemedStyles } from "@/theme";
import { useT } from "@/i18n";

interface MapLocationClusterSheetProps {
  cluster: MapLocationCluster | null;
  locationLabel: string;
  countLabel: string;
  onClose: () => void;
  onOpenRecord: (record: CalendarMapRecord) => void;
  typeLabel: (record: CalendarMapRecord) => string;
}

const CATEGORY_ORDER: CalendarMapCategoryKey[] = [
  "freight",
  "payments",
  "materials",
  "staff",
  "work",
  "reminders",
  "letterhead",
  "proPacks",
];

type SheetRow =
  | { kind: "header"; key: string; title: string }
  | { kind: "record"; key: string; record: CalendarMapRecord };

export const MapLocationClusterSheet = memo(function MapLocationClusterSheet({
  cluster,
  locationLabel,
  countLabel,
  onClose,
  onOpenRecord,
  typeLabel,
}: MapLocationClusterSheetProps) {
  const t = useT();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      sheet: {
        backgroundColor: c.surface,
        borderRadius: radius.xl,
        padding: spacing.md,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
        maxHeight: 320,
      },
      headerRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: spacing.sm,
      },
      title: { ...typography.captionStrong, color: c.text },
      close: { ...typography.captionStrong, color: c.primary },
      sub: { ...typography.caption, color: c.textMuted, marginBottom: spacing.sm },
      section: {
        ...typography.micro,
        color: c.textMuted,
        marginTop: spacing.xs,
        marginBottom: spacing.xs,
        textTransform: "uppercase",
        letterSpacing: 0.4,
      },
      list: { gap: spacing.sm },
    })
  );

  const rows = useMemo((): SheetRow[] => {
    if (!cluster) return [];
    const byCat = new Map<CalendarMapCategoryKey, CalendarMapRecord[]>();
    for (const r of cluster.records) {
      const list = byCat.get(r.categoryKey) ?? [];
      list.push(r);
      byCat.set(r.categoryKey, list);
    }
    const out: SheetRow[] = [];
    for (const cat of CATEGORY_ORDER) {
      const items = byCat.get(cat);
      if (!items?.length) continue;
      out.push({
        kind: "header",
        key: `h-${cat}`,
        title: t(`calendarMaps.sections.${cat}`),
      });
      for (const record of items) {
        out.push({ kind: "record", key: record.id, record });
      }
    }
    return out;
  }, [cluster, t]);

  if (!cluster) return null;

  return (
    <View style={styles.sheet}>
      <View style={styles.headerRow}>
        <Text style={styles.title} numberOfLines={2}>
          {locationLabel}
        </Text>
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={styles.close}>×</Text>
        </Pressable>
      </View>
      {cluster.count > 1 ? <Text style={styles.sub}>{countLabel}</Text> : null}
      <FlatList
        data={rows}
        keyExtractor={(item) => item.key}
        style={styles.list}
        nestedScrollEnabled
        initialNumToRender={8}
        renderItem={({ item }) =>
          item.kind === "header" ? (
            <Text style={styles.section}>{item.title}</Text>
          ) : (
            <CalendarMapRecordRow
              record={item.record}
              typeLabel={typeLabel(item.record)}
              clusterMode
              onPress={() => onOpenRecord(item.record)}
            />
          )
        }
      />
    </View>
  );
});
