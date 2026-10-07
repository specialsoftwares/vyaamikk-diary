/**
 * Instrumented production bounded-read loop.
 *
 * Does not replace iterateBoundedChunks with a host filesystem readChunks.
 * The platform boundary is an in-memory FileHandle stand-in that records
 * requested lengths and close(). Hash equality is byte integrity, not
 * document truth. NATIVE_DEVICE peak memory is not claimed.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { HASH_CHUNK_BYTES, hashBoundedChunks } from "./evidence";
import { createGrinSha256ChunkHasher } from "../screens/grin/grinOriginalHash";
import {
  iterateBoundedChunks,
  limitChunks,
  readPrefixFromHandle,
  type GrinBoundedFileHandle,
} from "./boundedRead";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function instrumentedBytes(
  bytes: Uint8Array,
  advertisedSize: number | null = bytes.byteLength
): {
  open: () => GrinBoundedFileHandle;
  reads: number[];
  closeCount: { n: number };
} {
  const reads: number[] = [];
  const closeCount = { n: 0 };
  return {
    reads,
    closeCount,
    open: () => {
      let offset = 0;
      let closed = false;
      return {
        size: advertisedSize,
        readBytes(length: number) {
          if (closed) throw new Error("handle_closed");
          reads.push(length);
          const n = Math.max(0, Math.min(length, bytes.byteLength - offset));
          const slice = bytes.subarray(offset, offset + n);
          offset += n;
          return new Uint8Array(slice);
        },
        close() {
          closed = true;
          closeCount.n += 1;
        },
      };
    },
  };
}

async function consume(
  open: () => GrinBoundedFileHandle,
  maxBytes: number,
  isAborted?: () => boolean
): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of iterateBoundedChunks(open, { maxBytes, isAborted })) {
    parts.push(chunk);
    total += chunk.byteLength;
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const part of parts) {
    out.set(part, o);
    o += part.byteLength;
  }
  return out;
}

async function main(): Promise<void> {
  const abc = new Uint8Array([0x61, 0x62, 0x63]);
  const abcHandle = instrumentedBytes(abc);
  const hashedAbc = await hashBoundedChunks(
    iterateBoundedChunks(abcHandle.open, { maxBytes: 1024 }),
    createGrinSha256ChunkHasher(),
    HASH_CHUNK_BYTES
  );
  assert.equal(hashedAbc.sha256, sha256(abc));
  assert.equal(hashedAbc.byteSize, 3);
  assert.ok(abcHandle.reads.every((n) => n === HASH_CHUNK_BYTES));
  assert.equal(abcHandle.closeCount.n, 1);

  const emptyHandle = instrumentedBytes(new Uint8Array(0), 0);
  await assert.rejects(
    () => consume(emptyHandle.open, 1024),
    (err: unknown) => err instanceof Error && err.message === "empty_original"
  );
  assert.equal(emptyHandle.closeCount.n, 1);

  const boundary = new Uint8Array(64);
  boundary[0] = 0x25;
  const boundaryHandle = instrumentedBytes(boundary);
  const gotBoundary = await consume(boundaryHandle.open, 64);
  assert.equal(gotBoundary.byteLength, 64);
  assert.equal(sha256(gotBoundary), sha256(boundary));
  assert.equal(boundaryHandle.closeCount.n, 1);

  const over = new Uint8Array(65);
  const overHandle = instrumentedBytes(over);
  await assert.rejects(
    () => consume(overHandle.open, 64),
    (err: unknown) => err instanceof Error && err.message === "too_large"
  );
  assert.equal(overHandle.closeCount.n, 1, "oversize must close the handle");

  const advertisedOver = instrumentedBytes(over, 65);
  await assert.rejects(
    () => consume(advertisedOver.open, 64),
    (err: unknown) => err instanceof Error && err.message === "too_large"
  );
  assert.equal(advertisedOver.closeCount.n, 1);
  assert.equal(advertisedOver.reads.length, 0, "advertised oversize must not read body");

  const lyingSmall = new Uint8Array(200);
  lyingSmall.fill(7);
  const incorrectSize = instrumentedBytes(lyingSmall, 50);
  await assert.rejects(
    () => consume(incorrectSize.open, 150),
    (err: unknown) => err instanceof Error && err.message === "too_large"
  );
  assert.equal(incorrectSize.closeCount.n, 1);

  const gtChunk = new Uint8Array(HASH_CHUNK_BYTES + 17).map((_, i) => i & 0xff);
  const gtHandle = instrumentedBytes(gtChunk);
  const hashedGt = await hashBoundedChunks(
    iterateBoundedChunks(gtHandle.open, { maxBytes: HASH_CHUNK_BYTES + 32 }),
    createGrinSha256ChunkHasher(),
    HASH_CHUNK_BYTES
  );
  assert.equal(hashedGt.sha256, sha256(gtChunk));
  assert.ok(gtHandle.reads.length >= 2);
  assert.ok(gtHandle.reads.every((n) => n === HASH_CHUNK_BYTES));
  assert.equal(gtHandle.closeCount.n, 1);

  let readsBeforeAbort = 0;
  const interruptBytes = new Uint8Array(HASH_CHUNK_BYTES + 8);
  const interrupted = instrumentedBytes(interruptBytes);
  await assert.rejects(
    () =>
      consume(interrupted.open, HASH_CHUNK_BYTES * 2, () => {
        readsBeforeAbort += 1;
        return interrupted.reads.length >= 1;
      }),
    (err: unknown) => err instanceof Error && err.message === "read_interrupted"
  );
  assert.equal(interrupted.closeCount.n, 1, "interrupted read must close the handle");
  assert.ok(readsBeforeAbort >= 1);
  const retried = instrumentedBytes(interruptBytes);
  const retriedBytes = await consume(retried.open, HASH_CHUNK_BYTES * 2);
  assert.equal(retriedBytes.byteLength, interruptBytes.byteLength);
  assert.equal(sha256(retriedBytes), sha256(interruptBytes));
  assert.equal(retried.closeCount.n, 1, "retry after interrupt must close the new handle");

  const prefixHandle = instrumentedBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]));
  const prefix = readPrefixFromHandle(prefixHandle.open, 4);
  assert.equal(prefix.byteLength, 4);
  assert.equal(prefix[0], 0x25);
  assert.equal(prefixHandle.closeCount.n, 1);

  const limited = instrumentedBytes(new Uint8Array(20));
  await assert.rejects(
    async () => {
      const gen = limitChunks(
        (async function* () {
          yield new Uint8Array(12);
          yield new Uint8Array(12);
        })(),
        { maxBytes: 16 }
      );
      for await (const _chunk of gen) {
        void _chunk;
      }
    },
    (err: unknown) => err instanceof Error && err.message === "too_large"
  );
  void limited;

  const retentionSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../screens/grin/grinOriginalRetention.ts"), "utf8");
  assert.match(retentionSrc, /iterateBoundedChunks/);
  assert.match(retentionSrc, /file\.open\(\)/);
  assert.doesNotMatch(retentionSrc, /readAsStringAsync/);
  assert.doesNotMatch(retentionSrc, /\batob\b/);
  assert.doesNotMatch(retentionSrc, /EncodingType\.Base64/);

  console.log("goodsEvidence/boundedRead.test.ts: ok (instrumented FileHandle / not NATIVE_DEVICE)");
}

void main();
