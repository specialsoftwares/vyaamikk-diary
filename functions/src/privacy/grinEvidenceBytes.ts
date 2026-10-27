/**
 * Streaming AES-256-GCM for GRIN originals.
 * The content-seal callable is not used. One chunk is in memory at a time.
 * The original-content hash is not the stored-ciphertext hash.
 *
 * VYD1 version 2 header: magic, version, uint8 generation length, generation
 * utf8, 12-byte nonce. Ciphertext and the 16-byte tag follow. Legacy objects
 * do not start with the magic and stay plaintext.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

export const GRIN_EVIDENCE_MAGIC = Buffer.from("VYD1");
export const GRIN_EVIDENCE_CHUNK_BYTES = 64 * 1024;
const VERSION = 2;
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;
const MAGIC_LENGTH = GRIN_EVIDENCE_MAGIC.length;

type EvidenceByteRead = {
  kind: "legacy" | "sealed";
  originalSha256: string;
  ciphertextSha256: string | null;
  sourceGeneration: string | null;
};

type EvidenceDecipher = {
  update: (chunk: Buffer) => Buffer;
  setAAD: (aad: Buffer) => void;
  setAuthTag: (tag: Buffer) => void;
  final: () => Buffer;
};

export function evidenceByteAad(uid: string, storagePath: string, sourceGeneration: string): Buffer {
  return Buffer.concat(
    [uid, storagePath, "grin_original", sourceGeneration].map((part) => {
      const bytes = Buffer.from(part, "utf8");
      const length = Buffer.alloc(4);
      length.writeUInt32BE(bytes.length);
      return Buffer.concat([length, bytes]);
    })
  );
}

export function isSealedEvidencePrefix(prefix: Uint8Array): boolean {
  return prefix.byteLength >= GRIN_EVIDENCE_MAGIC.length &&
    Buffer.from(prefix.subarray(0, GRIN_EVIDENCE_MAGIC.length)).equals(GRIN_EVIDENCE_MAGIC);
}

function requireKey(key: Buffer): void {
  if (key.length !== 32) throw new Error("content_key_unavailable");
}

function legacyRead(original: ReturnType<typeof createHash>): EvidenceByteRead {
  return {
    kind: "legacy",
    originalSha256: original.digest("hex"),
    ciphertextSha256: null,
    sourceGeneration: null,
  };
}

export async function writeSealedEvidence(input: {
  key: Buffer;
  uid: string;
  storagePath: string;
  sourceGeneration: string;
  plaintext: AsyncIterable<Uint8Array>;
  write: (chunk: Uint8Array) => void | Promise<void>;
}): Promise<{ originalSha256: string; ciphertextSha256: string; originalByteLength: number }> {
  requireKey(input.key);
  const generationBytes = Buffer.from(input.sourceGeneration, "utf8");
  if (generationBytes.length > 255) throw new Error("unsupported_seal");
  const nonce = randomBytes(NONCE_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", input.key, nonce);
  cipher.setAAD(evidenceByteAad(input.uid, input.storagePath, input.sourceGeneration));
  const original = createHash("sha256");
  const stored = createHash("sha256");
  let originalByteLength = 0;
  const header = Buffer.concat([
    GRIN_EVIDENCE_MAGIC,
    Buffer.from([VERSION, generationBytes.length]),
    generationBytes,
    nonce,
  ]);
  stored.update(header);
  await input.write(header);
  for await (const chunk of input.plaintext) {
    if (chunk.byteLength === 0) continue;
    originalByteLength += chunk.byteLength;
    original.update(chunk);
    const out = cipher.update(chunk);
    if (out.byteLength > 0) {
      stored.update(out);
      await input.write(out);
    }
  }
  const final = Buffer.concat([cipher.final(), cipher.getAuthTag()]);
  stored.update(final);
  await input.write(final);
  return {
    originalSha256: original.digest("hex"),
    ciphertextSha256: stored.digest("hex"),
    originalByteLength,
  };
}

export async function* iterateEvidencePlaintext(input: {
  key: Buffer | null;
  uid: string;
  storagePath: string;
  stored: AsyncIterable<Uint8Array>;
}): AsyncGenerator<Uint8Array, EvidenceByteRead> {
  const original = createHash("sha256");
  const storedHash = createHash("sha256");
  let header = Buffer.alloc(0);
  let decided = false;
  let legacy = false;
  let sourceGeneration: string | null = null;
  let decipher: EvidenceDecipher | null = null;
  let tail = Buffer.alloc(0);

  const emitPlain = async function* (chunk: Buffer): AsyncGenerator<Uint8Array> {
    if (chunk.byteLength === 0) return;
    original.update(chunk);
    yield chunk;
  };

  for await (const piece of input.stored) {
    if (piece.byteLength === 0) continue;
    storedHash.update(piece);
    let buf = Buffer.from(piece);
    if (!decided) {
      header = Buffer.concat([header, buf]);
      if (header.byteLength < MAGIC_LENGTH) continue;
      if (!isSealedEvidencePrefix(header)) {
        decided = true;
        legacy = true;
        const plain = header;
        header = Buffer.alloc(0);
        yield* emitPlain(plain);
        continue;
      }
      if (header.byteLength < MAGIC_LENGTH + 1) continue;
      if (header[MAGIC_LENGTH] !== VERSION) throw new Error("unsupported_seal");
      if (header.byteLength < MAGIC_LENGTH + 2) continue;
      const generationLength = header[MAGIC_LENGTH + 1] ?? 0;
      const total = MAGIC_LENGTH + 2 + generationLength + NONCE_LENGTH;
      if (header.byteLength < total) continue;
      if (!input.key) throw new Error("content_key_unavailable");
      requireKey(input.key);
      const generationStart = MAGIC_LENGTH + 2;
      sourceGeneration = header.subarray(generationStart, generationStart + generationLength).toString("utf8");
      const nonceStart = generationStart + generationLength;
      const nonce = header.subarray(nonceStart, nonceStart + NONCE_LENGTH);
      const rest = Buffer.from(header.subarray(total));
      header = Buffer.alloc(0);
      decided = true;
      decipher = createDecipheriv("aes-256-gcm", input.key, nonce, { authTagLength: TAG_LENGTH }) as EvidenceDecipher;
      decipher.setAAD(evidenceByteAad(input.uid, input.storagePath, sourceGeneration));
      buf = rest;
    }
    if (legacy) {
      yield* emitPlain(buf);
      continue;
    }
    tail = Buffer.concat([tail, buf]);
    if (tail.byteLength > TAG_LENGTH) {
      const emit = tail.subarray(0, tail.byteLength - TAG_LENGTH);
      tail = Buffer.from(tail.subarray(tail.byteLength - TAG_LENGTH));
      yield* emitPlain(decipher!.update(emit));
    }
  }

  if (!decided) {
    if (isSealedEvidencePrefix(header)) {
      if (header.byteLength > MAGIC_LENGTH && header[MAGIC_LENGTH] !== VERSION) throw new Error("unsupported_seal");
      throw new Error("content_tampered");
    }
    if (header.byteLength > 0) yield* emitPlain(header);
    return legacyRead(original);
  }
  if (legacy) return legacyRead(original);
  if (tail.byteLength !== TAG_LENGTH || sourceGeneration == null || !decipher) throw new Error("content_tampered");
  try {
    decipher.setAuthTag(tail);
    yield* emitPlain(decipher.final());
  } catch (error) {
    if (error instanceof Error && error.message === "content_tampered") throw error;
    throw new Error("content_tampered");
  }
  return {
    kind: "sealed",
    originalSha256: original.digest("hex"),
    ciphertextSha256: storedHash.digest("hex"),
    sourceGeneration,
  };
}

export async function readEvidenceBytes(input: {
  key: Buffer | null;
  uid: string;
  storagePath: string;
  stored: AsyncIterable<Uint8Array>;
  onPlaintext: (chunk: Uint8Array) => void | Promise<void>;
}): Promise<EvidenceByteRead> {
  const generator = iterateEvidencePlaintext(input);
  let step = await generator.next();
  while (!step.done) {
    await input.onPlaintext(step.value);
    step = await generator.next();
  }
  return step.value;
}

export type MemoryEvidenceObject = {
  generation: string;
  bytes: Buffer;
  /** New upload waiting to be sealed. Legacy objects are not pending. */
  pending: boolean;
};

