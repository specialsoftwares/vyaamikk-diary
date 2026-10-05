/**
 * Durable app-owned copy of a picked GRIN original.
 *
 * A picker URI is not offline retention. Copy bytes first, then hash the
 * retained file with hashBoundedChunks. SQLITE_HOST tests inject host fs.
 * Does not log filenames, bodies, or hashes.
 */

import {
  iterateBoundedChunks,
  limitChunks,
  MAX_ORIGINAL_READ_BYTES,
  type GrinBoundedFileHandle,
} from "@/goodsEvidence/boundedRead";
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
  copyFile(fromPath: string, toPath: string, maxBytes: number): Promise<void>;
  writeBytes(toPath: string, bytes: Uint8Array): Promise<void>;
  deleteFile(path: string): Promise<void>;
  fileExists(path: string): Promise<boolean>;
  fileSize(path: string): Promise<number | null>;
  readChunks(path: string): AsyncIterable<Uint8Array>;
  openHandle?(path: string): GrinBoundedFileHandle;
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
  const { File, Directory, Paths } = await import("expo-file-system");
  const documentDirectory = Paths.document.uri;
  if (!documentDirectory) throw new Error("retention_dir_unavailable");

  function openHandle(path: string): GrinBoundedFileHandle {
    const file = new File(path);
    if (!file.exists) throw new Error("source_missing");
    return file.open();
  }

  return {
    documentDirectory,
    openHandle,
    async ensureDir(dir: string) {
      const directory = new Directory(dir);
      if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
    },
    async copyFile(fromPath: string, toPath: string, maxBytes: number) {
      const dest = new File(toPath);
      if (dest.exists) dest.delete();
      dest.create();
      const destHandle = dest.open();
      let destClosed = false;
      const closeDest = () => {
        if (destClosed) return;
        destClosed = true;
        try {
          destHandle.close();
        } catch {
          // Handle must not leak even if close throws.
        }
      };
      try {
        for await (const chunk of iterateBoundedChunks(() => openHandle(fromPath), { maxBytes })) {
          destHandle.writeBytes(chunk);
        }
        closeDest();
      } catch (error) {
        closeDest();
        try {
          if (dest.exists) dest.delete();
        } catch {
          // uncommitted dest only
        }
        throw error;
      }
    },
    async writeBytes(toPath: string, bytes: Uint8Array) {
      const dest = new File(toPath);
      if (!dest.exists) dest.create();
      dest.write(bytes);
    },
    async deleteFile(path: string) {
      try {
        const file = new File(path);
        if (file.exists) file.delete();
      } catch {
        // Best-effort dispose of uncommitted temps.
      }
    },
    async fileExists(path: string) {
      try {
        return new File(path).exists;
      } catch {
        return false;
      }
    },
    async fileSize(path: string) {
      try {
        const file = new File(path);
        if (!file.exists) return null;
        const size = file.size;
        return typeof size === "number" && Number.isInteger(size) && size > 0 ? size : null;
      } catch {
        return null;
      }
    },
    async *readChunks(path: string) {
      yield* iterateBoundedChunks(() => openHandle(path), { maxBytes: MAX_ORIGINAL_READ_BYTES });
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
  localPath: string,
  maxBytes: number,
  isAborted?: () => boolean
): Promise<{ sha256: string; byteSize: number }> {
  const chunks = fs.openHandle
    ? iterateBoundedChunks(() => {
        const handle = fs.openHandle!(localPath);
        return handle;
      }, { maxBytes, isAborted })
    : limitChunks(fs.readChunks(localPath), { maxBytes, isAborted });
  return hashBoundedChunks(chunks, hasher(), HASH_CHUNK_BYTES);
}

export async function retainPickedOriginal(input: {
  sourcePath: string;
  mime: AllowedOriginalMime;
  captureProvenance: GrinCaptureProvenance;
  osConversionOccurred: GrinOsConversion;
  ownerUid: string;
  injectedBytes?: Uint8Array | null;
  isAborted?: () => boolean;
}): Promise<GrinRetainedOriginal> {
  const fs = await resolveGrinOriginalRetentionFs();
  const maxBytes = maxOriginalBytes(input.mime);
  const abort = () => Boolean(input.isAborted?.());
  if (abort()) throw new Error("read_interrupted");

  const injected = input.injectedBytes && input.injectedBytes.byteLength > 0 ? input.injectedBytes : null;
  if (!injected && !(await fs.fileExists(input.sourcePath))) {
    throw new Error("source_missing");
  }
  if (injected && injected.byteLength > maxBytes) throw new Error("too_large");
  if (!injected) {
    const sourceSize = await fs.fileSize(input.sourcePath);
    if (sourceSize != null && sourceSize > maxBytes) throw new Error("too_large");
  }

  const dir = joinDir(fs.documentDirectory, "grin-originals", input.ownerUid);
  await fs.ensureDir(dir);
  const dest = joinDir(dir, `${mintObjectKey()}.${extForMime(input.mime)}`);
  uncommitted.add(dest);
  try {
    if (abort()) throw new Error("read_interrupted");
    if (injected) {
      await fs.writeBytes(dest, injected);
    } else {
      await fs.copyFile(input.sourcePath, dest, maxBytes);
    }
    if (!(await fs.fileExists(dest))) throw new Error("source_missing");
    if (abort()) throw new Error("read_interrupted");
    const hashed = await hashRetainedOriginal(fs, dest, maxBytes, abort);
    if (hashed.byteSize < 1) {
      await discardUncommittedGrinOriginal(dest);
      throw new Error("empty_original");
    }
    if (hashed.byteSize > maxBytes) {
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
