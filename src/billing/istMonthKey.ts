/**
 * Client IST month-key helper. Mirrors `functions/src/billing/istMonthKey.ts`
 * and `firestore.rules` `istMonthKey()` exactly:
 *
 *   utcMillis + 19_800_000 → UTC calendar year/month of the shifted instant
 *
 * Client time is used only to populate `usageCurrent.monthKey`. Rules
 * `request.time` remains authoritative; a disagreeing client month is denied.
 */

export const IST_UTC_OFFSET_MS = 19_800_000;

/** Returns the IST calendar month of a UTC instant as "YYYY-MM". */
export function istMonthKeyForMillis(utcMillis: number): string {
  const shifted = new Date(utcMillis + IST_UTC_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  return `${year}-${month < 10 ? `0${month}` : month}`;
}

/** Stored month keys must be `YYYY-MM` (7 chars, hyphen at index 4). */
export function isIstMonthKeyShape(value: unknown): value is string {
  return typeof value === "string" && value.length === 7 && value.charAt(4) === "-";
}
