/**
 * File-based letterhead template candidate (picker / scanner → preview → save).
 *
 * Keeps full-resolution base64 out of React state. Preview uses a local file
 * URI; save uploads that file (or reads base64 once for mock / PDF embed).
 *
 * Ownership uses SyncSessionToken (uid + generation), not the file-name random.
 */

import * as FileSystem from "expo-file-system/legacy";
import type { ImagePickerAsset } from "expo-image-picker";
import { Image } from "react-native";

import {
  captureAdmissionToken,
  mayIssueRemoteWork,
  type SyncSessionToken,
} from "@/sync/syncSessionOwnership";
import { createLogger } from "@/utils/logger";

import {
  ownedCandidateTempUris,
  sniffImageMimeFromBase64Head,
} from "./letterheadImageMime";

export { ownedCandidateTempUris } from "./letterheadImageMime";

const log = createLogger("letterhead/candidate");

/** Compressed-byte cap before expensive processing (~4 MB). */
export const MAX_TEMPLATE_COMPRESSED_BYTES = 4 * 1024 * 1024;
/** Decoded long-edge cap — exceeded images are rejected (not silently kept). */
export const MAX_TEMPLATE_LONG_EDGE_PX = 3500;

export class LetterheadCandidateError extends Error {
  constructor(
    public readonly code:
      | "read_failed"
      | "too_large"
      | "unavailable"
      | "wrong_owner"
      | "unsupported_format"
  ) {
    super(code);
    this.name = "LetterheadCandidateError";
  }
}

export interface LetterheadCandidateImage {
  /** App-private file URI used for preview and upload. */
  localUri: string;
  mimeType: string;
  width: number;
  height: number;
  approxBytes: number;
  /** Owning Firebase uid at capture time — rechecked before commit. */
  ownerUid: string;
  /** Sync session generation captured before pick/scan. */
  sessionGeneration: number;
  /** Opaque file-generation id for unique paths; not an auth token. */
  fileGeneration: string;
}

function candidatesDir(uid: string): string {
  return `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? ""}letterhead-candidates/${uid}`;
}

function extFromMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

async function ensureDir(path: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  }
}

async function deleteQuietly(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (e) {
    log.warn("candidate cleanup", e);
  }
}

/** Sniff JPEG/PNG/WebP magic bytes from a local file (base64 head only). */
export async function sniffImageMime(localUri: string): Promise<string | null> {
  try {
    const head = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
      // Enough for RIFF....WEBP (12 bytes → ~16 base64 chars; read extra).
      length: 48,
      position: 0,
    });
    return sniffImageMimeFromBase64Head(head);
  } catch {
    return null;
  }
}

function readImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => reject(new LetterheadCandidateError("read_failed"))
    );
  });
}

export type CandidateCaptureContext = {
  session: SyncSessionToken;
};

/**
 * Capture ownership before native pick/scan. Callers must recheck after awaits.
 */
export function beginLetterheadCapture(expectedUid: string): CandidateCaptureContext {
  const session = captureAdmissionToken();
  if (!session || !mayIssueRemoteWork(session, expectedUid)) {
    throw new LetterheadCandidateError("wrong_owner");
  }
  return { session };
}

export function assertCaptureStillOwned(
  ctx: CandidateCaptureContext,
  expectedUid: string
): void {
  if (!mayIssueRemoteWork(ctx.session, expectedUid)) {
    throw new LetterheadCandidateError("wrong_owner");
  }
}

