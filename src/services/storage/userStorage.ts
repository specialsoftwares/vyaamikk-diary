/**
 * Per-user Firebase Storage helpers (firebase/storage JS SDK for reads/delete;
 * uploads via media REST + Expo FileSystem — see userStorageUpload.ts).
 *
 * React Native note (RN ≥ 0.74 / firebase 12.14.0):
 * - `uploadString` and multipart `FbsBlob.getBlob` build ArrayBufferView Blobs
 *   that RN BlobManager rejects.
 * - Expo `File` is not a runtime Blob; its `slice` also hits that path.
 * Uploads therefore use authenticated `FileSystem.uploadAsync` (BINARY_CONTENT)
 * and verify remote size. Same uid-scoped paths and Storage Rules as before.
 */

import * as FileSystem from "expo-file-system/legacy";
import { deleteObject, getDownloadURL, ref } from "firebase/storage";

import { env, isFirebaseConfigured } from "@/config/env";
import { FirebaseNotConfiguredError, getFirebaseStorage } from "@/config/firebase";
import { createLogger } from "@/utils/logger";

import type { SyncSessionToken } from "@/sync/syncSessionOwnership";

import { uploadLocalFileViaMediaApi } from "./userStorageUpload";

const log = createLogger("storage/user");

const MAX_FILE_NAME_LEN = 128;

export type UserStorageCategory = "letterhead" | "attachments" | "pdfs";

export interface StorageUploadResult {
  storagePath: string;
  downloadUrl?: string;
  localBytes?: number;
  remoteBytes?: number;
}

export function isUserStorageAvailable(): boolean {
  return isFirebaseConfigured() && Boolean(env.firebase.storageBucket);
}

export function getUserStoragePath(
  userId: string,
  category: "letterhead",
  fileName: string
): string;
export function getUserStoragePath(
  userId: string,
  category: "attachments" | "pdfs",
  recordId: string,
  fileName: string
): string;
export function getUserStoragePath(
  userId: string,
  category: UserStorageCategory,
  recordIdOrFileName: string,
  fileName?: string
): string {
  const safeUserId = userId.trim();
  if (category === "letterhead") {
    return `users/${safeUserId}/letterhead/${sanitizeStorageFileName(recordIdOrFileName)}`;
  }
  const recordId = recordIdOrFileName.trim();
  const name = sanitizeStorageFileName(fileName ?? "attachment");
  return `users/${safeUserId}/${category}/${recordId}/${name}`;
}

export function sanitizeStorageFileName(raw: string): string {
  const trimmed = raw.trim().replace(/[/\\]+/g, "-");
  const cleaned = trimmed
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = cleaned || "file";
  if (base.length <= MAX_FILE_NAME_LEN) return base;
  const dot = base.lastIndexOf(".");
  if (dot > 0 && dot < base.length - 1) {
    const ext = base.slice(dot);
    const stemMax = Math.max(1, MAX_FILE_NAME_LEN - ext.length);
    return `${base.slice(0, stemMax)}${ext}`;
  }
  return base.slice(0, MAX_FILE_NAME_LEN);
}

export function inferContentType(fileName: string, fallback = "application/octet-stream"): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return fallback;
}

function storageRefForPath(storagePath: string) {
  return ref(getFirebaseStorage(), storagePath);
}

function parseDataUri(dataUri: string): { mime: string; base64: string } | null {
  const trimmed = dataUri.trim();
  const match = /^data:([^;]+);base64,(.+)$/i.exec(trimmed);
  if (!match) return null;
  return { mime: match[1], base64: match[2] };
}

function extFromMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("pdf")) return "pdf";
  return "bin";
}

function isLocalFileUri(uri: string): boolean {
  const t = uri.trim();
  return (
    t.startsWith("file://") ||
    t.startsWith("content://") ||
    t.startsWith("/") ||
    t.startsWith("file:")
  );
}

async function deleteTempQuietly(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // best-effort cleanup
  }
}

export type StorageUploadSession = {
  userId: string;
  session?: SyncSessionToken | null;
};

/**
 * Upload an on-disk file via authenticated media REST + Expo uploadAsync.
 * Never passes Expo File / Uint8Array into Firebase JS Blob constructors.
 */
