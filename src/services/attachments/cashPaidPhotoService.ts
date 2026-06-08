/**
 * Optional receipt / proof photo for Cash Paid records.
 * Device-local, user-scoped, compressed — never synced as raw camera originals.
 */

import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";

import type { AttachmentRef } from "@/domain/businessEntry";
import { createLogger } from "@/utils/logger";

const log = createLogger("cashPaid/photo");

export const MAX_CASH_PAID_PHOTO_BYTES = 320_000;
export const CASH_PAID_ATTACHMENT_ID = "cash_paid_receipt";

export type CashPaidPhotoSource = "camera" | "library";

export interface PickedCashPaidPhoto {
  uri: string;
  base64: string;
  mimeType: string;
  approxBytes: number;
}

export class CashPaidPhotoError extends Error {
  constructor(public readonly code: "permission" | "too_large" | "read_failed") {
    super(code);
    this.name = "CashPaidPhotoError";
  }
}

function inferMime(asset: ImagePicker.ImagePickerAsset): string {
  if (asset.mimeType) return asset.mimeType;
  const name = asset.fileName?.toLowerCase() ?? "";
  if (name.endsWith(".png")) return "image/png";
  return "image/jpeg";
}

function toPicked(asset: ImagePicker.ImagePickerAsset): PickedCashPaidPhoto {
  if (!asset.base64) throw new CashPaidPhotoError("read_failed");
  const approxBytes = Math.ceil((asset.base64.length * 3) / 4);
  if (approxBytes > MAX_CASH_PAID_PHOTO_BYTES) {
    throw new CashPaidPhotoError("too_large");
  }
  return {
    uri: asset.uri,
    base64: asset.base64,
    mimeType: inferMime(asset),
    approxBytes,
  };
}

export async function pickCashPaidPhoto(
  source: CashPaidPhotoSource
): Promise<PickedCashPaidPhoto | null> {
  const pickerOpts = {
    mediaTypes: ["images"] as ImagePicker.MediaType[],
    allowsEditing: true,
    aspect: [4, 3] as [number, number],
    quality: 0.5,
    base64: true,
    exif: false,
  };

  if (source === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new CashPaidPhotoError("permission");
    const result = await ImagePicker.launchCameraAsync({
      ...pickerOpts,
      cameraType: ImagePicker.CameraType.back,
    });
    if (result.canceled || !result.assets?.[0]) return null;
    return toPicked(result.assets[0]);
  }

  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new CashPaidPhotoError("permission");
  const result = await ImagePicker.launchImageLibraryAsync(pickerOpts);
  if (result.canceled || !result.assets?.[0]) return null;
  return toPicked(result.assets[0]);
}

function photosDir(uid: string): string {
  return `${FileSystem.documentDirectory ?? ""}cash-paid-photos/${uid}`;
}

function photoPath(uid: string, entryId: string, ext: string): string {
  return `${photosDir(uid)}/${entryId}.${ext}`;
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

export async function persistCashPaidPhoto(
  uid: string,
  entryId: string,
  picked: PickedCashPaidPhoto
): Promise<AttachmentRef> {
  await ensureDir(uid);
  const ext = extFromMime(picked.mimeType);
  const dest = photoPath(uid, entryId, ext);
  await deleteIfExists(dest);
  await FileSystem.writeAsStringAsync(dest, picked.base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return {
    id: CASH_PAID_ATTACHMENT_ID,
    uri: dest,
    mimeType: picked.mimeType,
    name: null,
  };
}

export async function removeCashPaidPhotoFile(
  attachments: AttachmentRef[] | null | undefined
): Promise<void> {
  const ref = attachments?.find((a) => a.id === CASH_PAID_ATTACHMENT_ID);
  if (ref?.uri) await deleteIfExists(ref.uri);
}

export function cashPaidPhotoAttachment(
  attachments: AttachmentRef[] | null | undefined
): AttachmentRef | null {
  return attachments?.find((a) => a.id === CASH_PAID_ATTACHMENT_ID) ?? null;
}
