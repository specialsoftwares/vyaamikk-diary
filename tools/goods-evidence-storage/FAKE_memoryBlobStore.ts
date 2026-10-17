/**
 * FAKE_ in-memory blob store for G2 unit tests.
 * Labelled fake — not wired as production Storage.
 */
import { HASH_CHUNK_BYTES } from "../../src/goodsEvidence/evidence";
import type { G2BlobPutResult, G2BlobRead, G2BlobStat, G2BlobStore } from "./types";

type Stored = {
  bytes: Uint8Array;
  generation: string;
  contentType: string;
};

function copyBytes(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.byteLength);
  out.set(bytes);
  return out;
}

async function* chunkBytes(bytes: Uint8Array): AsyncGenerator<Uint8Array> {
  if (bytes.byteLength === 0) {
    yield bytes;
    return;
  }
  for (let i = 0; i < bytes.byteLength; i += HASH_CHUNK_BYTES) {
    yield bytes.subarray(i, Math.min(i + HASH_CHUNK_BYTES, bytes.byteLength));
  }
}

export class FAKE_MemoryBlobStore implements G2BlobStore {
  readonly objects = new Map<string, Stored>();
  nextGeneration = 1;

  async putIfAbsent(path: string, bytes: Uint8Array, contentType: string): Promise<G2BlobPutResult> {
    const existing = this.objects.get(path);
    if (existing) return { ok: false, code: "already_exists" };
    const generation = String(this.nextGeneration++);
    this.objects.set(path, { bytes: copyBytes(bytes), generation, contentType });
    return { ok: true, generation, byteSize: bytes.byteLength, contentType };
  }

  async stat(path: string): Promise<G2BlobStat | null> {
    const stored = this.objects.get(path);
    if (!stored) return null;
    return { generation: stored.generation, byteSize: stored.bytes.byteLength, contentType: stored.contentType };
  }

  async open(path: string, generation?: string | null): Promise<G2BlobRead | null> {
    const stored = this.objects.get(path);
    if (!stored) return null;
    if (generation && stored.generation !== generation) return null;
    const bytes = stored.bytes;
    return {
      generation: stored.generation,
      byteSize: bytes.byteLength,
      contentType: stored.contentType,
      chunks: chunkBytes(bytes),
    };
  }

  /** Test-only: simulate an administrator overwrite that changes generation. */
  FAKE_forceOverwrite(path: string, bytes: Uint8Array, contentType: string): string {
    const generation = String(this.nextGeneration++);
    this.objects.set(path, { bytes: copyBytes(bytes), generation, contentType });
    return generation;
  }

  /** Test-only: simulate a missing blob after a lost upload/finalize. */
  FAKE_deleteObject(path: string): void {
    this.objects.delete(path);
  }
}
