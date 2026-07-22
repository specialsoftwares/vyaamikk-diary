/**
 * Profile image / business logo selection + validation for onboarding.
 */

import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";

import { AppError } from "@/domain/errors";
import type { ProfileLogoRef } from "@/domain/types";
import {
  persistProfileLogoFromPicker,
  type PickedLogoAsset,
} from "@/services/profileLogo/storage";
import {
  MAX_PROFILE_LOGO_BYTES,
  MIN_PROFILE_IMAGE_EDGE_PX,
  assertSupportedIdentityMime,
  type IdentityMediaRejectReason,
  validateIdentityMediaCandidate,
} from "@/onboarding/identityMediaValidation";

export {
  MAX_PROFILE_LOGO_BYTES,
  MIN_PROFILE_IMAGE_EDGE_PX,
  validateIdentityMediaCandidate,
  type IdentityMediaRejectReason,
} from "@/onboarding/identityMediaValidation";

export type IdentityMediaSource = "camera" | "library";

export class IdentityMediaError extends Error {
  constructor(
    public readonly reason: IdentityMediaRejectReason,
    message: string
  ) {
    super(message);
    this.name = "IdentityMediaError";
  }
}

function inferMime(asset: ImagePicker.ImagePickerAsset): string {
  if (asset.mimeType) return asset.mimeType.toLowerCase();
  const name = (asset.fileName ?? asset.uri).toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".heic") || name.endsWith(".heif")) return "image/heic";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

export async function pickIdentityMedia(
  source: IdentityMediaSource
): Promise<PickedLogoAsset & { width: number; height: number }> {
  const pickerOpts: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.85,
    base64: true,
    exif: false,
  };

  let result: ImagePicker.ImagePickerResult;
  if (source === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      throw new IdentityMediaError(
        "permission_denied",
        "Camera permission is required to take a profile photo."
      );
    }
    result = await ImagePicker.launchCameraAsync({
      ...pickerOpts,
      cameraType: ImagePicker.CameraType.front,
    });
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      throw new IdentityMediaError(
        "permission_denied",
        "Photo library permission is required to choose an image."
      );
    }
    result = await ImagePicker.launchImageLibraryAsync(pickerOpts);
  }

  if (result.canceled || !result.assets?.[0]) {
    throw new IdentityMediaError("cancelled", "Image selection cancelled.");
  }

  const asset = result.assets[0];
  const mime = inferMime(asset);
  try {
    assertSupportedIdentityMime(mime, asset.fileName);
  } catch (e) {
    const reason =
      e && typeof e === "object" && "reason" in e
        ? ((e as { reason: IdentityMediaRejectReason }).reason)
        : "unsupported_type";
    throw new IdentityMediaError(
      reason,
      reason === "heic_unreadable"
        ? "HEIC images could not be processed on this device. Please choose a JPG or PNG."
        : "Unsupported image type. Use JPG, PNG, or a readable HEIC converted to JPG/PNG."
    );
  }

  const w = asset.width ?? 0;
  const h = asset.height ?? 0;
  if (w > 0 && h > 0 && (w < MIN_PROFILE_IMAGE_EDGE_PX || h < MIN_PROFILE_IMAGE_EDGE_PX)) {
    throw new IdentityMediaError(
      "too_small",
      `Image is too small. Use at least ${MIN_PROFILE_IMAGE_EDGE_PX}×${MIN_PROFILE_IMAGE_EDGE_PX} pixels.`
    );
  }

  if (!asset.uri?.trim()) {
    throw new IdentityMediaError("empty", "Selected image reference is empty.");
  }
  if (!asset.base64) {
    throw new IdentityMediaError(
      "corrupted",
      "Could not read the selected image. Please try another file."
    );
  }
  const approxBytes = Math.ceil((asset.base64.length * 3) / 4);
  if (approxBytes > MAX_PROFILE_LOGO_BYTES) {
    throw new IdentityMediaError(
      "too_large",
      "Image is too large. Please choose a smaller image (under 500 KB)."
    );
  }

  return {
    uri: asset.uri,
    base64: asset.base64,
    mimeType: mime,
    fileName: asset.fileName ?? null,
    width: asset.width ?? 0,
    height: asset.height ?? 0,
  };
}

export async function confirmAndPersistIdentityMedia(
  uid: string,
  asset: PickedLogoAsset
): Promise<ProfileLogoRef> {
  try {
    return await persistProfileLogoFromPicker(uid, asset);
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new IdentityMediaError(
      "corrupted",
      "Could not save the image. Please retake or reselect."
    );
  }
}

export async function assertStoredIdentityMediaExists(
  ref: ProfileLogoRef | null
): Promise<boolean> {
  if (!ref?.localUri) return false;
  try {
    const info = await FileSystem.getInfoAsync(ref.localUri);
    return info.exists === true;
  } catch {
    return false;
  }
}