export async function uploadLocalFileToPath(
  storagePath: string,
  localUri: string,
  contentType: string,
  ownership?: StorageUploadSession
): Promise<StorageUploadResult> {
  if (!isUserStorageAvailable()) throw new FirebaseNotConfiguredError();
  const verified = await uploadLocalFileViaMediaApi({
    storagePath,
    localUri,
    contentType,
    userId: ownership?.userId,
    session: ownership?.session,
  });
  return {
    storagePath: verified.storagePath,
    downloadUrl: verified.downloadUrl,
    localBytes: verified.localBytes,
    remoteBytes: verified.remoteBytes,
  };
}

async function uploadBase64ToPath(
  storagePath: string,
  base64: string,
  contentType: string,
  ownership?: StorageUploadSession
): Promise<StorageUploadResult> {
  const cacheRoot = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "";
  if (!cacheRoot) {
    throw new Error("No writable cache directory for Storage upload.");
  }
  const ext = extFromMime(contentType);
  const tmp = `${cacheRoot}storage-upload-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${ext}`;

  await FileSystem.writeAsStringAsync(tmp, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  try {
    return await uploadLocalFileToPath(storagePath, tmp, contentType, ownership);
  } finally {
    await deleteTempQuietly(tmp);
  }
}

/**
 * Upload a letterhead template from a data URI or a local file URI.
 */
export async function uploadLetterheadImage(
  userId: string,
  imageUri: string,
  fileName?: string,
  session?: SyncSessionToken | null
): Promise<StorageUploadResult> {
  if (!isUserStorageAvailable()) throw new FirebaseNotConfiguredError();
  const trimmed = imageUri.trim();
  if (!trimmed) {
    throw new Error("Letterhead image URI is empty.");
  }
  const ownership: StorageUploadSession = { userId, session };

  const parsed = parseDataUri(trimmed);
  if (parsed) {
    const ext = extFromMime(parsed.mime);
    const safeName = sanitizeStorageFileName(
      fileName ?? `letterhead-${Date.now()}.${ext}`
    );
    const storagePath = getUserStoragePath(userId, "letterhead", safeName);
    return uploadBase64ToPath(storagePath, parsed.base64, parsed.mime, ownership);
  }

  if (isLocalFileUri(trimmed)) {
    const mime = inferContentType(fileName ?? trimmed, "image/jpeg");
    const ext = extFromMime(mime);
    const safeName = sanitizeStorageFileName(
      fileName ?? `letterhead-${Date.now()}.${ext}`
    );
    const storagePath = getUserStoragePath(userId, "letterhead", safeName);
    return uploadLocalFileToPath(storagePath, trimmed, mime, ownership);
  }

  throw new Error("Letterhead image must be a local file URI or base64 data URI.");
}

export async function uploadRecordAttachment(
  userId: string,
  recordId: string,
  dataUri: string,
  fileName?: string,
  session?: SyncSessionToken | null
): Promise<StorageUploadResult> {
  if (!isUserStorageAvailable()) throw new FirebaseNotConfiguredError();
  const parsed = parseDataUri(dataUri);
  if (!parsed) {
    throw new Error("Attachment must be a base64 data URI.");
  }
  const ext = extFromMime(parsed.mime);
  const safeName = sanitizeStorageFileName(
    fileName ?? `attachment-${Date.now()}.${ext}`
  );
  const storagePath = getUserStoragePath(userId, "attachments", recordId, safeName);
  return uploadBase64ToPath(storagePath, parsed.base64, parsed.mime, {
    userId,
    session,
  });
}

export async function uploadRecordAttachmentBase64(
  userId: string,
  recordId: string,
  base64: string,
  contentType: string,
  fileName?: string,
  session?: SyncSessionToken | null
): Promise<StorageUploadResult> {
  if (!isUserStorageAvailable()) throw new FirebaseNotConfiguredError();
  const ext = extFromMime(contentType);
  const safeName = sanitizeStorageFileName(
    fileName ?? `attachment-${Date.now()}.${ext}`
  );
  const storagePath = getUserStoragePath(userId, "attachments", recordId, safeName);
  return uploadBase64ToPath(storagePath, base64, contentType, { userId, session });
}

export async function getDownloadUrlForPath(storagePath: string): Promise<string | null> {
  if (!isUserStorageAvailable()) return null;
  try {
    return await getDownloadURL(storageRefForPath(storagePath));
  } catch (e) {
    log.warn("getDownloadUrlForPath", e);
    return null;
  }
}

export async function deleteUserStorageObject(storagePath: string): Promise<void> {
  if (!isUserStorageAvailable()) return;
  try {
    await deleteObject(storageRefForPath(storagePath));
  } catch (e) {
    log.warn("deleteUserStorageObject", e);
  }
}
