/**
 * Optional receipt / proof photo for Cash Paid records.
 * Device-local, user-scoped, bounded — never kept as base64 in React state.
 */

import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";

import type { AttachmentRef } from "@/domain/businessEntry";

import { captureCashPhotoOwner, type SessionUidReader } from "./cashPhotoOwner";
import {
  CASH_PAID_ATTACHMENT_ID,
  CashPaidPhotoError,
  type PickedCashPaidPhoto,
  cashPaidPhotoAttachment,
  isOwnerScopedPhotoUri,
} from "./cashPaidPhotoRef";
import { MAX_CASH_PAID_PHOTO_BYTES } from "./cashPaidPhotoLimits";
import { decodeBase64, inspectReceiptBytes } from "./receiptPhotoBytes";

export {
  CASH_PAID_ATTACHMENT_ID,
  CashPaidPhotoError,
  cashPaidPhotoAttachment,
  isOwnerScopedPhotoUri,
  MAX_CASH_PAID_PHOTO_BYTES,
};
export type { PickedCashPaidPhoto };

export type CashPaidPhotoSource = "camera" | "library";

function photosDir(uid: string): string {
  return `${FileSystem.documentDirectory ?? ""}cash-paid-photos/${uid}`;
}

function extForMime(mime: PickedCashPaidPhoto["mimeType"]): string {
  return mime === "image/png" ? "png" : "jpg";
}

async function ensureDir(dir: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
}

async function deleteIfExists(uri: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // Best-effort. Do not log paths or file bytes.
  }
}

async function readFileBytes(uri: string): Promise<Uint8Array> {
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return decodeBase64(b64);
}

/**
 * Copy the picker file off the interaction cache, then accept it only when
 * the bytes are a JPEG or PNG within MAX_CASH_PAID_PHOTO_BYTES.
 * Cancellation returns null. Oversized files throw too_large — they are not dropped.
 */
export async function pickCashPaidPhoto(
  source: CashPaidPhotoSource
): Promise<PickedCashPaidPhoto | null> {
  const pickerOpts = {
    mediaTypes: ["images"] as ImagePicker.MediaType[],
    allowsEditing: false,
    quality: 0.5,
    base64: false,
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
    return acceptPickedFile(result.assets[0].uri);
  }

  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new CashPaidPhotoError("permission");
  const result = await ImagePicker.launchImageLibraryAsync(pickerOpts);
  if (result.canceled || !result.assets?.[0]) return null;
  return acceptPickedFile(result.assets[0].uri);
}

async function acceptPickedFile(sourceUri: string): Promise<PickedCashPaidPhoto> {
  const root = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!root || !sourceUri) throw new CashPaidPhotoError("read_failed");
  const dir = `${root}cash-paid-working/`;
  await ensureDir(dir);
  const working = `${dir}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.img`;
  try {
    await FileSystem.copyAsync({ from: sourceUri, to: working });
    const info = await FileSystem.getInfoAsync(working);
    if (!info.exists || !("size" in info) || info.size <= 0) {
      throw new CashPaidPhotoError("read_failed");
    }
    if (info.size > MAX_CASH_PAID_PHOTO_BYTES) {
      throw new CashPaidPhotoError("too_large");
    }
    const bytes = await readFileBytes(working);
    const inspected = inspectReceiptBytes(bytes);
    if (!inspected.ok) {
      const reason =
        inspected.reason === "too_large"
          ? "too_large"
          : inspected.reason === "unsupported"
            ? "unsupported"
            : "read_failed";
      throw new CashPaidPhotoError(reason);
    }
    const ext = extForMime(inspected.mime);
    const named = working.replace(/\.img$/, `.${ext}`);
    if (named !== working) {
      await FileSystem.moveAsync({ from: working, to: named });
    }
    return {
      uri: named,
      mimeType: inspected.mime,
      byteSize: inspected.byteSize,
      contentHash: inspected.contentHash,
      width: inspected.width,
      height: inspected.height,
    };
  } catch (e) {
    await deleteIfExists(working);
    if (e instanceof CashPaidPhotoError) throw e;
    throw new CashPaidPhotoError("read_failed");
  }
}

/**
 * Write a staging file, then rename onto the owner path.
 * Does not delete the previous receipt. The caller retires that file only
 * after the new AttachmentRef is stored on the local record.
 */
export async function persistCashPaidPhoto(
  uid: string,
  entryId: string,
  picked: PickedCashPaidPhoto,
  options?: { readSessionUid?: SessionUidReader }
): Promise<AttachmentRef> {
  const owner = captureCashPhotoOwner(uid, options?.readSessionUid);
  const dir = photosDir(uid);
  await ensureDir(dir);
  owner.assertStillOwner();

  const ext = extForMime(picked.mimeType);
  const finalPath = `${dir}/${entryId}.${picked.contentHash}.${ext}`;
  const staging = `${dir}/${entryId}.${picked.contentHash}.staging-${Date.now()}.${ext}`;
  let createdFinal = false;
  try {
    await FileSystem.copyAsync({ from: picked.uri, to: staging });
    owner.assertStillOwner();
    const existing = await FileSystem.getInfoAsync(finalPath);
    if (!existing.exists) {
      await FileSystem.moveAsync({ from: staging, to: finalPath });
      createdFinal = true;
    } else {
      await deleteIfExists(staging);
    }
    owner.assertStillOwner();
  } catch (e) {
    await deleteIfExists(staging);
    if (createdFinal) await deleteIfExists(finalPath);
    if (e instanceof CashPaidPhotoError) throw e;
    throw new CashPaidPhotoError("read_failed");
  }

  const info = await FileSystem.getInfoAsync(finalPath);
  owner.assertStillOwner();
  const fileMtimeMs =
    info.exists && "modificationTime" in info && typeof info.modificationTime === "number"
      ? Math.round(info.modificationTime * 1000)
      : null;

  return {
    id: CASH_PAID_ATTACHMENT_ID,
    uri: finalPath,
    mimeType: picked.mimeType,
    name: `receipt.${ext}`,
    contentHash: picked.contentHash,
    byteSize: picked.byteSize,
    fileMtimeMs,
    revision: picked.contentHash,
  };
}

/**
 * Delete a previous receipt only when it belongs to this owner and is not
 * the file the new reference points at. Call after the new reference is durable.
 */
export async function retireOwnedCashPaidFile(
  uid: string,
  previousUri: string | null | undefined,
  nextUri: string | null | undefined,
  options?: { readSessionUid?: SessionUidReader }
): Promise<void> {
  if (!previousUri || previousUri === nextUri) return;
  const owner = captureCashPhotoOwner(uid, options?.readSessionUid);
  owner.assertStillOwner();
  if (!isOwnerScopedPhotoUri(uid, previousUri)) return;
  if (!previousUri.includes(`/cash-paid-photos/${uid}/`)) return;
  await deleteIfExists(previousUri);
}

export async function removeCashPaidPhotoFile(
  attachments: AttachmentRef[] | null | undefined,
  options?: { uid?: string; readSessionUid?: SessionUidReader }
): Promise<void> {
  const ref = cashPaidPhotoAttachment(attachments);
  if (!ref?.uri) return;
  if (options?.uid) {
    await retireOwnedCashPaidFile(options.uid, ref.uri, null, options);
    return;
  }
  await deleteIfExists(ref.uri);
}
