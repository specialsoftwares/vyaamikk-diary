/**
 * Incremental SHA-256 for retained GRIN originals (hashBoundedChunks).
 * Does not log hashes. Not a Node crypto import in the production graph.
 */

import type { ChunkHasher } from "@/goodsEvidence/evidence";

const K: number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19cd6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotr(n: number, x: number): number {
  return (x >>> n) | (x << (32 - n));
}

function ch(x: number, y: number, z: number): number {
  return (x & y) ^ (~x & z);
}

function maj(x: number, y: number, z: number): number {
  return (x & y) ^ (x & z) ^ (y & z);
}

function sigma0(x: number): number {
  return rotr(2, x) ^ rotr(13, x) ^ rotr(22, x);
}

function sigma1(x: number): number {
  return rotr(6, x) ^ rotr(11, x) ^ rotr(25, x);
}

function gamma0(x: number): number {
  return rotr(7, x) ^ rotr(18, x) ^ (x >>> 3);
}

function gamma1(x: number): number {
  return rotr(17, x) ^ rotr(19, x) ^ (x >>> 10);
}

function compress(block: Uint8Array, offset: number, h: Int32Array): void {
  const w = new Uint32Array(64);
  for (let t = 0; t < 16; t += 1) {
    const j = offset + t * 4;
    w[t] =
      ((block[j]! << 24) | (block[j + 1]! << 16) | (block[j + 2]! << 8) | block[j + 3]!) >>> 0;
  }
  for (let t = 16; t < 64; t += 1) {
    w[t] = (gamma1(w[t - 2]!) + w[t - 7]! + gamma0(w[t - 15]!) + w[t - 16]!) >>> 0;
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
    const t1 = (hh + sigma1(e) + ch(e, f, g) + K[t]! + w[t]!) >>> 0;
    const t2 = (sigma0(a) + maj(a, b, c)) >>> 0;
    hh = g;
    g = f;
    f = e;
    e = (d + t1) >>> 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) >>> 0;
  }
  h[0] = (h[0]! + a) >>> 0;
  h[1] = (h[1]! + b) >>> 0;
  h[2] = (h[2]! + c) >>> 0;
  h[3] = (h[3]! + d) >>> 0;
  h[4] = (h[4]! + e) >>> 0;
  h[5] = (h[5]! + f) >>> 0;
  h[6] = (h[6]! + g) >>> 0;
  h[7] = (h[7]! + hh) >>> 0;
}

export function createGrinSha256ChunkHasher(): ChunkHasher {
  const h = new Int32Array([
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
          compress(leftover, 0, h);
          leftoverLen = 0;
        }
      }
      while (offset + 64 <= chunk.byteLength) {
        compress(chunk, offset, h);
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
      const room = leftoverLen < 56 ? 56 - leftoverLen : 120 - leftoverLen;
      const tail = new Uint8Array(room + 8);
      tail[0] = 0x80;
      const view = new DataView(tail.buffer);
      view.setUint32(tail.byteLength - 8, bitLenHi, false);
      view.setUint32(tail.byteLength - 4, bitLenLo, false);
      const finalBlock = new Uint8Array(leftoverLen + tail.byteLength);
      finalBlock.set(leftover.subarray(0, leftoverLen), 0);
      finalBlock.set(tail, leftoverLen);
      for (let i = 0; i < finalBlock.byteLength; i += 64) {
        compress(finalBlock, i, h);
      }
      leftoverLen = 0;
      return Array.from(h)
        .map((n) => (n >>> 0).toString(16).padStart(8, "0"))
        .join("");
    },
  };
}
