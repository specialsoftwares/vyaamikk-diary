/**
 * Pure contain geometry for imported letterhead preview frames.
 * scale = min(frameW/imgW, frameH/imgH); top-aligned; horizontally centred.
 */

import { LETTERHEAD_A4_ASPECT } from "./letterheadVisualSpec";

export type ImportedContainLayout = {
  width: number;
  height: number;
  top: number;
  left: number;
  scale: number;
};

/**
 * Fit image into frame without stretching or overflowing.
 * Unknown dimensions fall back to A4 aspect against the frame.
 */
export function computeImportedContainLayout(input: {
  frameWidth: number;
  frameHeight: number;
  imageWidth?: number | null;
  imageHeight?: number | null;
}): ImportedContainLayout {
  const fw = Math.max(0, input.frameWidth);
  const fh = Math.max(0, input.frameHeight);
  if (fw <= 0 || fh <= 0) {
    return { width: 0, height: 0, top: 0, left: 0, scale: 0 };
  }

  let iw =
    typeof input.imageWidth === "number" && input.imageWidth > 0
      ? input.imageWidth
      : 0;
  let ih =
    typeof input.imageHeight === "number" && input.imageHeight > 0
      ? input.imageHeight
      : 0;

  if (iw <= 0 || ih <= 0) {
    // Unknown: treat as A4 portrait sized to a 210×297 reference.
    iw = 210;
    ih = 210 / LETTERHEAD_A4_ASPECT;
  }

  const scale = Math.min(fw / iw, fh / ih);
  const width = iw * scale;
  const height = ih * scale;
  return {
    width,
    height,
    top: 0,
    left: (fw - width) / 2,
    scale,
  };
}
