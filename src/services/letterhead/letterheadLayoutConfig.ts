/**
 * Letterhead A4 layout configuration.
 *
 * The writable area (where the user's matter is printed) is stored on the
 * `LetterheadConfig` as percentages of the A4 page so it scales with any
 * template image. This module is the single source of truth for converting
 * those percentages to print-safe inch margins for the PDF `@page` box and
 * for the safe defaults a new letterhead starts with.
 *
 * No Vyaamikk branding lives here — this is pure geometry.
 */

import type { LetterheadMargins } from "./types";

/** A4 portrait dimensions in inches. */
export const A4_WIDTH_IN = 8.2677;
export const A4_HEIGHT_IN = 11.6929;
/** A4 portrait aspect ratio (width / height ≈ 0.7071). */
export const A4_ASPECT_RATIO = A4_WIDTH_IN / A4_HEIGHT_IN;

/**
 * Print-safe inch defaults requested for V1:
 *   • body starts 2–2.5in from the top (clears most printed headers/logos)
 *   • 1–1.5in bottom safety strip (clears footer bands)
 *   • 1in left/right side margins
 */
export const DEFAULT_LAYOUT_INCHES = {
  top: 2.25,
  bottom: 1.25,
  left: 1,
  right: 1,
} as const;

/** Signature/stamp image bounds inside the writable area (in points). */
export const SIGNATURE_MAX_WIDTH_PT = 180;
export const SIGNATURE_MAX_HEIGHT_PT = 70;
export const STAMP_MAX_WIDTH_PT = 130;
export const STAMP_MAX_HEIGHT_PT = 130;

/** Keep at least a 20% writable strip on each axis. */
function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 80) return 80;
  return value;
}

export interface LetterheadInchMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Convert stored percentage margins into print inch margins for `@page`. */
export function marginsToInches(margins: LetterheadMargins): LetterheadInchMargins {
  return {
    top: round2((clampPct(margins.topPct) / 100) * A4_HEIGHT_IN),
    bottom: round2((clampPct(margins.bottomPct) / 100) * A4_HEIGHT_IN),
    left: round2((clampPct(margins.leftPct) / 100) * A4_WIDTH_IN),
    right: round2((clampPct(margins.rightPct) / 100) * A4_WIDTH_IN),
  };
}

/** Convert inch margins into the percentage margins persisted on the config. */
export function inchesToMargins(inches: LetterheadInchMargins): LetterheadMargins {
  return {
    topPct: Math.round((inches.top / A4_HEIGHT_IN) * 100),
    bottomPct: Math.round((inches.bottom / A4_HEIGHT_IN) * 100),
    leftPct: Math.round((inches.left / A4_WIDTH_IN) * 100),
    rightPct: Math.round((inches.right / A4_WIDTH_IN) * 100),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