/**
 * Production byte policy on an in-memory bucket.
 * A failed seal does not replace the previous generation.
 */
export function createMemoryEvidenceBucket(): {
  putPlaintext(path: string, bytes: Uint8Array, pending: boolean): string;
  object(path: string): MemoryEvidenceObject | undefined;
  acceptPending(path: string, key: Buffer | null, uid: string): Promise<{
    generation: string;
    kind: "legacy" | "sealed";
    originalSha256: string;
    ciphertextSha256: string | null;
    plaintext: Buffer;
  }>;
} {
  let generation = 0;
  const objects = new Map<string, MemoryEvidenceObject>();
  const nextGeneration = () => {
    generation += 1;
    return String(generation);
  };
  return {
    putPlaintext(path, bytes, pending) {
      const object = { generation: nextGeneration(), bytes: Buffer.from(bytes), pending };
      objects.set(path, object);
      return object.generation;
    },
    object(path) {
      const found = objects.get(path);
      return found ? { ...found, bytes: Buffer.from(found.bytes) } : undefined;
    },
    async acceptPending(path, key, uid) {
      const current = objects.get(path);
      if (!current) throw new Error("not_found");
      const started = current.generation;
      if (!current.pending && !isSealedEvidencePrefix(current.bytes)) {
        const plain: Buffer[] = [];
        const opened = await readEvidenceBytes({
          key,
          uid,
          storagePath: path,
          stored: bytesOf(current.bytes),
          onPlaintext: (chunk) => {
            plain.push(Buffer.from(chunk));
          },
        });
        return {
          generation: current.generation,
          kind: opened.kind,
          originalSha256: opened.originalSha256,
          ciphertextSha256: opened.ciphertextSha256,
          plaintext: Buffer.concat(plain),
        };
      }
      if (isSealedEvidencePrefix(current.bytes)) {
        const plain: Buffer[] = [];
        const opened = await readEvidenceBytes({
          key,
          uid,
          storagePath: path,
          stored: bytesOf(current.bytes),
          onPlaintext: (chunk) => {
            plain.push(Buffer.from(chunk));
          },
        });
        return {
          generation: current.generation,
          kind: "sealed",
          originalSha256: opened.originalSha256,
          ciphertextSha256: opened.ciphertextSha256,
          plaintext: Buffer.concat(plain),
        };
      }
      if (!key) throw new Error("content_key_unavailable");
      const parts: Buffer[] = [];
      const sealed = await writeSealedEvidence({
        key,
        uid,
        storagePath: path,
        sourceGeneration: started,
        plaintext: chunkPlaintext(current.bytes),
        write: (chunk) => {
          parts.push(Buffer.from(chunk));
        },
      });
      const bytes = Buffer.concat(parts);
      const plain: Buffer[] = [];
      const opened = await readEvidenceBytes({
        key,
        uid,
        storagePath: path,
        stored: bytesOf(bytes),
        onPlaintext: (chunk) => {
          plain.push(Buffer.from(chunk));
        },
      });
      if (opened.originalSha256 !== sealed.originalSha256) throw new Error("content_tampered");
      if (opened.ciphertextSha256 !== sealed.ciphertextSha256) throw new Error("content_tampered");
      if (opened.sourceGeneration !== started) throw new Error("content_tampered");
      const latest = objects.get(path);
      if (!latest || latest.generation !== started) throw new Error("generation_conflict");
      const object = { generation: nextGeneration(), bytes, pending: false };
      objects.set(path, object);
      return {
        generation: object.generation,
        kind: "sealed",
        originalSha256: sealed.originalSha256,
        ciphertextSha256: sealed.ciphertextSha256,
        plaintext: Buffer.concat(plain),
      };
    },
  };
}

async function* bytesOf(bytes: Uint8Array): AsyncGenerator<Uint8Array> {
  yield bytes;
}

async function* chunkPlaintext(bytes: Buffer): AsyncGenerator<Uint8Array> {
  for (let offset = 0; offset < bytes.byteLength; offset += GRIN_EVIDENCE_CHUNK_BYTES) {
    yield bytes.subarray(offset, Math.min(offset + GRIN_EVIDENCE_CHUNK_BYTES, bytes.byteLength));
  }
}
