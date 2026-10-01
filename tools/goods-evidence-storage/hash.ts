import { createHash } from "node:crypto";

import type { ChunkHasher } from "../../src/goodsEvidence/evidence";

/** Node SHA-256 chunk hasher. Not @/utils/sha256Hex. Does not buffer the whole file. */
export function nodeChunkHasher(): ChunkHasher {
  const hash = createHash("sha256");
  return {
    update(chunk: Uint8Array) {
      hash.update(chunk);
    },
    digestHex() {
      return hash.digest("hex");
    },
  };
}

export function sha256Utf8(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
