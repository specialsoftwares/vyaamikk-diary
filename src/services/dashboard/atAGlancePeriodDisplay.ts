import type { AtAGlanceViewKind } from "./atAGlanceTypes";
import { getAtAGlanceBounds } from "./atAGlanceService";
import {
  formatCalendarDayMs,
  formatRollingWeekRange,
  type DateDisplayLang,
} from "@/utils/date/rollingWeekRange";

export interface AtAGlancePeriodDisplay {
  /** Compact pill line (week range or today's date). */
  rangeCompact: string | null;
  /** For i18n `recordsFrom` — start/end labels. */
  startDate: string;
  endDate: string;
  /** Whether to show calendar icon on pill. */
  showRangePill: boolean;
}

/**
 * Period copy derived from the same bounds as `atAGlanceService` filters.
 */
export function getAtAGlancePeriodDisplay(
  view: AtAGlanceViewKind,
  lang: DateDisplayLang,
  now = Date.now()
): AtAGlancePeriodDisplay {
  const b = getAtAGlanceBounds(now);

  if (view === "today") {
    const day = formatCalendarDayMs(b.todayStart, lang);
    return {
      rangeCompact: day,
      startDate: day,
      endDate: day,
      showRangePill: true,
    };
  }

  if (view === "this_week") {
    const compact = formatRollingWeekRange(b.weekStart, b.todayStart, lang);
    const startDate = formatCalendarDayMs(b.weekStart, lang);
    const endDate = formatCalendarDayMs(b.todayStart, lang);
    return {
      rangeCompact: compact,
      startDate,
      endDate,
      showRangePill: true,
    };
  }

  return {
    rangeCompact: null,
    startDate: "",
    endDate: "",
    showRangePill: false,
  };
}
