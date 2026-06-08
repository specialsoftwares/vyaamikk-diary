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

export function dayKey(ms: number): string {
  return format(ms, "yyyy-MM-dd");
}
