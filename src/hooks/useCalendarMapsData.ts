import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addMonths, endOfMonth, startOfMonth } from "date-fns";

import { toAppError, userFacingMessage } from "@/domain/errors";
import { useT } from "@/i18n";
import {
  buildCalendarDayView,
  buildMarkedDatesForMonth,
  loadCalendarMapsSourceData,
  mergeStatutoryCalendarMarkers,
  type CalendarMapsSourceData,
} from "@/services/calendarMaps";
import { buildStatutoryCalendarView, statutoryMarkersByDate } from "@/services/statutory";
import {
  currentDomainRevision,
  subscribeDomainChanges,
} from "@/services/dataChanges/domainChanges";

export function useCalendarMapsData(
  userId: string | null,
  selectedDateKey: string,
  visibleMonthKey: string = selectedDateKey
) {
  const t = useT();
  const [source, setSource] = useState<CalendarMapsSourceData | null>(null);
  const [loading, setLoading] = useState(Boolean(userId));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedOnceRef = useRef(false);
  const loadGenRef = useRef(0);
  const inFlightRef = useRef(false);
  const dirtyRef = useRef(false);
  const reloadRef = useRef<(mode: "mount" | "refresh") => Promise<void>>(async () => undefined);
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
      inFlightRef.current = true;
      const revisionAtStart = currentDomainRevision();
      try {
        const businessResult = await loadCalendarMapsSourceData(owner);
        if (generation !== loadGenRef.current || userIdRef.current !== owner) return;
        hasLoadedOnceRef.current = true;
        sourceUserRef.current = owner;
        setSource(businessResult.data);
        setError(
          businessResult.failedSources.length > 0 ? "Some records unavailable" : null
        );
        if (currentDomainRevision() !== revisionAtStart) dirtyRef.current = true;
      } catch (e) {
        if (generation !== loadGenRef.current || userIdRef.current !== owner) return;
        setError(userFacingMessage(toAppError(e)));
      } finally {
        inFlightRef.current = false;
        if (generation === loadGenRef.current) {
          setLoading(false);
          setRefreshing(false);
          if (dirtyRef.current && userIdRef.current === owner) {
            dirtyRef.current = false;
            void reloadRef.current("refresh");
          }
        }
      }
    },
    [userId]
  );

  reloadRef.current = reload;

  const refresh = useCallback(() => reload("refresh"), [reload]);

  useEffect(() => {
    void reload("mount");
  }, [reload]);

  useEffect(() => {
    if (!userId) return;
    return subscribeDomainChanges((change) => {
      if (change.ownerUid !== userId) return;
      if (inFlightRef.current) {
        dirtyRef.current = true;
        return;
      }
      void reloadRef.current("refresh");
    });
  }, [reload, userId]);

  const statutoryCalendar = useMemo(() => {
    const [year, month] = visibleMonthKey.split("-").map((part) => Number(part));
    const anchor =
      Number.isFinite(year) && Number.isFinite(month)
        ? new Date(year, month - 1, 1, 12)
        : new Date();
    return buildStatutoryCalendarView(t, anchor, {
      minMs: startOfMonth(addMonths(anchor, -1)).getTime(),
      maxMs: endOfMonth(addMonths(anchor, 1)).getTime(),
    });
  }, [t, visibleMonthKey]);

  const marked = useMemo(() => {
    if (!source || sourceUserRef.current !== userId) return {};
    const base = buildMarkedDatesForMonth(source);
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
