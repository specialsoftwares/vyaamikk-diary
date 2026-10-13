/**
 * Two letterhead placements.
 * Header/logo fits the whole image across the top of a white A4 page.
 * It does not crop pixels and does not claim to detect a printed header.
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

/** Height of a width-fitted image as a percentage of the A4 page. Capped. */
export function headerBandHeightPct(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return HEADER_BAND_MIN_PCT;
  const fitted = ((A4_WIDTH_IN / (width / height)) / A4_HEIGHT_IN) * 100;
  return Math.min(HEADER_BAND_MAX_PCT, Math.max(HEADER_BAND_MIN_PCT, fitted));
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
