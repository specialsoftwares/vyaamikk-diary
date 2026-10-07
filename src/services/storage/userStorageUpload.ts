/**
 * Authenticated Firebase Storage upload that never constructs RN Blobs.
 *
 * Evidence (firebase@12.14.0 / @firebase/storage@0.14.3 / expo-file-system@19.0.23):
 * - Expo `File` TypeScript-`implements Blob` but is NOT `instanceof Blob`.
 * - `FbsBlob` only accepts native Blob | ArrayBuffer | Uint8Array; Expo File
 *   yields size 0 and undefined payload.
 * - Expo `File.slice` does `new Blob([bytesSync().slice(...)])` → RN ≥ 0.74
 *   rejects ArrayBufferView parts with the owner-reported error string.
 * - `uploadBytesResumable` uses multipart for size ≤ 256 KiB, which calls
 *   `FbsBlob.getBlob(string, data, string)` → `new Blob([…, Uint8Array, …])`.
 * - Resumable chunks send Uint8Array via XHR without that Blob constructor,
 *   but Expo File never reaches a valid size, so the resumable branch is unused.
 *
 * Supported path (no new native dependency): Expo legacy `uploadAsync` POSTs
 * the on-disk file as BINARY_CONTENT to the Firebase Storage media upload
 * REST endpoint with the signed-in user's ID token. Same project, uid-scoped
 * paths, Storage Rules, and (when present) App Check header as the JS SDK.
 * Size is verified via `getMetadata().size` against the local byte length.
 */

import * as FileSystem from "expo-file-system/legacy";
import { getDownloadURL, getMetadata, ref } from "firebase/storage";

import { env } from "@/config/env";
import { getFirebaseAuth, getFirebaseStorage } from "@/config/firebase";
import { createLogger } from "@/utils/logger";

const log = createLogger("storage/userUpload");

/** Firebase JS SDK multipart/resumable switch threshold (bytes). */
export const FIREBASE_STORAGE_MULTIPART_THRESHOLD_BYTES = 256 * 1024;

export type VerifiedStorageUpload = {
  storagePath: string;
  downloadUrl?: string;
  /** Local file size in bytes before upload. */
  localBytes: number;
  /** Remote object size from getMetadata after upload. */
  remoteBytes: number;
};

function storageBucketName(): string {
  const raw = (env.firebase.storageBucket ?? "").trim();
  if (!raw) throw new Error("Firebase Storage bucket is not configured.");
  // Accept "bucket.appspot.com" or gs://bucket forms.
  return raw.replace(/^gs:\/\//, "").replace(/\/$/, "");
}

function mediaUploadUrl(storagePath: string): string {
  const bucket = encodeURIComponent(storageBucketName());
  const name = encodeURIComponent(storagePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?name=${name}&uploadType=media`;
}

async function authHeaders(contentType: string): Promise<Record<string, string>> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("Not signed in for Storage upload.");
  const idToken = await user.getIdToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${idToken}`,
    "Content-Type": contentType,
  };
  // Best-effort App Check (native). JS App Check is not initialized in this app.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const appCheckMod = require("@react-native-firebase/app-check") as {
      default: () => { getToken?: (force?: boolean) => Promise<{ token: string }> };
    };
    const inst = appCheckMod.default();
    if (typeof inst.getToken === "function") {
      const { token } = await inst.getToken(false);
      if (token) headers["X-Firebase-AppCheck"] = token;
    }
  } catch {
    // Unenforced / unavailable — same posture as JS Storage without App Check.
  }
  return headers;
}

async function localFileBytes(localUri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(localUri);
  if (!info.exists || !("size" in info) || typeof info.size !== "number") {
    throw new Error("Local file missing or size unknown for Storage upload.");
  }
  if (info.size <= 0) throw new Error("Local file is empty.");
  return info.size;
}

/**
 * Upload an on-disk file without Firebase JS Blob construction.
 * Verifies remote size matches local bytes (not merely task completion).
 */
export async function uploadLocalFileViaMediaApi(input: {
  storagePath: string;
  localUri: string;
  contentType: string;
}): Promise<VerifiedStorageUpload> {
  const localBytes = await localFileBytes(input.localUri);
  const headers = await authHeaders(input.contentType);
  const url = mediaUploadUrl(input.storagePath);

  const result = await FileSystem.uploadAsync(url, input.localUri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers,
  });

  if (result.status < 200 || result.status >= 300) {
    log.warn("media upload HTTP status", { status: result.status });
    throw new Error(`Storage upload failed (HTTP ${result.status}).`);
  }

  const objectRef = ref(getFirebaseStorage(), input.storagePath);
  const meta = await getMetadata(objectRef);
  const remoteBytes = typeof meta.size === "number" ? meta.size : -1;
  if (remoteBytes !== localBytes) {
    throw new Error(
      `Storage size mismatch: local ${localBytes} bytes, remote ${remoteBytes} bytes.`
    );
  }

  let downloadUrl: string | undefined;
  try {
    downloadUrl = await getDownloadURL(objectRef);
  } catch (e) {
    log.warn("getDownloadURL after media upload", e);
  }

  return {
    storagePath: input.storagePath,
    downloadUrl,
    localBytes,
    remoteBytes,
  };
}

/** Pure helpers for injected tests (no network). */
export function wouldUseMultipartInJsSdk(byteLength: number): boolean {
  return byteLength <= FIREBASE_STORAGE_MULTIPART_THRESHOLD_BYTES;
}

export function assertExpoFileIsNotNativeBlob(sample: {
  instanceofBlob: boolean;
}): void {
  if (sample.instanceofBlob) {
    throw new Error("Unexpected: Expo File reported as instanceof Blob");
  }
}
