/**
 * Durable app-owned copy of a picked GRIN original.
 *
 * A picker URI is not offline retention. Copy bytes first, then hash the
 * retained file with hashBoundedChunks. SQLITE_HOST tests inject host fs.
 * Does not log filenames, bodies, or hashes.
 */

import {
  ALLOWED_ORIGINAL_MIME,
  HASH_CHUNK_BYTES,
  MAX_IMAGE_ORIGINAL_BYTES,
  MAX_PDF_ORIGINAL_BYTES,
  hashBoundedChunks,
  type AllowedOriginalMime,
  type ChunkHasher,
} from "@/goodsEvidence/evidence";

import { createGrinSha256ChunkHasher } from "./grinOriginalHash";

export type GrinCaptureProvenance =
  | "camera_capture"
  | "imported_original"
  | "os_conversion"
  | "derivative";

export type GrinOsConversion = boolean | "unknown";

export type GrinRetainedOriginal = {
  localPath: string;
  mime: AllowedOriginalMime;
  byteSize: number;
  claimedSha256: string;
  captureProvenance: GrinCaptureProvenance;
  osConversionOccurred: GrinOsConversion;
};

export type GrinOriginalRetentionFs = {
  documentDirectory: string;
  ensureDir(dir: string): Promise<void>;
  copyFile(fromPath: string, toPath: string): Promise<void>;
  writeBytes(toPath: string, bytes: Uint8Array): Promise<void>;
  deleteFile(path: string): Promise<void>;
  fileExists(path: string): Promise<boolean>;
  fileSize(path: string): Promise<number | null>;
  readChunks(path: string): AsyncIterable<Uint8Array>;
};

let injectedFs: GrinOriginalRetentionFs | null = null;
let injectedHasher: (() => ChunkHasher) | null = null;
const uncommitted = new Set<string>();
const committed = new Set<string>();

export function setGrinOriginalRetentionFsForTests(fs: GrinOriginalRetentionFs | null): void {
  injectedFs = fs;
}

export function setGrinOriginalHasherForTests(factory: (() => ChunkHasher) | null): void {
  injectedHasher = factory;
}

export function resetGrinOriginalRetentionForTests(): void {
  injectedFs = null;
  injectedHasher = null;
  uncommitted.clear();
  committed.clear();
}

function extForMime(mime: AllowedOriginalMime): string {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

export function isAllowedOriginalMime(value: unknown): value is AllowedOriginalMime {
  return typeof value === "string" && (ALLOWED_ORIGINAL_MIME as readonly string[]).includes(value);
}

export function maxOriginalBytes(mime: AllowedOriginalMime): number {
  return mime === "application/pdf" ? MAX_PDF_ORIGINAL_BYTES : MAX_IMAGE_ORIGINAL_BYTES;
}

function mintObjectKey(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  let out = "gobj_";
  for (let i = 0; i < 20; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]!;
  }
  return out;
}

function joinDir(root: string, ...parts: string[]): string {
  const trimmed = root.replace(/[/\\]+$/, "");
  return [trimmed, ...parts].join("/");
}

