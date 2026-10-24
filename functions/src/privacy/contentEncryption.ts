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

export const COLLECTION_PURPOSE = {
  entries: "diary",
  attachments: "attachment",
  customerCreditRecords: "customer_credit",
  purchaseOrders: "purchase_order",
  professionalPacks: "professional_pack",
  letterheadDocs: "letterhead_document",
  users: "profile",
} as const;

/** Copies this engine does not rewrite. v2 writes stay off until authorised. */
export const CONTENT_MIGRATION_UNCOVERED = [
  "grin_evidence",
  "party_ledger_projections",
  "local_caches_and_outboxes",
  "storage_object_names",
  "exports",
] as const;

export function assertContentBinding(input: {
  collection: string;
  purpose: string;
  revision: number;
  keyId?: string;
}): void {
  const expected = COLLECTION_PURPOSE[input.collection as keyof typeof COLLECTION_PURPOSE];
  const keyOk = input.keyId == null || /^[A-Za-z0-9._-]{1,64}$/.test(input.keyId);
  if (expected !== input.purpose || !Number.isSafeInteger(input.revision) || input.revision < 0 || !keyOk) {
    throw new Error("binding_rejected");
  }
}

function aad(input: {
  uid: string;
  collection: string;
  recordId: string;
  revision: number;
  purpose: string;
  keyId?: string;
}): Buffer {
  if (!input.keyId) {
    return Buffer.from(
      [input.uid, input.collection, input.recordId, String(input.revision), input.purpose].join("|"),
      "utf8"
    );
  }
  // Length-prefixed so a delimiter inside a field cannot alias another binding.
  return Buffer.concat(
    [input.uid, input.collection, input.recordId, String(input.revision), input.purpose, input.keyId].map((part) => {
      const bytes = Buffer.from(part, "utf8");
      const length = Buffer.alloc(4);
      length.writeUInt32BE(bytes.length);
      return Buffer.concat([length, bytes]);
    })
  );
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

/** Count-only. It does not write, rotate, or contact a live key service. */
export function planContentKeyMigration(rows: { contentSeal?: { v?: unknown; keyId?: unknown } | null }[]) {
  const counts = { plaintext: 0, v1: 0, v2: 0, unknown: 0 };
  for (const row of rows) {
    const seal = row.contentSeal;
    if (!seal) counts.plaintext += 1;
    else if (seal.v === 1) counts.v1 += 1;
    else if (seal.v === 2 && typeof seal.keyId === "string" && seal.keyId.length > 0) counts.v2 += 1;
    else counts.unknown += 1;
  }
  return { mode: "count-only" as const, counts, writes: 0 };
}

export type MigrationRow = { id: string; updatedAt: number; contentSeal: ContentSeal | null };

/**
 * Bounded dry-run unless CONTENT_KEY_MIGRATION_ENABLED=true and dryRun is false.
 * Live migration stays off. Already-migrated rows are skipped.
 */
export function migrateContentKeyBatch(input: {
  rows: MigrationRow[];
  toKeyId: string;
  resolveKey: (keyId: string) => Buffer | null;
  dryRun: boolean;
  writer?: (row: MigrationRow, seal: ContentSeal) => "ok" | "conflict";
}): { written: number; skipped: number; quarantined: string[]; conflicts: string[]; nextCursor: string | null } {
  if (!input.dryRun && process.env.CONTENT_KEY_MIGRATION_ENABLED !== "true") {
    throw new Error("migration_disabled");
  }
  const rows = input.rows.slice(0, 50);
  const quarantined: string[] = [];
  const conflicts: string[] = [];
  let written = 0;
  let skipped = 0;
  const toKey = input.resolveKey(input.toKeyId);
  for (const row of rows) {
    const seal = row.contentSeal;
    if (!seal) {
      skipped += 1;
      continue;
    }
    if (seal.v === 2 && seal.keyId === input.toKeyId) {
      skipped += 1;
      continue;
    }
    const sourceKey = seal.v === 2 ? input.resolveKey(seal.keyId ?? "") : input.resolveKey("legacy");
    if (!toKey || !sourceKey || (seal.v !== 1 && seal.v !== 2)) {
      quarantined.push(row.id);
      continue;
    }
    let plaintext: Buffer;
    try {
      plaintext = openContent({
        key: sourceKey,
        uid: seal.uid,
        collection: seal.collection,
        recordId: seal.recordId,
        revision: seal.revision,
        purpose: seal.purpose,
        seal,
        resolveKey: input.resolveKey,
      });
    } catch {
      quarantined.push(row.id);
      continue;
    }
    if (input.dryRun) continue;
    const next = sealContentV2({
      key: toKey,
      keyId: input.toKeyId,
      uid: seal.uid,
      collection: seal.collection,
      recordId: seal.recordId,
      revision: seal.revision,
      purpose: seal.purpose,
      plaintext,
    });
    const outcome = input.writer?.(row, next) ?? "ok";
    if (outcome === "conflict") {
      conflicts.push(row.id);
      return {
        written,
        skipped,
        quarantined,
        conflicts,
        nextCursor: row.id,
      };
    }
    written += 1;
  }
  return {
    written: input.dryRun ? 0 : written,
    skipped,
    quarantined,
    conflicts,
    nextCursor: input.rows.length > 50 ? rows[rows.length - 1]?.id ?? null : null,
  };
}

export type KeyMigrationCheckpoint = {
  cursor: string | null;
  toKeyId: string;
  conflicts: string[];
};

/** Keep the previous cursor when a batch throws. A conflict cursor retries that row. */
export function resumeKeyMigrationCheckpoint(
  previous: KeyMigrationCheckpoint,
  batch: { conflicts: string[]; nextCursor: string | null } | null
): KeyMigrationCheckpoint {
  if (!batch) return { ...previous, conflicts: [...previous.conflicts] };
  return {
    cursor: batch.conflicts.length > 0 ? batch.conflicts[0] : batch.nextCursor,
    toKeyId: previous.toKeyId,
    conflicts: [...previous.conflicts, ...batch.conflicts],
  };
}

/**
 * A key stays in the ring until active rows, uncovered copies, and backup
 * uncertainty are gone. This does not delete a key.
 */
export function keyRetirementAllowed(input: {
  keyId: string;
  ring: readonly string[];
  activeUses: number;
  backupCopiesUnknown: boolean;
  uncovered: readonly string[];
}): { allowed: false; reason: string } {
  if (!input.ring.includes(input.keyId)) return { allowed: false, reason: "key_not_in_ring" };
  if (input.activeUses > 0) return { allowed: false, reason: "active_records_remain" };
  if (input.uncovered.length > 0) return { allowed: false, reason: "uncovered_copies" };
  if (input.backupCopiesUnknown) return { allowed: false, reason: "backup_copies_unknown" };
  return { allowed: false, reason: "retirement_not_authorised" };
}

/** Opens v2 with only its named key. A v1 seal still requires the legacy key. */
export function openStoredContent(input: {
  env?: NodeJS.ProcessEnv;
  uid: string;
  collection: string;
  recordId: string;
  revision: number;
  purpose: string;
  seal: ContentSeal;
}): Buffer {
  assertContentBinding({
    collection: input.collection,
    purpose: input.purpose,
    revision: input.revision,
    keyId: input.seal.v === 2 ? input.seal.keyId : undefined,
  });
  const env = input.env ?? process.env;
  if (input.seal.v === 2) {
    const keyId = input.seal.keyId ?? "";
    const key = loadNamedContentKey(keyId, env);
    if (!key) throw new Error("unknown_key");
    return openContent({
      ...input,
      key,
      resolveKey: (id) => (id === keyId ? loadNamedContentKey(id, env) : null),
    });
  }
  return openContent({ ...input, key: loadContentKey(env) });
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
