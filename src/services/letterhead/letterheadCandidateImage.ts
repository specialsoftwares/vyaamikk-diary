/**
 * File-based letterhead template candidate (picker / scanner → preview → save).
 *
 * Keeps full-resolution base64 out of React state. Preview uses a local file
 * URI; save uploads that file (or reads base64 once for mock / PDF embed).
 */

import * as FileSystem from "expo-file-system/legacy";
import type { ImagePickerAsset } from "expo-image-picker";

import { createLogger } from "@/utils/logger";

const log = createLogger("letterhead/candidate");

/** Soft compressed-byte cap before expensive processing (~4 MB). */
export const MAX_TEMPLATE_COMPRESSED_BYTES = 4 * 1024 * 1024;
/** Soft decoded-dimension cap (long edge). */
export const MAX_TEMPLATE_LONG_EDGE_PX = 3500;

export class LetterheadCandidateError extends Error {
  constructor(
    public readonly code: "read_failed" | "too_large" | "unavailable" | "wrong_owner"
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
  /** Opaque generation id; retire when replaced/cancelled. */
  generation: string;
}

function candidatesDir(uid: string): string {
  return `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? ""}letterhead-candidates/${uid}`;
}

function inferMime(asset: Pick<ImagePickerAsset, "mimeType" | "fileName" | "uri">): string {
  if (asset.mimeType) return asset.mimeType;
  const name = (asset.fileName ?? asset.uri).toLowerCase();
  if (name.endsWith(".png") || name.includes(".png")) return "image/png";
  if (name.endsWith(".webp") || name.includes(".webp")) return "image/webp";
  return "image/jpeg";
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

/**
 * Copy a picker/scanner result into an app-private candidate file.
 * Does not read the gallery original as base64 into JS heap.
 */
export async function persistLetterheadCandidateFromAsset(
  ownerUid: string,
  asset: ImagePickerAsset
): Promise<LetterheadCandidateImage> {
  if (!ownerUid.trim()) throw new LetterheadCandidateError("wrong_owner");
  if (!asset.uri) throw new LetterheadCandidateError("unavailable");

  const mime = inferMime(asset);
  const width = Math.max(0, Math.round(asset.width ?? 0));
  const height = Math.max(0, Math.round(asset.height ?? 0));
  const longEdge = Math.max(width, height);
  if (longEdge > MAX_TEMPLATE_LONG_EDGE_PX) {
    // Still persist — analyzeTemplateImage warns; PDF path may downsample later.
  }

  const reported =
    typeof asset.fileSize === "number" && asset.fileSize > 0
      ? asset.fileSize
      : asset.base64
        ? Math.ceil((asset.base64.length * 3) / 4)
        : 0;
  if (reported > MAX_TEMPLATE_COMPRESSED_BYTES) {
    throw new LetterheadCandidateError("too_large");
  }

  const dir = candidatesDir(ownerUid);
  await ensureDir(dir);
  const generation = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dest = `${dir}/tpl-${generation}.${extFromMime(mime)}`;

  try {
    await FileSystem.copyAsync({ from: asset.uri, to: dest });
  } catch (e) {
    log.warn("copy candidate failed", e);
    throw new LetterheadCandidateError("read_failed");
  }

  const info = await FileSystem.getInfoAsync(dest);
  if (!info.exists) throw new LetterheadCandidateError("read_failed");
  const size =
    info.exists && "size" in info && typeof info.size === "number" ? info.size : reported;
  if (size > MAX_TEMPLATE_COMPRESSED_BYTES) {
    await deleteQuietly(dest);
    throw new LetterheadCandidateError("too_large");
  }

  return {
    localUri: dest,
    mimeType: mime,
    width,
    height,
    approxBytes: size,
    ownerUid,
    generation,
  };
}

/** Persist a scanner/manual file path the same way as a picker asset. */
export async function persistLetterheadCandidateFromLocalFile(
  ownerUid: string,
  localUri: string,
  opts?: { mimeType?: string; width?: number; height?: number }
): Promise<LetterheadCandidateImage> {
  return persistLetterheadCandidateFromAsset(ownerUid, {
    uri: localUri,
    width: opts?.width ?? 0,
    height: opts?.height ?? 0,
    mimeType: opts?.mimeType,
    fileName: localUri,
  } as ImagePickerAsset);
}

export async function retireLetterheadCandidate(
  candidate: LetterheadCandidateImage | null | undefined
): Promise<void> {
  if (!candidate?.localUri) return;
  await deleteQuietly(candidate.localUri);
}

/**
 * Assert the candidate still belongs to the signed-in uid before commit.
 */
export function assertCandidateOwner(
  candidate: LetterheadCandidateImage,
  uid: string | null | undefined
): void {
  if (!uid || candidate.ownerUid !== uid) {
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
