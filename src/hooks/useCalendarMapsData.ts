import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { toAppError, userFacingMessage } from "@/domain/errors";
import { useT } from "@/i18n";
import {
  buildCalendarDayView,
  buildMarkedDatesForMonth,
  loadCalendarMapsSourceData,
  mergeStatutoryCalendarMarkers,
  type CalendarMapsSourceData,
} from "@/services/calendarMaps";
import { buildStatutoryTabViewModel, statutoryMarkersByDate } from "@/services/statutory";

export function useCalendarMapsData(userId: string | null, selectedDateKey: string) {
  const t = useT();
  const [source, setSource] = useState<CalendarMapsSourceData | null>(null);
  const [loading, setLoading] = useState(Boolean(userId));
  const [refreshing, setRefreshing] = useState(false);
  const [statutoryCalendar, setStatutoryCalendar] = useState<
    import("@/services/statutory").StatutoryTabViewModel | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedOnceRef = useRef(false);
  const loadGenRef = useRef(0);
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

  return {
    source,
    loading,
    refreshing,
    error,
    reload,
    refresh,
    marked,
    dayView,
  };
}
