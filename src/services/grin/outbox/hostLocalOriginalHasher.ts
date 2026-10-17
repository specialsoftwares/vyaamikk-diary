/**
 * SQLITE_HOST local-original chunk hasher. Node fs reads HASH_CHUNK_BYTES at a time.
 * Host reopen / host filesystem is not NATIVE_DEVICE process-death or native streaming proof.
 */

import { createHash } from "node:crypto";
import { open as fsOpen } from "node:fs/promises";

import { HASH_CHUNK_BYTES, type ChunkHasher } from "@/goodsEvidence/evidence";

import { SQLITE_HOST } from "./hostSqlite";
import type { GrinLocalOriginalHasher } from "./types";

export { HASH_CHUNK_BYTES };

export function createSqliteHostChunkHasher(): ChunkHasher {
  const hash = createHash("sha256");
  return {
    update(chunk) {
      hash.update(chunk);
    },
    digestHex() {
      return hash.digest("hex");
    },
  };
}

async function* sqliteHostFsChunks(localPath: string): AsyncGenerator<Uint8Array> {
  const fh = await fsOpen(localPath, "r");
  try {
    let position = 0;
    while (true) {
      const buf = new Uint8Array(HASH_CHUNK_BYTES);
      const { bytesRead } = await fh.read(buf, 0, HASH_CHUNK_BYTES, position);
      if (bytesRead === 0) break;
      position += bytesRead;
      yield bytesRead === buf.byteLength ? buf : buf.subarray(0, bytesRead);
    }
  } finally {
    await fh.close();
  }
}

/** Injected into GrinOutbox for SQLITE_HOST tests. Label SQLITE_HOST, not NATIVE_DEVICE. */
export function createSqliteHostLocalOriginalHasher(): GrinLocalOriginalHasher {
  return {
    executionLabel: SQLITE_HOST,
    createHasher: createSqliteHostChunkHasher,
    chunksForPath: sqliteHostFsChunks,
  };
}
