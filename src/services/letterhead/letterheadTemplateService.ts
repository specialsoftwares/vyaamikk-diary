/**
 * Letterhead template image analysis.
 *
 * Pure helpers (no I/O) that decide whether an uploaded image is a sensible
 * A4 letterhead base and surface a human-readable warning key when it is not.
 * The image itself is already a base64 data URI by the time it reaches here
 * (see `setup.tsx` / `letterheadAssetService`).
 */

import { A4_ASPECT_RATIO } from "./letterheadLayoutConfig";

export interface TemplateImageMeta {
  width: number;
  height: number;
  approxBytes: number;
}

export type TemplateWarningKey =
  | "letterhead.warnLandscape"
  | "letterhead.warnAspect"
  | "letterhead.warnLowRes"
  | "letterhead.warnTooLarge";

export interface TemplateAnalysis {
  /** width / height of the uploaded image. */
  aspectRatio: number;
  /** True when the image is portrait and close enough to A4 to fill cleanly. */
  fitsA4: boolean;
  /** Ordered, de-duplicated warning keys (most important first). May be empty. */
  warnings: TemplateWarningKey[];
}

/** Acceptable deviation from A4's 0.707 ratio before we warn (±8%). */
const ASPECT_TOLERANCE = 0.08;
/** Below this width an A4 print looks soft/pixelated. */
const MIN_RECOMMENDED_WIDTH = 1000;
/** Soft cap; the repositories enforce the hard Firestore size limit. */
const SOFT_MAX_BYTES = 900_000;

export function analyzeTemplateImage(meta: TemplateImageMeta): TemplateAnalysis {
  const width = Math.max(0, Math.round(meta.width));
  const height = Math.max(0, Math.round(meta.height));
  const aspectRatio = width > 0 && height > 0 ? width / height : 0;
  const warnings: TemplateWarningKey[] = [];

  const isLandscape = aspectRatio > 1;
  if (isLandscape) {
    warnings.push("letterhead.warnLandscape");
  } else if (aspectRatio > 0) {
    const deviation = Math.abs(aspectRatio - A4_ASPECT_RATIO) / A4_ASPECT_RATIO;
    if (deviation > ASPECT_TOLERANCE) {
      warnings.push("letterhead.warnAspect");
    }
  }

  if (width > 0 && width < MIN_RECOMMENDED_WIDTH) {
    warnings.push("letterhead.warnLowRes");
  }

  if (meta.approxBytes > SOFT_MAX_BYTES) {
    warnings.push("letterhead.warnTooLarge");
  }

  const fitsA4 = !isLandscape && warnings.length === 0 && aspectRatio > 0;

  return { aspectRatio, fitsA4, warnings };
}
