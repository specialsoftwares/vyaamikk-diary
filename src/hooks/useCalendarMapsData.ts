import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InteractionManager } from "react-native";

import { toAppError, userFacingMessage } from "@/domain/errors";
import { useT } from "@/i18n";
import {
  buildBusinessPinGroupsSync,
  buildCalendarDayView,
  buildGpsMapMarkersSync,
  buildMarkedDatesForMonth,
  loadCalendarMapsSourceData,
  mergeStatutoryCalendarMarkers,
  plotBusinessPinGroups,
  type BusinessPinGroupView,
  type CalendarMapsSourceData,
  type MapMarkerBuildStats,
} from "@/services/calendarMaps";
import { buildStatutoryTabViewModel, statutoryMarkersByDate } from "@/services/statutory";
import { buildMapLocationClusters } from "@/services/calendarMaps/mapClustering";
import {
  isIndiaPincodeOfflineLookupReady,
  scheduleDeferredIndiaPincodeWarm,
} from "@/services/location/pincodeOfflineLookup";

const EMPTY_STATS: MapMarkerBuildStats = { hasGps: false, hasPin: false, total: 0 };

export interface UseCalendarMapsDataOptions {
  /** Native map marker work. Stays false when the Android map cannot mount. */
  mapActive?: boolean;
  /** PIN list for Business PINs. Independent of map tiles and the Maps key. */
  pinListActive?: boolean;
}

export function useCalendarMapsData(
  userId: string | null,
  selectedDateKey: string,
  options: UseCalendarMapsDataOptions = {}
) {
  const { mapActive = false, pinListActive = false } = options;
  const t = useT();
  const [source, setSource] = useState<CalendarMapsSourceData | null>(null);
  const [loading, setLoading] = useState(Boolean(userId));
  const [refreshing, setRefreshing] = useState(false);
  const [markersLoading, setMarkersLoading] = useState(false);
  const [mapMarkers, setMapMarkers] = useState<import("@/services/calendarMaps").CalendarMapRecord[]>(
    []
  );
  const [pinGroups, setPinGroups] = useState<BusinessPinGroupView[]>([]);
  const [mapStats, setMapStats] = useState<MapMarkerBuildStats>(EMPTY_STATS);
  const [statutoryCalendar, setStatutoryCalendar] = useState<
    import("@/services/statutory").StatutoryTabViewModel | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedOnceRef = useRef(false);
  const loadGenRef = useRef(0);
  const pinRunRef = useRef(0);
  const userIdRef = useRef(userId);
  const sourceUserRef = useRef<string | null>(null);
  const previousUserRef = useRef(userId);
  userIdRef.current = userId;
  if (previousUserRef.current !== userId) {
    previousUserRef.current = userId;
    sourceUserRef.current = null;
  }

  const reload = useCallback(
    async (mode: "mount" | "refresh" = "mount") => {
      const generation = ++loadGenRef.current;
      const owner = userId;
      if (!owner) {
        hasLoadedOnceRef.current = false;
        sourceUserRef.current = null;
        setSource(null);
        setStatutoryCalendar(null);
        setMapMarkers([]);
        setPinGroups([]);
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
          loadCalendarMapsSourceData(owner),
          buildStatutoryTabViewModel(owner, t),
        ]);
        if (generation !== loadGenRef.current || userIdRef.current !== owner) return;
        hasLoadedOnceRef.current = true;
        sourceUserRef.current = owner;
        setSource(data);
        setStatutoryCalendar(statutory);
      } catch (e) {
        if (generation !== loadGenRef.current || userIdRef.current !== owner) return;
        setError(userFacingMessage(toAppError(e)));
        sourceUserRef.current = null;
        setSource(null);
        setStatutoryCalendar(null);
        setMapMarkers([]);
        setPinGroups([]);
        setMapStats(EMPTY_STATS);
      } finally {
        if (generation === loadGenRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [userId, t]
  );

  const refresh = useCallback(() => reload("refresh"), [reload]);

  useEffect(() => {
    void reload("mount");
  }, [reload]);

  useEffect(() => {
    if (!source || sourceUserRef.current !== userId || (!pinListActive && !mapActive)) {
      setMapMarkers([]);
      setPinGroups([]);
      setMapStats(EMPTY_STATS);
      setMarkersLoading(false);
      return;
    }

    const owner = userId;
    const run = ++pinRunRef.current;
    const groups = pinListActive ? buildBusinessPinGroupsSync(source, t) : [];
    const gps = mapActive ? buildGpsMapMarkersSync(source, t) : { markers: [], stats: EMPTY_STATS };
    setPinGroups(groups);
    setMapMarkers(gps.markers);
    setMapStats(gps.stats);
    const needsLookup = groups.some((group) => group.valid);
    setMarkersLoading(needsLookup);

    if (!needsLookup) return;

    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      void plotBusinessPinGroups(groups, {
        isDbReady: isIndiaPincodeOfflineLookupReady,
        whenDbReady: () => scheduleDeferredIndiaPincodeWarm(500),
      })
        .then((plotted) => {
          if (cancelled || pinRunRef.current !== run || userIdRef.current !== owner) return;
          setPinGroups(plotted.groups);
          setMapMarkers([...gps.markers, ...plotted.markers]);
          setMapStats({
            hasGps: gps.stats.hasGps,
            hasPin: plotted.markers.length > 0,
            total: gps.stats.total + plotted.markers.length,
          });
        })
        .catch(() => {
          if (cancelled || pinRunRef.current !== run || userIdRef.current !== owner) return;
          setPinGroups(groups);
          setMapMarkers(gps.markers);
          setMapStats(gps.stats);
        })
        .finally(() => {
          if (!cancelled && pinRunRef.current === run) setMarkersLoading(false);
        });
    });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [source, t, mapActive, pinListActive, userId]);

  const marked = useMemo(() => {
    if (!source || sourceUserRef.current !== userId) return {};
    const base = buildMarkedDatesForMonth(source);
    if (!statutoryCalendar) return base;
    return mergeStatutoryCalendarMarkers(
      base,
      Object.keys(statutoryMarkersByDate(statutoryCalendar))
    );
  }, [source, statutoryCalendar, userId]);

  const dayView = useMemo(() => {
    if (!source || sourceUserRef.current !== userId) {
      return { dateKey: selectedDateKey, sections: [], totalCount: 0, isEmpty: true };
    }
    const statutoryDay = statutoryCalendar?.calendarByDate[selectedDateKey] ?? [];
    return buildCalendarDayView(source, selectedDateKey, t, statutoryDay);
  }, [source, selectedDateKey, t, statutoryCalendar, userId]);

  const visiblePinGroups = sourceUserRef.current === userId ? pinGroups : [];
  const mapClusters = useMemo(
    () => buildMapLocationClusters(sourceUserRef.current === userId ? mapMarkers : []),
    [mapMarkers, userId]
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
    pinGroups: visiblePinGroups,
  };
}
