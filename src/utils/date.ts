import { format, formatDistanceToNow, startOfDay } from "date-fns";

export function formatEntryDate(ms: number): string {
  return format(ms, "EEE, d MMM yyyy");
}

export function formatShortDate(ms: number): string {
  return format(ms, "d MMM yyyy");
}

export function formatRelative(ms: number): string {
  return formatDistanceToNow(ms, { addSuffix: true });
}

export function todayStartMs(): number {
  return startOfDay(new Date()).getTime();
}

/**
 * Canonical local business calendar date (`YYYY-MM-DD`) from an epoch ms.
 * Uses the device local timezone — never UTC `toISOString().slice(0, 10)`,
 * which can shift the intended diary/calendar day near midnight.
 */
export function dayKey(ms: number): string {
  return format(ms, "yyyy-MM-dd");
}

/** Alias for call sites that want an explicit local-business-date name. */
export function localBusinessDateKey(ms: number): string {
  return dayKey(ms);
}

/** Today's local business date key. */
export function todayLocalBusinessDateKey(now = Date.now()): string {
  return dayKey(now);
}
