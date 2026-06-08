import { addMonths, startOfDay, subDays } from "date-fns";

export const ONE_DAY_MS = 86_400_000;

/** Local calendar day start (epoch ms). */
export function calendarDayStartMs(date: Date = new Date()): number {
  return startOfDay(date).getTime();
}

/** Stable noon on calendar day for pickers / storage. */
export function normalizeRecordDayMs(ms: number): number {
  const d = startOfDay(new Date(ms));
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}

export function dayStartAfterMonths(fromMs: number, months: number): number {
  return calendarDayStartMs(addMonths(new Date(fromMs), months));
}

export function dayStartDaysAgo(days: number, reference: Date = new Date()): number {
  return calendarDayStartMs(subDays(reference, days));
}

export function dayStartDaysAhead(days: number, reference: Date = new Date()): number {
  return calendarDayStartMs(subDays(reference, -days));
}
