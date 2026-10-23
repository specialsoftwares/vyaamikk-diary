/**
 * Application-level AES-256-GCM envelopes.
 * The content key is server-only and is not the billing KMS key.
 * Ciphertext is bound to owner, collection, object id, revision, and purpose.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

export const CONTENT_SEAL_VERSION = 1;
export const CONTENT_SEAL_ALG = "AES-256-GCM";

export type ContentSeal = {
  v: 1 | 2;
  keyId?: string;
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

export function loadNamedContentKey(keyId: string, env: NodeJS.ProcessEnv = process.env): Buffer | null {
  if (!keyId) return null;
  if (keyId === "legacy") {
    try {
      return loadContentKey(env);
    } catch {
      return null;
    }
  }
  const raw = env.CONTENT_DATA_KEYS?.trim();
  if (!raw) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  const value = parsed[keyId];
  if (typeof value !== "string") return null;
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value) return null;
  return key;
}

export function loadContentKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const raw = env.CONTENT_DATA_KEY?.trim();
  if (!raw) {
    throw new Error("content_key_unavailable");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32 || key.toString("base64") !== raw) {
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
  keyId?: string;
}): Buffer {
  const parts = [input.uid, input.collection, input.recordId, String(input.revision), input.purpose];
  // Version 1 stays the original five-part binding. Version 2 adds the key id.
  if (input.keyId) parts.push(input.keyId);
  return Buffer.from(parts.join("|"), "utf8");
}

export function sealContentV2(input: {
  key: Buffer;
  keyId: string;
  uid: string;
  collection: string;
  recordId: string;
  revision: number;
  purpose: string;
  plaintext: Buffer;
}): ContentSeal {
  if (!input.keyId || input.key.length !== 32) throw new Error("content_key_unavailable");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", input.key, nonce);
  const binding = {
    uid: input.uid,
    collection: input.collection,
    recordId: input.recordId,
    revision: input.revision,
    purpose: input.purpose,
    keyId: input.keyId,
  };
  cipher.setAAD(aad(binding));
  const ciphertext = Buffer.concat([cipher.update(input.plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 2,
    alg: CONTENT_SEAL_ALG,
    keyId: input.keyId,
    uid: input.uid,
    collection: input.collection,
    recordId: input.recordId,
    revision: input.revision,
    purpose: input.purpose,
    nonce: nonce.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: tag.toString("base64"),
  };
}

/** Counts records only. It does not write, rotate, or contact a live key service. */
export function planContentKeyMigration(rows: { contentSeal?: { v?: unknown; keyId?: unknown } | null }[]) {
  const counts = { plaintext: 0, v1: 0, v2: 0, unknown: 0 };
  for (const row of rows) {
    const seal = row.contentSeal;
    if (!seal) counts.plaintext += 1;
    else if (seal.v === 1) counts.v1 += 1;
    else if (seal.v === 2 && typeof seal.keyId === "string" && seal.keyId.length > 0) counts.v2 += 1;
    else counts.unknown += 1;
  }
  return { counts, writes: 0 };
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
  /** Returns the key for a version-2 key id. It is called once, for that id only. */
  resolveKey?: (keyId: string) => Buffer | null;
}): Buffer {
  if (input.seal.uid !== input.uid) throw new Error("wrong_owner");
  if (input.seal.collection !== input.collection) throw new Error("wrong_collection");
  if (input.seal.recordId !== input.recordId) throw new Error("wrong_record");
  if (input.seal.revision !== input.revision) throw new Error("stale_revision");
  if (input.seal.purpose !== input.purpose) throw new Error("wrong_purpose");
  if (input.seal.alg !== CONTENT_SEAL_ALG) throw new Error("unsupported_seal");
  let key = input.key;
  let keyId: string | undefined;
  if (input.seal.v === 2) {
    keyId = input.seal.keyId;
    if (!keyId) throw new Error("unknown_key");
    const resolved = input.resolveKey?.(keyId) ?? null;
    if (!resolved) throw new Error("unknown_key");
    key = resolved;
  } else if (input.seal.v !== 1) {
    throw new Error("unsupported_seal");
  }
  if (key.length !== 32) throw new Error("content_key_unavailable");
  try {
    const decode = (value: string, length?: number) => {
      if (typeof value !== "string") throw new Error("invalid_encoding");
      const bytes = Buffer.from(value, "base64");
      if (bytes.toString("base64") !== value || (length != null && bytes.length !== length)) {
        throw new Error("invalid_encoding");
      }
      return bytes;
    };
    const nonce = decode(input.seal.nonce, 12);
    const tag = decode(input.seal.tag, 16);
    const ciphertext = decode(input.seal.ciphertext);
    const decipher = createDecipheriv("aes-256-gcm", key, nonce, { authTagLength: 16 });
    decipher.setAAD(
      aad({
        uid: input.uid,
        collection: input.collection,
        recordId: input.recordId,
        revision: input.revision,
        purpose: input.purpose,
        keyId,
      })
    );
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
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
