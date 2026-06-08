import { format } from "date-fns";

export type GreetingPeriod = "morning" | "afternoon" | "evening";

/** Local device hour → greeting period. */
export function getGreetingPeriod(date = new Date()): GreetingPeriod {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  return "evening";
}

export function greetingPeriodFallbackKey(period: GreetingPeriod): string {
  return `you.greeting${period.charAt(0).toUpperCase()}${period.slice(1)}Fallback`;
}

export function greetingI18nKey(period: GreetingPeriod): string {
  return `you.greeting${period.charAt(0).toUpperCase()}${period.slice(1)}`;
}

/** Polished last-active line, e.g. `31 May 2026, 10:42 PM`. */
/** Polished timestamp line, e.g. `31 May 2026, 10:42 PM`. */
export function formatDisplayTimestamp(
  ms: number,
  _locale: "en-IN" | "hi-IN" = "en-IN"
): string {
  return format(ms, "d MMM yyyy, h:mm a", { locale: undefined });
}

/** @deprecated Use `formatDisplayTimestamp`. */
export const formatLastActiveTimestamp = formatDisplayTimestamp;
