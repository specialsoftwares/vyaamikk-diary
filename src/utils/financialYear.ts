/**
 * Indian financial year (1 April – 31 March).
 * FY label uses start year: FY 2025-26 = 1 Apr 2025 – 31 Mar 2026.
 */

export type FinancialYearStart = number;

const MS_DAY = 86_400_000;

/** FY start year containing `date` (April–March). */
export function getFinancialYearForDate(date: Date | number): FinancialYearStart {
  const d = typeof date === "number" ? new Date(date) : date;
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
}

/** Current FY start year (device local time). */
export function getCurrentFinancialYear(): FinancialYearStart {
  return getFinancialYearForDate(new Date());
}

export interface FinancialYearRange {
  fyStartYear: FinancialYearStart;
  /** Inclusive start (1 Apr 00:00:00.000 local). */
  startMs: number;
  /** Exclusive end (1 Apr next year 00:00:00.000 local). */
  endMs: number;
}

export function getFinancialYearRange(fyStartYear: FinancialYearStart): FinancialYearRange {
  const start = new Date(fyStartYear, 3, 1, 0, 0, 0, 0);
  const end = new Date(fyStartYear + 1, 3, 1, 0, 0, 0, 0);
  return { fyStartYear, startMs: start.getTime(), endMs: end.getTime() };
}

/** e.g. 2025 → "FY 2025-26" */
export function formatFinancialYearLabel(fyStartYear: FinancialYearStart): string {
  const end = fyStartYear + 1;
  return `FY ${fyStartYear}-${String(end).slice(-2)}`;
}

export function isDateInFinancialYear(
  dateMs: number,
  fyStartYear: FinancialYearStart
): boolean {
  const { startMs, endMs } = getFinancialYearRange(fyStartYear);
  return dateMs >= startMs && dateMs < endMs;
}

/** Start of current calendar week (Monday 00:00 local). */
export function startOfWeekMs(now = Date.now()): number {
  const d = new Date(now);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Start of current calendar month (local). */
export function startOfMonthMs(now = Date.now()): number {
  const d = new Date(now);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** List FY start years that have any activity, newest first. Includes current FY. */
export function listFinancialYearsFromDates(
  datesMs: number[],
  includeCurrent = true
): FinancialYearStart[] {
  const set = new Set<FinancialYearStart>();
  for (const ms of datesMs) {
    if (Number.isFinite(ms) && ms > 0) set.add(getFinancialYearForDate(ms));
  }
  if (includeCurrent) set.add(getCurrentFinancialYear());
  return [...set].sort((a, b) => b - a);
}

/** True when FY is fully closed (today is on or after next FY start). */
export function isFinancialYearClosed(fyStartYear: FinancialYearStart, now = Date.now()): boolean {
  const { endMs } = getFinancialYearRange(fyStartYear);
  return now >= endMs;
}

/** March of FY end — recap prep window begins. */
export function isRecapPrepWindow(fyStartYear: FinancialYearStart, now = Date.now()): boolean {
  const prepStart = new Date(fyStartYear + 1, 2, 1, 0, 0, 0, 0).getTime();
  const { endMs } = getFinancialYearRange(fyStartYear);
  return now >= prepStart && now < endMs + MS_DAY * 14;
}
