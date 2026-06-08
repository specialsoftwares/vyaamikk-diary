import React, { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import MapView, { PROVIDER_DEFAULT, type MarkerPressEvent } from "react-native-maps";

import { CalendarMapRecordRow } from "@/components/calendarMaps/CalendarMapRecordRow";
import { FreightDispatchMapIntelView } from "@/components/calendarMaps/FreightDispatchMapIntelView";
import { MapClusterMarker } from "@/components/calendarMaps/MapClusterMarker";
import { MapLocationClusterSheet } from "@/components/calendarMaps/MapLocationClusterSheet";
import { Button, LocaleUiText } from "@/components/ui";
import type { CalendarMapRecord } from "@/services/calendarMaps";
import { clusterDispatchLocationLabel } from "@/services/calendarMaps/freightDispatchMapIntel";
import type { MapLocationCluster } from "@/services/calendarMaps/mapClustering";
import type { MapMarkerBuildStats } from "@/services/calendarMaps/mapMarkerRecords";
import { useT } from "@/i18n";
import { mapMarkerColorForEntryType } from "@/theme/categoryAccentResolver";
import { radius, spacing, typography, useThemedStyles } from "@/theme";
import { useTabBarMetrics } from "@/layout/tabBar";

interface CalendarMapsMapPanelProps {
  clusters: MapLocationCluster[];
  loading: boolean;
  markersLoading: boolean;
  mapStats: MapMarkerBuildStats;
  locationPermission: "granted" | "denied" | "undetermined";
  onRefreshPermission: () => void;
  onOpenRecord: (record: CalendarMapRecord) => void;
}

const PIN_MARKER_COLOR = "#D97706";

const INDIA_REGION = {
  latitude: 22.97,
  longitude: 78.65,
  latitudeDelta: 25,
  longitudeDelta: 25,
};

function clusterPinColor(cluster: MapLocationCluster): string {
  const type = cluster.records[0]?.entryType;
  if (!type) return "#3B41C5";
  return mapMarkerColorForEntryType(type);
}

export function CalendarMapsMapPanel({
  clusters,
  loading,
  markersLoading,
  mapStats,
  locationPermission,
  onRefreshPermission,
  onOpenRecord,
}: CalendarMapsMapPanelProps) {
  const t = useT();
  const router = useRouter();
  const tabBar = useTabBarMetrics();
  const mapRef = useRef<MapView | null>(null);
  const [activeCluster, setActiveCluster] = useState<MapLocationCluster | null>(null);

  const hasMarkers = clusters.length > 0;
  /** Only initial source fetch blocks the map; marker build uses a corner spinner. */
  const mapBusy = loading;
  const markersRefreshing = markersLoading && !hasMarkers;

  const mapTouchEnabled = !markersLoading;

  const clusterById = useMemo(() => {
    const map = new Map<string, MapLocationCluster>();
    for (const c of clusters) map.set(c.id, c);
    return map;
  }, [clusters]);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      root: {
        flex: 1,
      },
      mapBlock: {
        flex: 1,
        minHeight: 400,
        marginHorizontal: spacing.lg,
        borderRadius: radius.lg,
        overflow: "hidden",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
      },
      mapInner: { ...StyleSheet.absoluteFillObject },
      topOverlay: {
        position: "absolute",
        top: spacing.sm,
        left: spacing.sm,
        right: spacing.sm,
        gap: spacing.xs,
      },
      infoChip: {
        alignSelf: "flex-start",
        maxWidth: "100%",
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.pill,
        backgroundColor: c.surface + "F0",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
      },
      infoChipText: { ...typography.micro, color: c.textMuted, lineHeight: 16 },
      legendRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: spacing.sm,
      },
      legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
      legendDot: { width: 8, height: 8, borderRadius: 4 },
      legendPinRing: {
        width: 8,
        height: 8,
        borderRadius: 4,
        borderWidth: 1.5,
        borderColor: "#D97706",
        backgroundColor: "transparent",
      },
      legendText: { ...typography.micro, color: c.textMuted },
      markerSpinner: {
        position: "absolute",
        top: spacing.sm + 40,
        right: spacing.sm,
        padding: spacing.sm,
        borderRadius: radius.md,
        backgroundColor: c.surface + "F0",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
      },
      centerOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center",
        justifyContent: "center",
        padding: spacing.lg,
        backgroundColor: c.background + "66",
      },
      overlayCard: {
        maxWidth: 320,
        padding: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: c.surface + "F2",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
        gap: spacing.sm,
        alignItems: "center",
      },
      overlayTitle: { ...typography.captionStrong, color: c.text, textAlign: "center" },
      overlayBody: {
        ...typography.caption,
        color: c.textMuted,
        textAlign: "center",
        lineHeight: 18,
      },
      permBanner: {
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.md,
        backgroundColor: c.warning + "22",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.warning + "55",
      },
      permBannerText: { ...typography.micro, color: c.textMuted, lineHeight: 16 },
      hintOverlay: {
        position: "absolute",
        left: spacing.md,
        right: spacing.md,
        bottom: spacing.md,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: radius.md,
        backgroundColor: c.surface + "E6",
        alignItems: "center",
      },
      hintText: { ...typography.caption, color: c.textMuted, textAlign: "center" },
      previewOverlay: {
        position: "absolute",
        left: spacing.sm,
        right: spacing.sm,
        bottom: spacing.sm,
        maxHeight: 360,
        borderRadius: radius.lg,
        backgroundColor: c.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
        padding: spacing.md,
        ...Platform.select({
          ios: {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.18,
            shadowRadius: 8,
          },
          android: { elevation: 8 },
        }),
      },
      previewScroll: { maxHeight: 220 },
      previewTypeLabel: { ...typography.captionStrong, color: c.primary, marginBottom: 4 },
      previewTitle: { ...typography.bodyStrong, color: c.text, marginBottom: spacing.xs },
      pinBadge: {
        alignSelf: "flex-start",
        paddingVertical: 2,
        paddingHorizontal: spacing.xs,
        borderRadius: radius.sm,
        backgroundColor: "#D9770622",
        marginBottom: spacing.xs,
      },
      pinBadgeText: { ...typography.micro, color: "#D97706", fontWeight: "600" },
    })
  );

  const initialRegion = useMemo(() => {
    if (!hasMarkers) return INDIA_REGION;
    const c0 = clusters[0];
    return {
      latitude: c0.latitude,
      longitude: c0.longitude,
      latitudeDelta: 0.35,
      longitudeDelta: 0.35,
    };
  }, [clusters, hasMarkers]);

  const onMapReady = useCallback(() => {
    if (!mapRef.current || clusters.length < 2) return;
    const coords = clusters.map((c) => ({
      latitude: c.latitude,
      longitude: c.longitude,
    }));
    mapRef.current.fitToCoordinates(coords, {
      edgePadding: { top: 100, bottom: 200, left: 40, right: 40 },
      animated: false,
    });
  }, [clusters]);

  const typeLabel = useCallback(
    (record: CalendarMapRecord) => t(record.categoryLabelKey),
    [t]
  );

  const onClusterPress = useCallback((cluster: MapLocationCluster) => {
    setActiveCluster(cluster);
  }, []);

  const onMarkerPress = useCallback(
    (event: MarkerPressEvent) => {
      const markerId = event.nativeEvent.id;
      if (!markerId) return;
      const cluster = clusterById.get(markerId);
      if (cluster) onClusterPress(cluster);
    },
    [clusterById, onClusterPress]
  );

  const locationSheetLabel = useMemo(() => {
    if (!activeCluster) return "";
    const label = clusterDispatchLocationLabel(activeCluster.records, t);
    return label?.trim() || t("calendarMaps.map.atLocation");
  }, [activeCluster, t]);

  const overlayContent = useMemo(() => {
    if (mapBusy && !hasMarkers) {
      return (
        <View style={styles.centerOverlay} pointerEvents="none">
          <View style={styles.overlayCard}>
            <ActivityIndicator />
            <LocaleUiText style={styles.overlayBody}>{t("common.loading")}</LocaleUiText>
          </View>
        </View>
      );
    }
    if (!hasMarkers && !markersRefreshing) {
      return (
        <View style={styles.centerOverlay} pointerEvents="box-none">
          <View style={styles.overlayCard}>
            <LocaleUiText style={styles.overlayTitle}>{t("calendarMaps.map.noMarkersTitle")}</LocaleUiText>
            <LocaleUiText style={styles.overlayBody}>{t("calendarMaps.map.noMarkersOverlayMessage")}</LocaleUiText>
          </View>
        </View>
      );
    }
    return null;
  }, [mapBusy, hasMarkers, markersRefreshing, styles, t]);

  const activeIsPin = activeCluster?.footprintSource === "pin_approximate";

  return (
    <View style={styles.root} pointerEvents="box-none">
      <View
        style={styles.mapBlock}
        pointerEvents={mapTouchEnabled ? "auto" : "none"}
        collapsable={false}
      >
        <MapView
          ref={mapRef}
          style={styles.mapInner}
          provider={PROVIDER_DEFAULT}
          initialRegion={initialRegion}
          onMapReady={onMapReady}
          onMarkerPress={onMarkerPress}
          showsUserLocation={false}
          showsMyLocationButton={false}
          mapPadding={{
            top: spacing.sm,
            bottom: activeCluster ? 200 : 72,
            left: spacing.xs,
            right: spacing.xs,
          }}
        >
          {clusters.map((cluster) => (
            <MapClusterMarker
              key={cluster.id}
              cluster={cluster}
              pinColor={clusterPinColor(cluster)}
              onPress={() => onClusterPress(cluster)}
            />
          ))}
        </MapView>

        <View style={styles.topOverlay} pointerEvents="box-none">
          <View style={styles.infoChip}>
            <LocaleUiText style={styles.infoChipText}>{t("calendarMaps.map.legendFootnote")}</LocaleUiText>
          </View>
          {(mapStats.hasGps || mapStats.hasPin) && hasMarkers ? (
            <View style={styles.legendRow}>
              {mapStats.hasGps ? (
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: "#3B41C5" }]} />
                  <LocaleUiText style={styles.legendText}>{t("calendarMaps.map.legendGps")}</LocaleUiText>
                </View>
              ) : null}
              {mapStats.hasPin ? (
                <View style={styles.legendItem}>
                  <View style={styles.legendPinRing} />
                  <LocaleUiText style={styles.legendText}>{t("calendarMaps.map.legendPin")}</LocaleUiText>
                </View>
              ) : null}
            </View>
          ) : null}
          {locationPermission !== "granted" ? (
            <Pressable
              style={styles.permBanner}
              onPress={() => router.push("/(app)/settings/location-footprints")}
              accessibilityRole="button"
            >
              <LocaleUiText style={styles.permBannerText}>
                {t("locationFootprints.map.accessOff")}
              </LocaleUiText>
            </Pressable>
          ) : null}
        </View>

        {overlayContent}

        {markersRefreshing ? (
          <View style={styles.markerSpinner} pointerEvents="none">
            <ActivityIndicator size="small" />
          </View>
        ) : null}

        {activeCluster ? (
          <View style={styles.previewOverlay}>
            {activeIsPin ? (
              <View style={styles.pinBadge}>
                <LocaleUiText style={styles.pinBadgeText}>{t("calendarMaps.map.pinApproximateBadge")}</LocaleUiText>
              </View>
            ) : null}
            {activeCluster.count === 1 ? (
              <>
                <Text style={styles.previewTypeLabel}>
                  {typeLabel(activeCluster.records[0])}
                </Text>
                <Text style={styles.previewTitle} numberOfLines={2}>
                  {activeCluster.records[0].title}
                </Text>
                {activeCluster.records[0].dispatchIntel ? (
                  <FreightDispatchMapIntelView
                    intel={activeCluster.records[0].dispatchIntel}
                    variant="map"
                  />
                ) : (
                  <CalendarMapRecordRow
                    record={activeCluster.records[0]}
                    typeLabel={typeLabel(activeCluster.records[0])}
                    onPress={() => {
                      onOpenRecord(activeCluster.records[0]);
                      setActiveCluster(null);
                    }}
                  />
                )}
                <Button
                  label={t("calendarMaps.map.openRecord")}
                  size="md"
                  onPress={() => {
                    onOpenRecord(activeCluster.records[0]);
                    setActiveCluster(null);
                  }}
                  style={{ marginTop: spacing.sm }}
                />
              </>
            ) : (
              <ScrollView
                style={styles.previewScroll}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                <MapLocationClusterSheet
                  cluster={activeCluster}
                  locationLabel={locationSheetLabel}
                  countLabel={t("calendarMaps.map.clusterCount", {
                    count: activeCluster.count,
                  })}
                  onClose={() => setActiveCluster(null)}
                  onOpenRecord={(r) => {
                    onOpenRecord(r);
                    setActiveCluster(null);
                  }}
                  typeLabel={typeLabel}
                />
              </ScrollView>
            )}
          </View>
        ) : hasMarkers ? (
          <View style={styles.hintOverlay} pointerEvents="none">
            <LocaleUiText style={styles.hintText}>{t("calendarMaps.map.tapMarkerHint")}</LocaleUiText>
          </View>
        ) : null}
      </View>

    </View>
  );
}