async function productionFs(): Promise<GrinOriginalRetentionFs> {
  const FileSystem = await import("expo-file-system/legacy");
  const documentDirectory = FileSystem.documentDirectory ?? "";
  if (!documentDirectory) throw new Error("retention_dir_unavailable");
  return {
    documentDirectory,
    async ensureDir(dir: string) {
      const info = await FileSystem.getInfoAsync(dir);
      if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    },
    async copyFile(fromPath: string, toPath: string) {
      await FileSystem.copyAsync({ from: fromPath, to: toPath });
    },
    async writeBytes(toPath: string, bytes: Uint8Array) {
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i]!);
      const base64 = btoa(binary);
      await FileSystem.writeAsStringAsync(toPath, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
    },
    async deleteFile(path: string) {
      try {
        const info = await FileSystem.getInfoAsync(path);
        if (info.exists) await FileSystem.deleteAsync(path, { idempotent: true });
      } catch {
        // Best-effort dispose of uncommitted temps.
      }
    },
    async fileExists(path: string) {
      try {
        const info = await FileSystem.getInfoAsync(path);
        return Boolean(info.exists);
      } catch {
        return false;
      }
    },
    async fileSize(path: string) {
      try {
        const info = await FileSystem.getInfoAsync(path);
        if (info.exists && "size" in info && typeof info.size === "number") return info.size;
      } catch {
        return null;
      }
      return null;
    },
    async *readChunks(path: string) {
      const raw = await FileSystem.readAsStringAsync(path, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const binary = atob(raw);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i) & 0xff;
      for (let i = 0; i < bytes.byteLength; i += HASH_CHUNK_BYTES) {
        yield bytes.subarray(i, Math.min(i + HASH_CHUNK_BYTES, bytes.byteLength));
      }
    },
  };
}

export async function resolveGrinOriginalRetentionFs(): Promise<GrinOriginalRetentionFs> {
  if (injectedFs) return injectedFs;
  return productionFs();
}

function hasher(): ChunkHasher {
  return injectedHasher ? injectedHasher() : createGrinSha256ChunkHasher();
}

export async function hashRetainedOriginal(
  fs: GrinOriginalRetentionFs,
  localPath: string
): Promise<{ sha256: string; byteSize: number }> {
  return hashBoundedChunks(fs.readChunks(localPath), hasher(), HASH_CHUNK_BYTES);
}

export async function retainPickedOriginal(input: {
  sourcePath: string;
  mime: AllowedOriginalMime;
  captureProvenance: GrinCaptureProvenance;
  osConversionOccurred: GrinOsConversion;
  ownerUid: string;
  injectedBytes?: Uint8Array | null;
}): Promise<GrinRetainedOriginal> {
  const fs = await resolveGrinOriginalRetentionFs();
  if (input.injectedBytes && input.injectedBytes.byteLength > 0) {
    // Camera/host tests may supply bytes instead of a picker URI.
  } else if (!(await fs.fileExists(input.sourcePath))) {
    throw new Error("source_missing");
  }

  const dir = joinDir(fs.documentDirectory, "grin-originals", input.ownerUid);
  await fs.ensureDir(dir);
  const dest = joinDir(dir, `${mintObjectKey()}.${extForMime(input.mime)}`);
  uncommitted.add(dest);
  try {
    if (input.injectedBytes && input.injectedBytes.byteLength > 0) {
      await fs.writeBytes(dest, input.injectedBytes);
    } else {
      await fs.copyFile(input.sourcePath, dest);
    }
    if (!(await fs.fileExists(dest))) throw new Error("source_missing");
    const hashed = await hashRetainedOriginal(fs, dest);
    if (hashed.byteSize < 1) {
      await discardUncommittedGrinOriginal(dest);
      throw new Error("empty_original");
    }
    if (hashed.byteSize > maxOriginalBytes(input.mime)) {
      await discardUncommittedGrinOriginal(dest);
      throw new Error("too_large");
    }
    return {
      localPath: dest,
      mime: input.mime,
      byteSize: hashed.byteSize,
      claimedSha256: hashed.sha256,
      captureProvenance: input.captureProvenance,
      osConversionOccurred: input.osConversionOccurred,
    };
  } catch (error) {
    await discardUncommittedGrinOriginal(dest);
    throw error;
  }
}

export function commitGrinOriginalRetention(localPath: string): void {
  uncommitted.delete(localPath);
  committed.add(localPath);
}

export async function discardUncommittedGrinOriginal(localPath: string): Promise<void> {
  if (!localPath) return;
  if (committed.has(localPath)) return;
  uncommitted.delete(localPath);
  try {
    const fs = await resolveGrinOriginalRetentionFs();
    await fs.deleteFile(localPath);
  } catch {
    // Best-effort dispose. Never delete committed/queued originals.
  }
}
