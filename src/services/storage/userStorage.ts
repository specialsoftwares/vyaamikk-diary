/**
 * Per-user Firebase Storage helpers (firebase/storage JS SDK).
 *
 * Canonical remote reference is `storagePath`; `downloadUrl` is an optional
 * client-side cache and may be refreshed via `getDownloadUrlForPath`.
 */

import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadString,
  type UploadMetadata,
} from "firebase/storage";

import { env, isFirebaseConfigured } from "@/config/env";
import { FirebaseNotConfiguredError, getFirebaseStorage } from "@/config/firebase";
import { createLogger } from "@/utils/logger";

const log = createLogger("storage/user");

const MAX_FILE_NAME_LEN = 128;

export type UserStorageCategory = "letterhead" | "attachments" | "pdfs";

export interface StorageUploadResult {
  storagePath: string;
  downloadUrl?: string;
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

async function uploadBase64ToPath(
  storagePath: string,
  base64: string,
  contentType: string
): Promise<StorageUploadResult> {
  const metadata: UploadMetadata = { contentType };
  await uploadString(storageRefForPath(storagePath), base64, "base64", metadata);
  let downloadUrl: string | undefined;
  try {
    downloadUrl = await getDownloadURL(storageRefForPath(storagePath));
  } catch (e) {
    log.warn("getDownloadURL after upload", e);
  }
  return { storagePath, downloadUrl };
}

export async function uploadLetterheadImage(
  userId: string,
  dataUri: string,
  fileName?: string
): Promise<StorageUploadResult> {
  if (!isUserStorageAvailable()) throw new FirebaseNotConfiguredError();
  const parsed = parseDataUri(dataUri);
  if (!parsed) {
    throw new Error("Letterhead image must be a base64 data URI.");
  }
  const ext = extFromMime(parsed.mime);
  const safeName = sanitizeStorageFileName(
    fileName ?? `letterhead-${Date.now()}.${ext}`
  );
  const storagePath = getUserStoragePath(userId, "letterhead", safeName);
  return uploadBase64ToPath(storagePath, parsed.base64, parsed.mime);
}

export async function uploadRecordAttachment(
  userId: string,
  recordId: string,
  dataUri: string,
  fileName?: string
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
  return uploadBase64ToPath(storagePath, parsed.base64, parsed.mime);
}

export async function uploadRecordAttachmentBase64(
  userId: string,
  recordId: string,
  base64: string,
  contentType: string,
  fileName?: string
): Promise<StorageUploadResult> {
  if (!isUserStorageAvailable()) throw new FirebaseNotConfiguredError();
  const ext = extFromMime(contentType);
  const safeName = sanitizeStorageFileName(
    fileName ?? `attachment-${Date.now()}.${ext}`
  );
  const storagePath = getUserStoragePath(userId, "attachments", recordId, safeName);
  return uploadBase64ToPath(storagePath, base64, contentType);
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
