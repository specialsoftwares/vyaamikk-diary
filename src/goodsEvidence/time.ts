import { IST_UTC_OFFSET_MS } from "./constants";

/**
 * Financial year for GRIN issuance is derived from server registration time
 * in Asia/Kolkata. Reported physical arrival stays on a separate field and
 * must not drive the issued number or FY token.
 */

export function istCivilDate(utcMillis: number): { year: number; month: number; day: number } {
  if (!Number.isFinite(utcMillis)) {
    throw new Error("goodsEvidence: utcMillis must be finite");
  }
  const shifted = new Date(utcMillis + IST_UTC_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/** Indian FY start year (April–March) for a UTC instant interpreted in IST. */
export function financialYearStartForIstInstant(utcMillis: number): number {
  const { year, month } = istCivilDate(utcMillis);
  return month >= 4 ? year : year - 1;
}

/** Token used in GRIN/{series}/{FY}/{serial} — e.g. FY2026-27. */
export function financialYearTokenForIstInstant(utcMillis: number): string {
  const start = financialYearStartForIstInstant(utcMillis);
  const endTwo = String(start + 1).slice(-2);
  return `FY${start}-${endTwo}`;
}

/** RFC 3339 UTC with milliseconds. Used inside hashes. */
export function formatUtcIso(utcMillis: number): string {
  if (!Number.isFinite(utcMillis)) {
    throw new Error("goodsEvidence: utcMillis must be finite");
  }
  return new Date(utcMillis).toISOString();
}
