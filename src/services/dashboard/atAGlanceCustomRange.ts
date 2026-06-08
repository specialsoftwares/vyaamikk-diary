import { startOfDay } from "date-fns";

import {
  formatCalendarDayMs,
  formatRollingWeekRange,
  type DateDisplayLang,
} from "@/utils/date/rollingWeekRange";

const ONE_DAY = 86_400_000;
/** Max custom span to keep list builds responsive. */
export const AT_A_GLANCE_CUSTOM_RANGE_MAX_DAYS = 366;

export interface AtAGlanceCustomRange {
  /** Start of first day (inclusive). */
  startMs: number;
  /** Start of last day (inclusive display). */
  endMs: number;
  /** Start of day after last day (exclusive upper bound for filters). */
  endExclusiveMs: number;
}

export type AtAGlanceCustomRangeError =
  | "missing"
  | "invalid_order"
  | "future_end"
  | "too_long";

export function normalizeAtAGlanceCustomRange(
  startInputMs: number,
  endInputMs: number
): AtAGlanceCustomRange {
  const startMs = startOfDay(new Date(startInputMs)).getTime();
  const endMs = startOfDay(new Date(endInputMs)).getTime();
  return {
    startMs,
    endMs,
    endExclusiveMs: endMs + ONE_DAY,
  };
}

export function validateAtAGlanceCustomRange(
  startInputMs: number | null,
  endInputMs: number | null,
  now = Date.now()
): AtAGlanceCustomRangeError | null {
  if (
    startInputMs == null ||
    endInputMs == null ||
    !Number.isFinite(startInputMs) ||
    !Number.isFinite(endInputMs)
  ) {
    return "missing";
  }
  const range = normalizeAtAGlanceCustomRange(startInputMs, endInputMs);
  if (range.startMs > range.endMs) return "invalid_order";
  const todayStart = startOfDay(new Date(now)).getTime();
  if (range.endMs > todayStart) return "future_end";
  const spanDays = (range.endExclusiveMs - range.startMs) / ONE_DAY;
  if (spanDays > AT_A_GLANCE_CUSTOM_RANGE_MAX_DAYS) return "too_long";
  return null;
}

export function getAtAGlancePeriodDisplayForRange(
  range: AtAGlanceCustomRange,
  lang: DateDisplayLang
) {
  const compact = formatRollingWeekRange(range.startMs, range.endMs, lang);
  return {
    rangeCompact: compact,
    startDate: formatCalendarDayMs(range.startMs, lang),
    endDate: formatCalendarDayMs(range.endMs, lang),
    showRangePill: true,
  };
}
