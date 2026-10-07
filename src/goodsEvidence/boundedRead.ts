/**
 * Bounded original-byte reads for hashing.
 *
 * Platform open() is injected. This module never reads a whole file, never
 * calls the Expo full-file string APIs, and never imports Expo FileSystem.
 * Production adapters (Team 4 retention, Team 1 transport) use Expo SDK 54
 * `FileHandle.readBytes` / `writeBytes` / `close` from `expo-file-system@~19.0.23`.
 * Peak JS allocation is one copied chunk (HASH_CHUNK_BYTES) plus the
 * caller's hasher state. Device OOM-free behaviour is not claimed.
 */

import { HASH_CHUNK_BYTES, MAX_PDF_ORIGINAL_BYTES } from "./evidence";

export const MAX_ORIGINAL_READ_BYTES = MAX_PDF_ORIGINAL_BYTES;
export const MIME_SNIFF_BYTES = 16;

export type GrinBoundedIoCode = "too_large" | "empty_original" | "read_interrupted" | "source_missing";

export type GrinBoundedFileHandle = {
  readBytes(length: number): Uint8Array;
  close(): void;
  /** Advisory. Never the sole admission check. */
  size?: number | null;
};

export type IterateBoundedChunksOptions = {
  chunkBytes?: number;
  maxBytes: number;
  isAborted?: () => boolean;
};

export function grinBoundedIoError(code: GrinBoundedIoCode): Error {
  const err = new Error(code);
  (err as { code?: string }).code = code;
  return err;
}

function isIoCode(value: string): value is GrinBoundedIoCode {
  return (
    value === "too_large" ||
    value === "empty_original" ||
    value === "read_interrupted" ||
    value === "source_missing"
  );
}

export function grinBoundedIoCode(err: unknown): GrinBoundedIoCode | null {
  if (!(err instanceof Error)) return null;
  if (isIoCode(err.message)) return err.message;
  const code = (err as { code?: string }).code;
  return typeof code === "string" && isIoCode(code) ? code : null;
}

/**
 * Yield HASH_CHUNK_BYTES (or remaining) slices from an opened handle.
 * Always closes the handle on success, failure, abort, and generator return.
 * handle.size is an early reject only when present and already over max.
 */
export async function* iterateBoundedChunks(
  open: () => GrinBoundedFileHandle,
  options: IterateBoundedChunksOptions
): AsyncGenerator<Uint8Array, void, void> {
  const chunkBytes = options.chunkBytes && options.chunkBytes > 0 ? options.chunkBytes : HASH_CHUNK_BYTES;
  const maxBytes = options.maxBytes;
  if (!Number.isInteger(maxBytes) || maxBytes < 1) {
    throw grinBoundedIoError("too_large");
  }
  const handle = open();
  let closed = false;
  const closeOnce = () => {
    if (closed) return;
    closed = true;
    try {
      handle.close();
    } catch {
      // Handle must not leak even if close throws.
    }
  };
  try {
    if (options.isAborted?.()) throw grinBoundedIoError("read_interrupted");
    const advertised = handle.size;
    if (typeof advertised === "number" && Number.isInteger(advertised) && advertised > maxBytes) {
      throw grinBoundedIoError("too_large");
    }
    let total = 0;
    for (;;) {
      if (options.isAborted?.()) throw grinBoundedIoError("read_interrupted");
      const chunk = handle.readBytes(chunkBytes);
      if (!chunk || chunk.byteLength === 0) break;
      if (chunk.byteLength > chunkBytes) throw grinBoundedIoError("too_large");
      total += chunk.byteLength;
      if (total > maxBytes) throw grinBoundedIoError("too_large");
      const copy = new Uint8Array(chunk.byteLength);
      copy.set(chunk);
      yield copy;
    }
    if (total < 1) throw grinBoundedIoError("empty_original");
  } finally {
    closeOnce();
  }
}

/** Wrap any chunk iterable with a running byte ceiling. Does not replace production FileHandle reads. */
export async function* limitChunks(
  chunks: AsyncIterable<Uint8Array>,
  options: { maxBytes: number; isAborted?: () => boolean }
): AsyncGenerator<Uint8Array, void, void> {
  let total = 0;
  for await (const chunk of chunks) {
    if (options.isAborted?.()) throw grinBoundedIoError("read_interrupted");
    total += chunk.byteLength;
    if (total > options.maxBytes) throw grinBoundedIoError("too_large");
    yield chunk;
  }
  if (total < 1) throw grinBoundedIoError("empty_original");
}

export function readPrefixFromHandle(open: () => GrinBoundedFileHandle, length: number = MIME_SNIFF_BYTES): Uint8Array {
  const handle = open();
  try {
    const prefix = handle.readBytes(length);
    return prefix && prefix.byteLength > 0 ? prefix : new Uint8Array(0);
  } finally {
    try {
      handle.close();
    } catch {
      // Prefix reads must still close.
    }
  }
}
