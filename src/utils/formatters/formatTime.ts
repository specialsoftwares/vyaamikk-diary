import { format } from "date-fns";
import { enIN } from "date-fns/locale";

import { DATA_FORMAT_LOCALE } from "./constants";

const EN_IN_DATE_LOCALE = enIN;

/** Time only (e.g. 3:45 PM). Always en-IN / Western numerals. */
export function formatTime(ms: number): string {
  return format(ms, "h:mm a", { locale: EN_IN_DATE_LOCALE });
}

/** Date + time compact (e.g. 4 Jun, 3:45 PM). */
export function formatDateTimeCompact(ms: number): string {
  return format(ms, "d MMM, h:mm a", { locale: EN_IN_DATE_LOCALE });
}

/** Intl time — fixed en-IN. */
export function formatIntlTime(
  ms: number,
  options: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" }
): string {
  return new Intl.DateTimeFormat(DATA_FORMAT_LOCALE, options).format(new Date(ms));
}
