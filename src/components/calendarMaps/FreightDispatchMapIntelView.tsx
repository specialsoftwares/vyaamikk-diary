import React, { memo, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { FreightDispatchMapIntel } from "@/services/calendarMaps/freightDispatchMapIntel";
import {
  freightDispatchClusterEntryMeta,
  freightDispatchMapCardLines,
  freightDispatchLocationSummary,
} from "@/services/calendarMaps/freightDispatchMapIntel";
import { spacing, typography, useThemedStyles } from "@/theme";

export type FreightDispatchIntelVariant = "map" | "calendar" | "cluster";

interface FreightDispatchMapIntelViewProps {
  intel: FreightDispatchMapIntel;
  variant?: FreightDispatchIntelVariant;
  /** Pre-built one-liner for calendar rows (avoids duplicate route in body). */
  snippet?: string;
}

export const FreightDispatchMapIntelView = memo(function FreightDispatchMapIntelView({
  intel,
  variant = "map",
  snippet,
}: FreightDispatchMapIntelViewProps) {
  const lines = useMemo(() => freightDispatchMapCardLines(intel), [intel]);
  const route = useMemo(() => freightDispatchLocationSummary(intel), [intel]);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      wrap: { gap: variant === "map" ? spacing.xs : 3 },
      route: { ...typography.bodyStrong, color: c.text, lineHeight: 22 },
      line: { ...typography.caption, color: c.textMuted, lineHeight: 18 },
      clusterMeta: { ...typography.caption, color: c.textMuted, lineHeight: 17 },
      calendarSnippet: { ...typography.caption, color: c.textMuted, lineHeight: 18 },
    })
  );

  if (lines.length === 0) return null;

  if (variant === "calendar" && snippet) {
    return (
      <Text style={styles.calendarSnippet} numberOfLines={2}>
        {snippet}
      </Text>
    );
  }

  if (variant === "cluster") {
    const meta = freightDispatchClusterEntryMeta(intel);
    if (!meta) return null;
    return (
      <Text style={styles.clusterMeta} numberOfLines={2}>
        {meta}
      </Text>
    );
  }

  const detailLines = route ? lines.slice(1) : lines;
  return (
    <View style={styles.wrap}>
      {route ? (
        <Text style={styles.route} numberOfLines={2}>
          {route}
        </Text>
      ) : null}
      {detailLines.map((line) => (
        <Text key={line} style={styles.line} numberOfLines={2}>
          {line}
        </Text>
      ))}
    </View>
  );
});
