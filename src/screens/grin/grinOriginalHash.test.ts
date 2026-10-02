/**
 * PURE: production chunk hasher must match independent SHA-256.
 * SQLITE_HOST tests that inject node crypto do not prove this path.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { HASH_CHUNK_BYTES, hashBoundedChunks } from "@/goodsEvidence/evidence";
import { createGrinSha256ChunkHasher } from "./grinOriginalHash";

async function main(): Promise<void> {
  const cases: Array<[string, Uint8Array]> = [
    ["empty", new Uint8Array()],
    ["abc", new Uint8Array([97, 98, 99])],
    ["pdf-prefix", new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a])],
    ["gt64", new Uint8Array(HASH_CHUNK_BYTES + 17).map((_, i) => i & 0xff)],
  ];
  for (const [label, bytes] of cases) {
    const node = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
    const hasher = createGrinSha256ChunkHasher();
    if (bytes.byteLength) hasher.update(bytes);
    assert.equal(hasher.digestHex(), node, `${label} digestHex`);
    async function* chunks() {
      if (bytes.byteLength) yield bytes;
    }
    const bounded = await hashBoundedChunks(chunks(), createGrinSha256ChunkHasher(), HASH_CHUNK_BYTES);
    assert.equal(bounded.sha256, node, `${label} hashBoundedChunks`);
    assert.equal(bounded.byteSize, bytes.byteLength);
  }
  console.log("grinOriginalHash.test.ts: ok");
}

void main();
