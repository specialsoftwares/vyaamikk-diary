import { format } from "date-fns";
import { enIN } from "date-fns/locale";

import { DATA_FORMAT_LOCALE } from "./constants";

const EN_IN_DATE_LOCALE = enIN;

/** Entry list / detail date (e.g. Mon, 4 Jun 2026). Always en-IN. */
export function formatEntryDate(ms: number): string {
  return format(ms, "EEE, d MMM yyyy", { locale: EN_IN_DATE_LOCALE });
}

/** Short date (e.g. 4 Jun 2026). Always en-IN. */
export function formatShortDate(ms: number): string {
  return format(ms, "d MMM yyyy", { locale: EN_IN_DATE_LOCALE });
}

/** ISO day key for storage keys (yyyy-MM-dd). */
export function formatDayKey(ms: number): string {
  return format(ms, "yyyy-MM-dd", { locale: EN_IN_DATE_LOCALE });
}

/** Intl date for arbitrary patterns — still fixed en-IN. */
export function formatIntlDate(
  ms: number,
  options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
  }
): string {
  return new Intl.DateTimeFormat(DATA_FORMAT_LOCALE, options).format(new Date(ms));
}
