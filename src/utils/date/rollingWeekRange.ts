import { format } from "date-fns";
import { enIN } from "date-fns/locale";

export type DateDisplayLang = "en" | "hi" | "ta" | "te" | "gu";

/** Data dates always use en-IN — UI language is ignored. */
function localeFor(_lang?: DateDisplayLang) {
  return enIN;
}

/**
 * Compact range for rolling “this week” (inclusive start/end calendar days).
 * Examples: `1 Jun – 7 Jun 2026`, `30 May – 5 Jun 2026`, `30 Dec 2025 – 5 Jan 2026`.
 */
export function formatRollingWeekRange(
  weekStartMs: number,
  weekEndMs: number,
  lang: DateDisplayLang = "en"
): string {
  const loc = localeFor(lang);
  const start = new Date(weekStartMs);
  const end = new Date(weekEndMs);
  const sameDay =
    format(start, "yyyy-MM-dd") === format(end, "yyyy-MM-dd");
  if (sameDay) {
    return format(end, "d MMM yyyy", { locale: loc });
  }
  const sameYear = format(start, "yyyy") === format(end, "yyyy");
  const sameMonth = sameYear && format(start, "MMM") === format(end, "MMM");
  if (sameMonth) {
    return `${format(start, "d MMM", { locale: loc })} – ${format(end, "d MMM yyyy", { locale: loc })}`;
  }
  if (sameYear) {
    return `${format(start, "d MMM", { locale: loc })} – ${format(end, "d MMM yyyy", { locale: loc })}`;
  }
  return `${format(start, "d MMM yyyy", { locale: loc })} – ${format(end, "d MMM yyyy", { locale: loc })}`;
}

/** Single calendar day for Today header (e.g. `1 Jun 2026`). */
export function formatCalendarDayMs(ms: number, lang: DateDisplayLang = "en"): string {
  return format(new Date(ms), "d MMM yyyy", { locale: localeFor(lang) });
}