async function persistCopiedCandidate(
  ctx: CandidateCaptureContext,
  sourceUri: string,
  _hintedMime?: string | null,
  hintedSize?: { width: number; height: number } | null
): Promise<LetterheadCandidateImage> {
  assertCaptureStillOwned(ctx, ctx.session.uid);

  const dir = candidatesDir(ctx.session.uid);
  await ensureDir(dir);
  const fileGeneration = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // Stage with a neutral extension; rename after sniff.
  const staging = `${dir}/tpl-${fileGeneration}.bin`;
  let finalPath: string | null = null;

  const cleanupOwnedTemps = async () => {
    for (const uri of ownedCandidateTempUris(staging, finalPath)) {
      await deleteQuietly(uri);
    }
  };

  try {
    await FileSystem.copyAsync({ from: sourceUri, to: staging });
  } catch (e) {
    log.warn("copy candidate failed", e);
    await cleanupOwnedTemps();
    throw new LetterheadCandidateError("read_failed");
  }

  try {
    assertCaptureStillOwned(ctx, ctx.session.uid);

    // Magic bytes only — picker MIME is never an admission ticket.
    const mime = await sniffImageMime(staging);
    if (!mime) {
      await cleanupOwnedTemps();
      throw new LetterheadCandidateError("unsupported_format");
    }

    const dest = `${dir}/tpl-${fileGeneration}.${extFromMime(mime)}`;
    if (dest !== staging) {
      try {
        await FileSystem.moveAsync({ from: staging, to: dest });
        finalPath = dest;
      } catch (e) {
        log.warn("rename candidate failed", e);
        await cleanupOwnedTemps();
        throw new LetterheadCandidateError("read_failed");
      }
    } else {
      finalPath = staging;
    }

    const info = await FileSystem.getInfoAsync(finalPath);
    if (!info.exists) {
      await cleanupOwnedTemps();
      throw new LetterheadCandidateError("read_failed");
    }
    const size =
      info.exists && "size" in info && typeof info.size === "number" ? info.size : 0;
    if (size <= 0 || size > MAX_TEMPLATE_COMPRESSED_BYTES) {
      await cleanupOwnedTemps();
      throw new LetterheadCandidateError(size > MAX_TEMPLATE_COMPRESSED_BYTES ? "too_large" : "read_failed");
    }

    let width = Math.max(0, Math.round(hintedSize?.width ?? 0));
    let height = Math.max(0, Math.round(hintedSize?.height ?? 0));
    if (width <= 0 || height <= 0) {
      try {
        const measured = await readImageSize(finalPath);
        width = measured.width;
        height = measured.height;
      } catch (e) {
        await cleanupOwnedTemps();
        throw e;
      }
    }
    const longEdge = Math.max(width, height);
    if (longEdge > MAX_TEMPLATE_LONG_EDGE_PX) {
      await cleanupOwnedTemps();
      throw new LetterheadCandidateError("too_large");
    }

    assertCaptureStillOwned(ctx, ctx.session.uid);

    return {
      localUri: finalPath,
      mimeType: mime,
      width,
      height,
      approxBytes: size,
      ownerUid: ctx.session.uid,
      sessionGeneration: ctx.session.generation,
      fileGeneration,
    };
  } catch (e) {
    await cleanupOwnedTemps();
    throw e;
  }
}

/**
 * Copy a picker/scanner result into an app-private candidate file.
 * Does not read the gallery original as base64 into JS heap.
 */
export async function persistLetterheadCandidateFromAsset(
  ctx: CandidateCaptureContext,
  asset: ImagePickerAsset
): Promise<LetterheadCandidateImage> {
  if (!asset.uri) throw new LetterheadCandidateError("unavailable");
  const reported =
    typeof asset.fileSize === "number" && asset.fileSize > 0 ? asset.fileSize : 0;
  if (reported > MAX_TEMPLATE_COMPRESSED_BYTES) {
    throw new LetterheadCandidateError("too_large");
  }
  return persistCopiedCandidate(
    ctx,
    asset.uri,
    asset.mimeType,
    asset.width && asset.height
      ? { width: asset.width, height: asset.height }
      : null
  );
}

/** Persist a scanner/manual file path the same way as a picker asset. */
export async function persistLetterheadCandidateFromLocalFile(
  ctx: CandidateCaptureContext,
  localUri: string,
  opts?: { mimeType?: string; width?: number; height?: number }
): Promise<LetterheadCandidateImage> {
  return persistCopiedCandidate(
    ctx,
    localUri,
    opts?.mimeType,
    opts?.width && opts?.height ? { width: opts.width, height: opts.height } : null
  );
}

export async function retireLetterheadCandidate(
  candidate: LetterheadCandidateImage | null | undefined
): Promise<void> {
  if (!candidate?.localUri) return;
  await deleteQuietly(candidate.localUri);
}

/**
 * Assert the candidate still belongs to the live sync session before commit.
 */
export function assertCandidateOwner(
  candidate: LetterheadCandidateImage,
  uid: string | null | undefined
): void {
  if (!uid || candidate.ownerUid !== uid) {
    throw new LetterheadCandidateError("wrong_owner");
  }
  const live = captureAdmissionToken();
  if (
    !live ||
    live.uid !== candidate.ownerUid ||
    live.generation !== candidate.sessionGeneration
  ) {
    throw new LetterheadCandidateError("wrong_owner");
  }
}

/** Read once for mock save / PDF embed; prefer Storage upload from file. */
export async function readCandidateDataUri(
  candidate: LetterheadCandidateImage
): Promise<string> {
  const info = await FileSystem.getInfoAsync(candidate.localUri);
  if (!info.exists) throw new LetterheadCandidateError("unavailable");
  const base64 = await FileSystem.readAsStringAsync(candidate.localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (!base64) throw new LetterheadCandidateError("read_failed");
  return `data:${candidate.mimeType};base64,${base64}`;
}
