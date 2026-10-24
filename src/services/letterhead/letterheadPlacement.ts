/**
 * Two letterhead placements.
 * Header/logo places an already cropped header image across the top of a
 * white A4 page. The crop itself is chosen before save.
 * Complete letterhead fits the whole image on A4 with contain (no stretch).
 */

import { A4_ASPECT_RATIO, A4_HEIGHT_IN, A4_WIDTH_IN } from "./letterheadLayoutConfig";
import type { LetterheadMargins } from "./types";

export type LetterheadPlacement = "header_logo" | "complete_page";

const HEADER_BAND_MIN_PCT = 12;
const HEADER_BAND_MAX_PCT = 42;

export function suggestLetterheadPlacement(
  width: number,
  height: number
): LetterheadPlacement {
  if (!(width > 0) || !(height > 0)) return "header_logo";
  const aspect = width / height;
  if (aspect > 1.05) return "header_logo";
  const deviation = Math.abs(aspect - A4_ASPECT_RATIO) / A4_ASPECT_RATIO;
  if (deviation > 0.12) return "header_logo";
  return "complete_page";
}

/** Height of a width-fitted header image as a percentage of the A4 page. Capped. */
export function headerBandHeightPct(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return HEADER_BAND_MIN_PCT;
  const fitted = ((A4_WIDTH_IN / (width / height)) / A4_HEIGHT_IN) * 100;
  return Math.min(HEADER_BAND_MAX_PCT, Math.max(HEADER_BAND_MIN_PCT, fitted));
}

/** Same band, in millimetres, for the production PDF image box. */
export function headerImageHeightMm(width: number, height: number): number {
  const inches = (headerBandHeightPct(width, height) / 100) * A4_HEIGHT_IN;
  return Math.round(inches * 25.4 * 10) / 10;
}

export function writingMarginsForHeader(width: number, height: number): LetterheadMargins {
  const band = headerBandHeightPct(width, height);
  return {
    topPct: Math.min(70, Math.round((band + 3) * 10) / 10),
    bottomPct: 8,
    leftPct: 12,
    rightPct: 12,
  };
}
