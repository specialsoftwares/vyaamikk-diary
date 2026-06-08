/**
 * Letterhead asset picker (signature + stamp).
 *
 * Picks a small PNG/JPEG from the photo library and returns it as a base64
 * data URI so it round-trips through AsyncStorage / Firestore the same way
 * the template image does. Assets are user-scoped — they live on the user's
 * `LetterheadConfig` and are never shared globally.
 *
 * These images are decorative overlays placed inside the writable area, so
 * they are kept deliberately small (the picker downscales aggressively).
 */

import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";

export type LetterheadAssetKind = "signature" | "stamp";

export interface PickedLetterheadAsset {
  dataUri: string;
  width: number;
  height: number;
  approxBytes: number;
}

/** Reject assets larger than this so the config doc stays well under 1 MB. */
export const MAX_ASSET_BYTES = 220_000;

export class LetterheadAssetError extends Error {
  constructor(public readonly code: "read_failed" | "too_large") {
    super(code);
    this.name = "LetterheadAssetError";
  }
}

function inferMime(asset: ImagePicker.ImagePickerAsset): string {
  if (asset.mimeType) return asset.mimeType;
  const name = asset.fileName?.toLowerCase() ?? "";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return "image/png";
}

function toPickedAsset(asset: ImagePicker.ImagePickerAsset): PickedLetterheadAsset {
  if (!asset.base64) {
    throw new LetterheadAssetError("read_failed");
  }
  const approxBytes = Math.ceil((asset.base64.length * 3) / 4);
  if (approxBytes > MAX_ASSET_BYTES) {
    throw new LetterheadAssetError("too_large");
  }
  return {
    dataUri: `data:${inferMime(asset)};base64,${asset.base64}`,
    width: asset.width ?? 0,
    height: asset.height ?? 0,
    approxBytes,
  };
}

/**
 * Whether the photo-library permission is already granted. Used to keep the
 * picker on the same user gesture on iOS (see setup.tsx for the rationale).
 */
export async function hasMediaLibraryPermission(): Promise<boolean> {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  return current.granted;
}

/**
 * Launch the system photo picker for a signature/stamp asset. Returns `null`
 * when the user cancels. Throws `LetterheadAssetError` on read/size failure.
 */
export async function pickLetterheadAsset(): Promise<PickedLetterheadAsset | null> {
  // Process-death recovery (Android): a pending result may exist.
  const pending = await ImagePicker.getPendingResultAsync();
  if (pending && "assets" in pending && pending.assets?.[0]) {
    return toPickedAsset(pending.assets[0]);
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    quality: Platform.OS === "ios" ? 0.7 : 0.6,
    base64: true,
    exif: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return toPickedAsset(result.assets[0]);
}
