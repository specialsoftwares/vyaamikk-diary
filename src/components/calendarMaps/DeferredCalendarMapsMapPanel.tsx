import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import Constants from "expo-constants";

import { Button, LocaleUiText } from "@/components/ui";
import { useT } from "@/i18n";
import type { CalendarMapRecord } from "@/services/calendarMaps";
import type { MapMarkerBuildStats } from "@/services/calendarMaps/mapMarkerRecords";
import type { MapLocationCluster } from "@/services/calendarMaps/mapClustering";
import { mayMountNativeMapView, readAndroidMapsConfigured } from "@/services/maps/mapNativeConfig";
import { spacing, typography, useThemeColors } from "@/theme";

export interface DeferredCalendarMapsMapPanelProps {
  clusters: MapLocationCluster[];
  loading: boolean;
  markersLoading: boolean;
  mapStats: MapMarkerBuildStats;
  locationPermission: "granted" | "denied" | "undetermined";
  onRefreshPermission: () => void;
  onOpenRecord: (record: CalendarMapRecord) => void;
  onBackToCalendar?: () => void;
}

/**
 * Loads react-native-maps only when the user opens Map mode — keeps the native
 * maps module out of the initial Expo Go download graph.
 */
export function DeferredCalendarMapsMapPanel(props: DeferredCalendarMapsMapPanelProps) {
  const t = useT();
  const colors = useThemeColors();
  const canMount = mayMountNativeMapView({
    platform: Platform.OS,
    androidMapsConfigured: readAndroidMapsConfigured(Constants.expoConfig?.extra),
  });
  const [Panel, setPanel] = useState<React.ComponentType<DeferredCalendarMapsMapPanelProps> | null>(
    null
  );

  useEffect(() => {
    if (!canMount) return;
    let cancelled = false;
    void import("@/components/calendarMaps/CalendarMapsMapPanel").then((mod) => {
      if (!cancelled) setPanel(() => mod.CalendarMapsMapPanel);
    });
    return () => {
      cancelled = true;
    };
  }, [canMount]);

  if (!canMount) {
    return (
      <View style={styles.unavailable}>
        <LocaleUiText style={[styles.title, { color: colors.text }]}>
          {t("calendarMaps.map.unavailableTitle")}
        </LocaleUiText>
        <LocaleUiText style={[styles.message, { color: colors.textMuted }]}>
          {t("calendarMaps.map.unavailableBody")}
        </LocaleUiText>
        {props.onBackToCalendar ? (
          <Button
            label={t("calendarMaps.map.backToCalendar")}
            onPress={props.onBackToCalendar}
            variant="secondary"
            size="md"
          />
        ) : null}
      </View>
    );
  }

  if (!Panel) {
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator size="small" />
      </View>
    );
  }

  return <Panel {...props} />;
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  unavailable: {
    alignSelf: "stretch",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: {
    ...typography.bodyStrong,
  },
  message: {
    ...typography.body,
  },
});
