/**
 * Optional customer photo capture for Customer Credit records.
 *
 * This is NOT KYC / face verification. It is a plain, consent-based photo a shop
 * owner may attach to identify a customer in their own records. Photos are:
 *   - device-local only (stored under the app document directory, user-scoped);
 *   - never synced to the cloud, never shared across users, never analysed.
 *
 * Capture downscales aggressively (quality + crop) so the stored file stays
 * small enough to embed in a generated PDF.
 */

import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";

import type { CustomerPhotoRef } from "@/domain/customerCredit";
import { createLogger } from "@/utils/logger";

const log = createLogger("customerCredit/photo");

/** Keep the stored photo light enough to embed cleanly in a PDF. */
export const MAX_CUSTOMER_PHOTO_BYTES = 320_000;

export type CustomerPhotoSource = "camera" | "library";

export interface PickedCustomerPhoto {
  uri: string;
  base64: string;
  mimeType: string;
  width: number;
  height: number;
  approxBytes: number;
}

export class CustomerPhotoError extends Error {
  constructor(public readonly code: "permission" | "too_large" | "read_failed") {
    super(code);
    this.name = "CustomerPhotoError";
  }
}

function inferMime(asset: ImagePicker.ImagePickerAsset): string {
  if (asset.mimeType) return asset.mimeType;
  const name = asset.fileName?.toLowerCase() ?? "";
  if (name.endsWith(".png")) return "image/png";
  return "image/jpeg";
}

function toPicked(asset: ImagePicker.ImagePickerAsset): PickedCustomerPhoto {
  if (!asset.base64) throw new CustomerPhotoError("read_failed");
  const approxBytes = Math.ceil((asset.base64.length * 3) / 4);
  if (approxBytes > MAX_CUSTOMER_PHOTO_BYTES) {
    throw new CustomerPhotoError("too_large");
  }
  return {
    uri: asset.uri,
    base64: asset.base64,
    mimeType: inferMime(asset),
    width: asset.width ?? 0,
    height: asset.height ?? 0,
    approxBytes,
  };
}

/** Capture or pick a customer photo. Returns null when the user cancels. */
export async function pickCustomerPhoto(
  source: CustomerPhotoSource
): Promise<PickedCustomerPhoto | null> {
  if (source === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new CustomerPhotoError("permission");
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.5,
      base64: true,
      exif: false,
      cameraType: ImagePicker.CameraType.back,
    });
    if (result.canceled || !result.assets?.[0]) return null;
    return toPicked(result.assets[0]);
  }

  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new CustomerPhotoError("permission");
  const pending = await ImagePicker.getPendingResultAsync();
  if (pending && "assets" in pending && pending.assets?.[0]) {
    return toPicked(pending.assets[0]);
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [3, 4],
    quality: 0.5,
    base64: true,
    exif: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return toPicked(result.assets[0]);
}

function photosDir(uid: string): string {
  return `${FileSystem.documentDirectory ?? ""}customer-photos/${uid}`;
}
function photoPath(uid: string, recordId: string, ext: string): string {
  return `${photosDir(uid)}/${recordId}.${ext}`;
}
function extFromMime(mime: string): string {
  return mime.includes("png") ? "png" : "jpg";
}

async function ensureDir(uid: string): Promise<void> {
  const dir = photosDir(uid);
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
}

async function deleteIfExists(uri: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (e) {
    log.warn("delete photo", e);
  }
}

/** Persist a picked photo to a stable device-local file keyed by record id. */
export async function persistCustomerPhoto(
  uid: string,
  recordId: string,
  picked: PickedCustomerPhoto
): Promise<CustomerPhotoRef> {
  await ensureDir(uid);
  const ext = extFromMime(picked.mimeType);
  const dest = photoPath(uid, recordId, ext);
  await deleteIfExists(dest);
  await FileSystem.writeAsStringAsync(dest, picked.base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return {
    localUri: dest,
    mimeType: picked.mimeType,
    updatedAt: Date.now(),
    width: picked.width || null,
    height: picked.height || null,
  };
}

/** Read a photo as a data URI for PDF embedding; null if missing/unreadable. */
export async function readCustomerPhotoDataUri(
  ref: CustomerPhotoRef | null | undefined
): Promise<string | null> {
  if (!ref?.localUri) return null;
  try {
    const info = await FileSystem.getInfoAsync(ref.localUri);
    if (!info.exists) return null;
    const base64 = await FileSystem.readAsStringAsync(ref.localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (!base64) return null;
    return `data:${ref.mimeType};base64,${base64}`;
  } catch (e) {
    log.warn("read photo", e);
    return null;
  }
}

export async function removeCustomerPhotoFile(
  ref: CustomerPhotoRef | null | undefined
): Promise<void> {
  if (ref?.localUri) await deleteIfExists(ref.localUri);
}

/** Remove every customer photo for a user (account deletion). */
export async function removeAllCustomerPhotos(uid: string): Promise<void> {
  await deleteIfExists(photosDir(uid));
}
