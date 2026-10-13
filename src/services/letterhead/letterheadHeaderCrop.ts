/**
 * Geometric header crop. The suggestion uses the photo's aspect ratio.
 * It does not inspect pixels and does not claim to find a printed header.
 */

import { headerBandHeightPct } from "./letterheadPlacement";

export type HeaderCrop = {
  /** Fraction of the source width. Header crops use the full width. */
  originX: number;
  /** Fraction of the source height, from the top. */
  originY: number;
  width: number;
  height: number;
};

export type HeaderCropPixels = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

const MIN_FRACTION = 0.08;
/** Wide enough that the whole photo is already a header strip. */
const ALREADY_HEADER_ASPECT = 2.4;
/** Width/height of the suggested top slice. */
const SUGGESTED_CROP_ASPECT = 3.2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function headerCropPixels(
  imageWidth: number,
  imageHeight: number,
  crop: HeaderCrop
): HeaderCropPixels {
  const w = Math.max(1, Math.round(imageWidth));
  const h = Math.max(1, Math.round(imageHeight));
  let originX = Math.round(clamp(crop.originX, 0, 1) * w);
  let originY = Math.round(clamp(crop.originY, 0, 1) * h);
  let width = Math.round(clamp(crop.width, 0, 1) * w);
  let height = Math.round(clamp(crop.height, 0, 1) * h);
  if (originX >= w) originX = w - 1;
  if (originY >= h) originY = h - 1;
  if (width < 1) width = 1;
  if (height < 1) height = 1;
  if (originX + width > w) width = w - originX;
  if (originY + height > h) height = h - originY;
  return {
    originX,
    originY,
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
}

function fitsHeaderBand(imageWidth: number, imageHeight: number, crop: HeaderCrop): boolean {
  const px = headerCropPixels(imageWidth, imageHeight, crop);
  return headerBandHeightPct(px.width, px.height) <= 42.05;
}

/** Shrink a too-tall slice until it fits the header band on A4. */
export function constrainHeaderCrop(
  imageWidth: number,
  imageHeight: number,
  crop: HeaderCrop
): HeaderCrop {
  let height = clamp(crop.height, MIN_FRACTION, 1);
  let originY = clamp(crop.originY, 0, 1 - height);
  let next: HeaderCrop = { originX: 0, originY, width: 1, height };
  let guard = 0;
  while (!fitsHeaderBand(imageWidth, imageHeight, next) && next.height > MIN_FRACTION && guard < 100) {
    next = {
      ...next,
      height: Math.max(MIN_FRACTION, Math.round((next.height - 0.01) * 1000) / 1000),
    };
    if (next.originY + next.height > 1) next.originY = 1 - next.height;
    guard += 1;
  }
  return next;
}

export function suggestHeaderCrop(imageWidth: number, imageHeight: number): HeaderCrop {
  if (!(imageWidth > 0) || !(imageHeight > 0)) {
    return { originX: 0, originY: 0, width: 1, height: 0.22 };
  }
  const aspect = imageWidth / imageHeight;
  if (aspect >= ALREADY_HEADER_ASPECT) {
    return { originX: 0, originY: 0, width: 1, height: 1 };
  }
  const cropPx = Math.min(imageHeight, imageWidth / SUGGESTED_CROP_ASPECT);
  const fraction = clamp(cropPx / imageHeight, 0.12, 0.42);
  return constrainHeaderCrop(imageWidth, imageHeight, {
    originX: 0,
    originY: 0,
    width: 1,
    height: fraction,
  });
}

export function adjustHeaderCrop(
  imageWidth: number,
  imageHeight: number,
  crop: HeaderCrop,
  delta: { originY?: number; height?: number }
): HeaderCrop {
  const height = clamp(crop.height + (delta.height ?? 0), MIN_FRACTION, 1);
  const originY = clamp(crop.originY + (delta.originY ?? 0), 0, 1 - height);
  return constrainHeaderCrop(imageWidth, imageHeight, {
    originX: 0,
    originY,
    width: 1,
    height,
  });
}
