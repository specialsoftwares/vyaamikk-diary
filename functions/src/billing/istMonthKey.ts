/**
 * Vyaamikk Diary — IST (Asia/Kolkata) month-key derivation (Phase A).
 *
 * Monthly record quota uses IST calendar-month semantics. Firestore Security
 * Rules cannot import code, so firestore.rules re-implements EXACTLY this
 * formula (see `istMonthKey()` there):
 *
 *   rules:  request.time + duration.value(19800, 's')  → .year() / .month()
 *   here:   utcMillis   + 19_800_000                   → getUTCFullYear() / getUTCMonth()+1
 *
 * Both shift the UTC instant by +05:30 and then read UTC calendar fields,
 * which yields the IST calendar month (IST has no DST — the offset is fixed).
 *
 * Proof chain (owner spec §15):
 * - istMonthKey.unit.test.ts proves this formula deterministically at the
 *   exact 2026-09-30 23:59 IST / 2026-10-01 00:00 IST boundary instants.
 * - firestore.rules.billing.test.ts proves in the emulator that the rules
 *   expression agrees with this function at evaluation time (writes using
 *   this function's month key are allowed; adjacent months are denied).
 */

/** Fixed IST offset: +05:30 = 19,800,000 ms. IST observes no DST. */
export const IST_UTC_OFFSET_MS = 19_800_000;

/** Returns the IST calendar month of a UTC instant as "YYYY-MM". */
export function istMonthKeyForMillis(utcMillis: number): string {
  const shifted = new Date(utcMillis + IST_UTC_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  return `${year}-${month < 10 ? `0${month}` : month}`;
}
