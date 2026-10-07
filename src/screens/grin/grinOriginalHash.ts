/**
 * Incremental SHA-256 for retained GRIN originals (hashBoundedChunks).
 * Does not log hashes. Not a Node crypto import in the production graph.
 * Constants are FIPS 180-4.
 */

import type { ChunkHasher } from "@/goodsEvidence/evidence";

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function u32(n: number): number {
  return n >>> 0;
}

function rotr(x: number, n: number): number {
  return u32((x >>> n) | (x << (32 - n)));
}

function compress(block: Uint8Array, h: Uint32Array): void {
  const w = new Uint32Array(64);
  const view = new DataView(block.buffer, block.byteOffset, 64);
  for (let t = 0; t < 16; t += 1) {
    w[t] = view.getUint32(t * 4, false);
  }
  for (let t = 16; t < 64; t += 1) {
    const s0 = u32(rotr(w[t - 15]!, 7) ^ rotr(w[t - 15]!, 18) ^ (w[t - 15]! >>> 3));
    const s1 = u32(rotr(w[t - 2]!, 17) ^ rotr(w[t - 2]!, 19) ^ (w[t - 2]! >>> 10));
    w[t] = u32(w[t - 16]! + s0 + w[t - 7]! + s1);
  }
  let a = h[0]!;
  let b = h[1]!;
  let c = h[2]!;
  let d = h[3]!;
  let e = h[4]!;
  let f = h[5]!;
  let g = h[6]!;
  let hh = h[7]!;
  for (let t = 0; t < 64; t += 1) {
    const S1 = u32(rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25));
    const ch = u32((e & f) ^ (~e & g));
    const t1 = u32(hh + S1 + ch + K[t]! + w[t]!);
    const S0 = u32(rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22));
    const maj = u32((a & b) ^ (a & c) ^ (b & c));
    const t2 = u32(S0 + maj);
    hh = g;
    g = f;
    f = e;
    e = u32(d + t1);
    d = c;
    c = b;
    b = a;
    a = u32(t1 + t2);
  }
  h[0] = u32(h[0]! + a);
  h[1] = u32(h[1]! + b);
  h[2] = u32(h[2]! + c);
  h[3] = u32(h[3]! + d);
  h[4] = u32(h[4]! + e);
  h[5] = u32(h[5]! + f);
  h[6] = u32(h[6]! + g);
  h[7] = u32(h[7]! + hh);
}

export function createGrinSha256ChunkHasher(): ChunkHasher {
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const leftover = new Uint8Array(64);
  let leftoverLen = 0;
  let bytes = 0;

  return {
    update(chunk: Uint8Array): void {
      bytes += chunk.byteLength;
      let offset = 0;
      if (leftoverLen > 0) {
        const take = Math.min(64 - leftoverLen, chunk.byteLength);
        leftover.set(chunk.subarray(0, take), leftoverLen);
        leftoverLen += take;
        offset = take;
        if (leftoverLen === 64) {
          compress(leftover, h);
          leftoverLen = 0;
        }
      }
      while (offset + 64 <= chunk.byteLength) {
        compress(chunk.subarray(offset, offset + 64), h);
        offset += 64;
      }
      if (offset < chunk.byteLength) {
        leftover.set(chunk.subarray(offset), leftoverLen);
        leftoverLen += chunk.byteLength - offset;
      }
    },
    digestHex(): string {
      const bitLenHi = Math.floor((bytes * 8) / 0x100000000) >>> 0;
      const bitLenLo = (bytes * 8) >>> 0;
      const pad = leftoverLen < 56 ? 56 - leftoverLen : 120 - leftoverLen;
      const tail = new Uint8Array(leftoverLen + pad + 8);
      tail.set(leftover.subarray(0, leftoverLen), 0);
      tail[leftoverLen] = 0x80;
      const view = new DataView(tail.buffer);
      view.setUint32(tail.byteLength - 8, bitLenHi, false);
      view.setUint32(tail.byteLength - 4, bitLenLo, false);
      for (let i = 0; i < tail.byteLength; i += 64) {
        compress(tail.subarray(i, i + 64), h);
      }
      leftoverLen = 0;
      return Array.from(h)
        .map((n) => u32(n).toString(16).padStart(8, "0"))
        .join("");
    },
  };
}
