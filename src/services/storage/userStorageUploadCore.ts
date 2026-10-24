/**
 * Injectable Storage media-upload core (no Expo / Firebase / RN imports).
 * Production defaults live in userStorageUpload.ts.
 */

import {
  mayIssueRemoteWork,
  type SyncSessionToken,
} from "@/sync/syncSessionOwnership";

/** Firebase JS SDK multipart/resumable switch threshold (bytes). */
export const FIREBASE_STORAGE_MULTIPART_THRESHOLD_BYTES = 256 * 1024;

export type VerifiedStorageUpload = {
  storagePath: string;
  downloadUrl?: string;
  localBytes: number;
  remoteBytes: number;
};

export type MediaUploadPorts = {
  getLocalBytes: (localUri: string) => Promise<number>;
  getAuthHeaders: (contentType: string) => Promise<Record<string, string>>;
  buildUploadUrl: (storagePath: string) => string;
  uploadBinary: (input: {
    url: string;
    localUri: string;
    headers: Record<string, string>;
  }) => Promise<{ status: number; body?: string }>;
  getRemoteSize: (storagePath: string) => Promise<number>;
  getDownloadUrl: (storagePath: string) => Promise<string | undefined>;
};

export class StorageUploadOwnershipError extends Error {
  constructor() {
    super("storage_upload_session_retired");
    this.name = "StorageUploadOwnershipError";
  }
}

/**
 * Media upload URL. Emulator host wins when set so tests never hit production.
 */
export function buildMediaUploadUrl(
  storagePath: string,
  opts: { bucket: string; emulatorHost?: string | null }
): string {
  const bucket = encodeURIComponent(opts.bucket.replace(/^gs:\/\//, "").replace(/\/$/, ""));
  const name = encodeURIComponent(storagePath);
  const emulator =
    opts.emulatorHost !== undefined
      ? opts.emulatorHost
      : process.env.FIREBASE_STORAGE_EMULATOR_HOST?.trim() || null;
  if (emulator) {
    const host = emulator.replace(/^https?:\/\//, "");
    return `http://${host}/v0/b/${bucket}/o?name=${name}&uploadType=media`;
  }
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?name=${name}&uploadType=media`;
}

function assertSessionOrThrow(
  session: SyncSessionToken | null | undefined,
  userId: string | undefined
): void {
  if (session === undefined) return;
  if (!userId || !mayIssueRemoteWork(session, userId)) {
    throw new StorageUploadOwnershipError();
  }
}

/**
 * Upload an on-disk file without Firebase JS Blob construction.
 * Rechecks sync session after awaited prep and before each subsequent write.
 */
export async function uploadLocalFileViaMediaApi(input: {
  storagePath: string;
  localUri: string;
  contentType: string;
  /** Owning uid for session checks (required when session is provided). */
  userId?: string;
  session?: SyncSessionToken | null;
  ports: MediaUploadPorts;
}): Promise<VerifiedStorageUpload> {
  assertSessionOrThrow(input.session, input.userId);

  const localBytes = await input.ports.getLocalBytes(input.localUri);
  assertSessionOrThrow(input.session, input.userId);

  const headers = await input.ports.getAuthHeaders(input.contentType);
  assertSessionOrThrow(input.session, input.userId);

  const url = input.ports.buildUploadUrl(input.storagePath);
  // Hard guard: when emulator host is set, never allow production URL.
  if (
    process.env.FIREBASE_STORAGE_EMULATOR_HOST &&
    url.includes("firebasestorage.googleapis.com")
  ) {
    throw new Error("Refusing production Storage URL while emulator host is set.");
  }

  assertSessionOrThrow(input.session, input.userId);
  const result = await input.ports.uploadBinary({
    url,
    localUri: input.localUri,
    headers,
  });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Storage upload failed (HTTP ${result.status}).`);
  }

  assertSessionOrThrow(input.session, input.userId);
  const remoteBytes = await input.ports.getRemoteSize(input.storagePath);
  if (remoteBytes !== localBytes) {
    throw new Error(
      `Storage size mismatch: local ${localBytes} bytes, remote ${remoteBytes} bytes.`
    );
  }

  assertSessionOrThrow(input.session, input.userId);
  const downloadUrl = await input.ports.getDownloadUrl(input.storagePath);

  return {
    storagePath: input.storagePath,
    downloadUrl,
    localBytes,
    remoteBytes,
  };
}

export function wouldUseMultipartInJsSdk(byteLength: number): boolean {
  return byteLength <= FIREBASE_STORAGE_MULTIPART_THRESHOLD_BYTES;
}
