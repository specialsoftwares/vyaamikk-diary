/**
 * Crop a working copy. The source file is not deleted here.
 * The saved template changes only after the editor save succeeds.
 */

import type { LetterheadCandidateImage } from "./letterheadCandidateImage";
import { headerCropPixels, type HeaderCrop } from "./letterheadHeaderCrop";
import {
  describeLetterheadSaveFailure,
  recordLetterheadSaveDiagnostic,
} from "./letterheadSaveDiagnostics";

export async function cropLetterheadWorkingCopy(
  source: LetterheadCandidateImage,
  crop: HeaderCrop
): Promise<LetterheadCandidateImage> {
  const pixel = headerCropPixels(source.width, source.height, crop);
  if (
    pixel.originX === 0 &&
    pixel.originY === 0 &&
    pixel.width === source.width &&
    pixel.height === source.height
  ) {
    recordLetterheadSaveDiagnostic("crop", "ok", "unchanged_frame");
    return source;
  }
  try {
    const manipulator = await import("expo-image-manipulator");
    const result = await manipulator.manipulateAsync(
      source.localUri,
      [{ crop: pixel }],
      { compress: 0.92, format: manipulator.SaveFormat.JPEG }
    );
    recordLetterheadSaveDiagnostic("crop", "ok", "cropped");
    return {
      ...source,
      localUri: result.uri,
      mimeType: "image/jpeg",
      width: result.width > 0 ? result.width : pixel.width,
      height: result.height > 0 ? result.height : pixel.height,
      fileGeneration: `${source.fileGeneration}-crop`,
    };
  } catch (e) {
    const code = describeLetterheadSaveFailure(e, "crop");
    recordLetterheadSaveDiagnostic("crop", "failed", code);
    throw new Error(code);
  }
}
