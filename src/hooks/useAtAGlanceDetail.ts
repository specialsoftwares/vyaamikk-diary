import { useCallback, useEffect, useMemo, useState } from "react";

import { useT } from "@/i18n";
import {
  buildAtAGlanceView,
  loadAtAGlanceSourceData,
  type AtAGlanceCustomRange,
  type AtAGlanceSourceData,
  type AtAGlanceViewKind,
  type AtAGlanceViewModel,
  type AtAGlanceWeekRangeFilter,
} from "@/services/dashboard";
import { toAppError, userFacingMessage } from "@/domain/errors";

export function useAtAGlanceDetail(
  userId: string | null,
  view: AtAGlanceViewKind,
  customWeekRange?: AtAGlanceCustomRange | null
) {
  const t = useT();
  const [source, setSource] = useState<AtAGlanceSourceData | null>(null);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setSource(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await loadAtAGlanceSourceData(userId);
      setSource(data);
    } catch (e) {
      setError(userFacingMessage(toAppError(e)));
      setSource(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const model: AtAGlanceViewModel = useMemo(() => {
    if (!source) {
      return { view, sections: [], totalItems: 0, isEmpty: true };
    }
    const weekFilter: AtAGlanceWeekRangeFilter | undefined =
      view === "this_week" && customWeekRange
        ? {
            startMs: customWeekRange.startMs,
            endExclusiveMs: customWeekRange.endExclusiveMs,
          }
        : undefined;
    return buildAtAGlanceView(view, source, t, Date.now(), weekFilter);
  }, [source, view, t, customWeekRange]);

  return { model, loading, error, reload: load };
}
