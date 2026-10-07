/**
 * Letterhead asset picker (signature + stamp).
 *
 * Picks a small PNG/JPEG from the photo library. Reads bytes via FileSystem
 * (not ImagePicker `base64: true`) so Hermes never builds ArrayBuffer-backed
 * Blobs during selection. Assets remain inline data URIs on LetterheadConfig
 * (small enough for Firestore headroom).
 */

import * as FileSystem from "expo-file-system/legacy";
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

async function toPickedAsset(
  asset: ImagePicker.ImagePickerAsset
): Promise<PickedLetterheadAsset> {
  if (!asset.uri) throw new LetterheadAssetError("read_failed");

  // Bound before allocating full-file base64.
  if (typeof asset.fileSize === "number" && asset.fileSize > MAX_ASSET_BYTES) {
    throw new LetterheadAssetError("too_large");
  }
  try {
    const info = await FileSystem.getInfoAsync(asset.uri);
    if (info.exists && "size" in info && typeof info.size === "number") {
      if (info.size > MAX_ASSET_BYTES) throw new LetterheadAssetError("too_large");
    }
  } catch (e) {
    if (e instanceof LetterheadAssetError) throw e;
  }

  let base64 = asset.base64 ?? null;
  if (!base64) {
    try {
      base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } catch {
      throw new LetterheadAssetError("read_failed");
    }
  }
  if (!base64) throw new LetterheadAssetError("read_failed");

  const approxBytes = Math.ceil((base64.length * 3) / 4);
  if (approxBytes > MAX_ASSET_BYTES) {
    throw new LetterheadAssetError("too_large");
  }
  return {
    dataUri: `data:${inferMime(asset)};base64,${base64}`,
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
  const pending = await ImagePicker.getPendingResultAsync();
  if (pending && "assets" in pending && pending.assets?.[0]) {
    return toPickedAsset(pending.assets[0]);
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    quality: Platform.OS === "ios" ? 0.7 : 0.6,
    // Avoid ImagePicker-owned base64 bridge on large photos; read via FS.
    base64: false,
    exif: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return toPickedAsset(result.assets[0]);
}
