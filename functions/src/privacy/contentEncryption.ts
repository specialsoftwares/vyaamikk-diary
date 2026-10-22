/**
 * Application-level AES-256-GCM envelopes.
 * The content key is server-only and is not the billing KMS key.
 * Ciphertext is bound to owner, collection, object id, revision, and purpose.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

export const CONTENT_SEAL_VERSION = 1;
export const CONTENT_SEAL_ALG = "AES-256-GCM";

export type ContentSeal = {
  v: 1;
  alg: "AES-256-GCM";
  uid: string;
  collection: string;
  recordId: string;
  revision: number;
  purpose: string;
  nonce: string;
  ciphertext: string;
  tag: string;
};

export function loadContentKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const raw = env.CONTENT_DATA_KEY?.trim();
  if (!raw) {
    throw new Error("content_key_unavailable");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("content_key_unavailable");
  }
  return key;
}

function aad(input: {
  uid: string;
  collection: string;
  recordId: string;
  revision: number;
  purpose: string;
}): Buffer {
  return Buffer.from(
    [input.uid, input.collection, input.recordId, String(input.revision), input.purpose].join("|"),
    "utf8"
  );
}

export function sealContent(input: {
  key: Buffer;
  uid: string;
  collection: string;
  recordId: string;
  revision: number;
  purpose: string;
  plaintext: Buffer;
}): ContentSeal {
  if (input.key.length !== 32) throw new Error("content_key_unavailable");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", input.key, nonce);
  const binding = {
    uid: input.uid,
    collection: input.collection,
    recordId: input.recordId,
    revision: input.revision,
    purpose: input.purpose,
  };
  cipher.setAAD(aad(binding));
  const ciphertext = Buffer.concat([cipher.update(input.plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: CONTENT_SEAL_VERSION,
    alg: CONTENT_SEAL_ALG,
    ...binding,
    nonce: nonce.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function openContent(input: {
  key: Buffer;
  uid: string;
  collection: string;
  recordId: string;
  revision: number;
  purpose: string;
  seal: ContentSeal;
}): Buffer {
  if (input.key.length !== 32) throw new Error("content_key_unavailable");
  if (input.seal.uid !== input.uid) throw new Error("wrong_owner");
  if (input.seal.collection !== input.collection) throw new Error("wrong_collection");
  if (input.seal.recordId !== input.recordId) throw new Error("wrong_record");
  if (input.seal.revision !== input.revision) throw new Error("stale_revision");
  if (input.seal.purpose !== input.purpose) throw new Error("wrong_purpose");
  if (input.seal.v !== 1 || input.seal.alg !== CONTENT_SEAL_ALG) throw new Error("unsupported_seal");
  try {
    const decipher = createDecipheriv("aes-256-gcm", input.key, Buffer.from(input.seal.nonce, "base64"));
    decipher.setAAD(
      aad({
        uid: input.uid,
        collection: input.collection,
        recordId: input.recordId,
        revision: input.revision,
        purpose: input.purpose,
      })
    );
    decipher.setAuthTag(Buffer.from(input.seal.tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(input.seal.ciphertext, "base64")),
      decipher.final(),
    ]);
  } catch {
    throw new Error("content_tampered");
  }
}

export type StoredRecordKind = "legacy" | "sealed";

export function classifyStoredRecord(data: { contentSeal?: unknown }): StoredRecordKind {
  return data.contentSeal && typeof data.contentSeal === "object" ? "sealed" : "legacy";
}
