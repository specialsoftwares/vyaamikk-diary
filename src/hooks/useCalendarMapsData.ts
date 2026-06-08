import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InteractionManager } from "react-native";

import { toAppError, userFacingMessage } from "@/domain/errors";
import { useT } from "@/i18n";
import {
  buildCalendarDayView,
  buildGpsMapMarkersSync,
  buildMarkedDatesForMonth,
  buildPinMapMarkersAsync,
  loadCalendarMapsSourceData,
  mergeStatutoryCalendarMarkers,
  type CalendarMapsSourceData,
  type MapMarkerBuildStats,
} from "@/services/calendarMaps";
import { buildStatutoryTabViewModel, statutoryMarkersByDate } from "@/services/statutory";
import { buildMapLocationClusters } from "@/services/calendarMaps/mapClustering";
import { locationService } from "@/services/location";
import { scheduleDeferredIndiaPincodeWarm } from "@/services/location/pincodeOfflineLookup";

const EMPTY_STATS: MapMarkerBuildStats = { hasGps: false, hasPin: false, total: 0 };

export interface UseCalendarMapsDataOptions {
  /** When false, skip map marker build (Calendar mode) — keeps tab responsive. */
  mapActive?: boolean;
}

export function useCalendarMapsData(
  userId: string | null,
  selectedDateKey: string,
  options: UseCalendarMapsDataOptions = {}
) {
  const { mapActive = false } = options;
  const t = useT();
  const [source, setSource] = useState<CalendarMapsSourceData | null>(null);
  const [loading, setLoading] = useState(Boolean(userId));
  const [refreshing, setRefreshing] = useState(false);
  const [markersLoading, setMarkersLoading] = useState(false);
  const [mapMarkers, setMapMarkers] = useState<import("@/services/calendarMaps").CalendarMapRecord[]>(
    []
  );
  const [mapStats, setMapStats] = useState<MapMarkerBuildStats>(EMPTY_STATS);
  const [statutoryCalendar, setStatutoryCalendar] = useState<
    import("@/services/statutory").StatutoryTabViewModel | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [locationPermission, setLocationPermission] = useState<
    "granted" | "denied" | "undetermined"
  >("undetermined");
  const hasLoadedOnceRef = useRef(false);
  const pinWarmStartedRef = useRef(false);

  const refreshPermission = useCallback(async () => {
    const status = await locationService.getPermissionStatus();
    setLocationPermission(status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined");
  }, []);

  const reload = useCallback(
    async (mode: "mount" | "refresh" = "mount") => {
      if (!userId) {
        hasLoadedOnceRef.current = false;
        setSource(null);
        setStatutoryCalendar(null);
        setMapMarkers([]);
        setMapStats(EMPTY_STATS);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      if (mode === "refresh" && hasLoadedOnceRef.current) {
        setRefreshing(true);
      } else if (!hasLoadedOnceRef.current) {
        setLoading(true);
      }
      setError(null);
      try {
        const [data, statutory] = await Promise.all([
          loadCalendarMapsSourceData(userId),
          buildStatutoryTabViewModel(userId, t),
        ]);
        hasLoadedOnceRef.current = true;
        setSource(data);
        setStatutoryCalendar(statutory);
        await refreshPermission();
      } catch (e) {
        setError(userFacingMessage(toAppError(e)));
        setSource(null);
        setStatutoryCalendar(null);
        setMapMarkers([]);
        setMapStats(EMPTY_STATS);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [userId, refreshPermission, t]
  );

  const refresh = useCallback(() => reload("refresh"), [reload]);

  useEffect(() => {
    void reload("mount");
  }, [reload]);

  /** Start PIN DB warm when user opens Map (deferred — never on Calendar-only view). */
  useEffect(() => {
    if (!mapActive || !userId || pinWarmStartedRef.current) return;
    pinWarmStartedRef.current = true;
    scheduleDeferredIndiaPincodeWarm(500);
  }, [mapActive, userId]);

  useEffect(() => {
    if (!source || !mapActive) {
      if (!mapActive) {
        setMapMarkers([]);
        setMapStats(EMPTY_STATS);
        setMarkersLoading(false);
      }
      return;
    }

    let cancelled = false;
    const gps = buildGpsMapMarkersSync(source, t);
    setMapMarkers(gps.markers);
    setMapStats(gps.stats);
    setMarkersLoading(true);

    const runPinPhase = () => {
      if (cancelled) return;
      void buildPinMapMarkersAsync(source, t)
        .then((pin: Awaited<ReturnType<typeof buildPinMapMarkersAsync>>) => {
          if (cancelled) return;
          setMapMarkers([...gps.markers, ...pin.markers]);
          setMapStats({
            hasGps: gps.stats.hasGps || pin.stats.hasGps,
            hasPin: pin.stats.hasPin,
            total: gps.stats.total + pin.stats.total,
          });
        })
        .catch(() => {
          if (!cancelled) {
            setMapMarkers(gps.markers);
            setMapStats(gps.stats);
          }
        })
        .finally(() => {
          if (!cancelled) setMarkersLoading(false);
        });
    };

    const task = InteractionManager.runAfterInteractions(runPinPhase);
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [source, t, mapActive]);

  const marked = useMemo(() => {
    if (!source) return {};
    const base = buildMarkedDatesForMonth(source);
    if (!statutoryCalendar) return base;
    return mergeStatutoryCalendarMarkers(
      base,
      Object.keys(statutoryMarkersByDate(statutoryCalendar))
    );
  }, [source, statutoryCalendar]);

  const dayView = useMemo(() => {
    if (!source) {
      return { dateKey: selectedDateKey, sections: [], totalCount: 0, isEmpty: true };
    }
    const statutoryDay = statutoryCalendar?.calendarByDate[selectedDateKey] ?? [];
    return buildCalendarDayView(source, selectedDateKey, t, statutoryDay);
  }, [source, selectedDateKey, t, statutoryCalendar]);

  const mapClusters = useMemo(
    () => buildMapLocationClusters(mapMarkers),
    [mapMarkers]
  );

  return {
    source,
    loading,
    refreshing,
    markersLoading,
    error,
    reload,
    refresh,
    marked,
    dayView,
    mapMarkers,
    mapClusters,
    mapStats,
    locationPermission,
    refreshPermission,
  };
}
