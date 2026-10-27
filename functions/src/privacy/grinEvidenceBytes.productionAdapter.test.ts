/**
 * GRIN original bytes. Streaming AES-GCM, distinct hashes, no live rewrite of legacy objects.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";

import {
  GRIN_EVIDENCE_CHUNK_BYTES,
  createMemoryEvidenceBucket,
  iterateEvidencePlaintext,
  writeSealedEvidence,
} from "./grinEvidenceBytes";

const key = randomBytes(32);
const path = "users/owner-a/grinEvidence/abc123/original";
const image = Buffer.from("jpeg-bytes-yard-photo");

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function collect(input: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const chunk of input) parts.push(Buffer.from(chunk));
  return Buffer.concat(parts);
}

async function main(): Promise<void> {
  const bucket = createMemoryEvidenceBucket();
  const uploaded = bucket.putPlaintext(path, image, true);
  let largestWrite = 0;
  const hashes = await writeSealedEvidence({
    key,
    uid: "owner-a",
    storagePath: path,
    sourceGeneration: uploaded,
    plaintext: (async function* () {
      const payload = randomBytes(GRIN_EVIDENCE_CHUNK_BYTES + 100);
      yield payload.subarray(0, GRIN_EVIDENCE_CHUNK_BYTES);
      yield payload.subarray(GRIN_EVIDENCE_CHUNK_BYTES);
    })(),
    write: (chunk) => {
      largestWrite = Math.max(largestWrite, chunk.byteLength);
    },
  });
  assert.ok(largestWrite <= GRIN_EVIDENCE_CHUNK_BYTES + 32);
  assert.notEqual(hashes.originalSha256, hashes.ciphertextSha256);

  await assert.rejects(() => bucket.acceptPending(path, null, "owner-a"), /content_key_unavailable/);
  assert.equal(bucket.object(path)?.generation, uploaded);
  assert.equal(bucket.object(path)?.bytes.equals(image), true);

  const accepted = await bucket.acceptPending(path, key, "owner-a");
  assert.equal(accepted.kind, "sealed");
  assert.equal(accepted.originalSha256, sha256(image));
  assert.notEqual(accepted.ciphertextSha256, accepted.originalSha256);
  assert.equal(accepted.plaintext.equals(image), true);
  assert.notEqual(accepted.generation, uploaded);
  assert.equal(bucket.object(path)?.bytes.equals(image), false);
  const again = await bucket.acceptPending(path, key, "owner-a");
  assert.equal(again.generation, accepted.generation);
  assert.equal(again.ciphertextSha256, accepted.ciphertextSha256);

  const display = await collect(iterateEvidencePlaintext({
    key,
    uid: "owner-a",
    storagePath: path,
    stored: (async function* () { yield bucket.object(path)!.bytes; })(),
  }));
  assert.equal(display.equals(image), true);
  await assert.rejects(() => collect(iterateEvidencePlaintext({
    key: null,
    uid: "owner-a",
    storagePath: path,
    stored: (async function* () { yield bucket.object(path)!.bytes; })(),
  })), /content_key_unavailable/);
  await assert.rejects(() => collect(iterateEvidencePlaintext({
    key,
    uid: "owner-b",
    storagePath: path,
    stored: (async function* () { yield bucket.object(path)!.bytes; })(),
  })), /content_tampered/);
  const tampered = Buffer.from(bucket.object(path)!.bytes);
  tampered[tampered.byteLength - 1] ^= 0xff;
  await assert.rejects(() => collect(iterateEvidencePlaintext({
    key,
    uid: "owner-a",
    storagePath: path,
    stored: (async function* () { yield tampered; })(),
  })), /content_tampered/);

  const legacyPath = "users/owner-a/grinEvidence/legacy/original";
  const legacyGen = bucket.putPlaintext(legacyPath, Buffer.from("old-pdf"), false);
  const legacy = await bucket.acceptPending(legacyPath, null, "owner-a");
  assert.equal(legacy.kind, "legacy");
  assert.equal(legacy.generation, legacyGen);
  assert.equal(legacy.ciphertextSha256, null);
  assert.equal(legacy.plaintext.toString(), "old-pdf");
  assert.equal(bucket.object(legacyPath)?.bytes.toString(), "old-pdf");

  const interrupted = createMemoryEvidenceBucket();
  const pendingGen = interrupted.putPlaintext(path, image, true);
  await assert.rejects(() => writeSealedEvidence({
    key,
    uid: "owner-a",
    storagePath: path,
    sourceGeneration: pendingGen,
    plaintext: (async function* () { yield image; })(),
    write: () => { throw new Error("interrupted"); },
  }), /interrupted/);
  assert.equal(interrupted.object(path)?.generation, pendingGen);
  assert.equal(interrupted.object(path)?.bytes.equals(image), true);

  console.log("grin evidence bytes production adapter passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
