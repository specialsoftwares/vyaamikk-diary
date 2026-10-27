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
  grinEvidence: "grin_evidence",
} as const;

const GRIN_BODY_PATH = /\/(?:receipts|commands|events)\/[^/]+$/;

/** Receipt, command, and event documents. Serials, quotas, and evidence bytes stay outside. */
export function grinCloudDocumentShouldSeal(path: string): boolean {
  return GRIN_BODY_PATH.test(path);
}

/**
 * Seals a new or updated GRIN body document.
 * A missing or malformed key throws. It does not return the plaintext for persistence.
 * Serials, quotas, and other non-body paths are unchanged.
 * An already sealed document is persisted only after this key opens it.
 */
export function sealGrinCloudDocument(
  path: string,
  data: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env
): Record<string, unknown> {
  if (!grinCloudDocumentShouldSeal(path)) return data;
  const uid = path.split("/")[1];
  if (!uid || !path.startsWith(`users/${uid}/`)) throw new Error("binding_rejected");
  const key = loadContentKey(env);
  if (data.grinDocumentSeal === 1) {
    openGrinCloudDocument(path, data, env);
    return data;
  }
  const seal = sealContent({
    key,
    uid,
    collection: "grinEvidence",
    recordId: path,
    revision: 1,
    purpose: "grin_evidence",
    plaintext: Buffer.from(JSON.stringify(data), "utf8"),
  });
  return { grinDocumentSeal: 1, contentSeal: seal };
}

/** Legacy documents pass through. A sealed document without its key fails closed. */
export function openGrinCloudDocument(
  path: string,
  data: Record<string, unknown> | undefined,
  env: NodeJS.ProcessEnv = process.env
): Record<string, unknown> | undefined {
  if (!data || data.grinDocumentSeal !== 1) return data;
  const uid = path.split("/")[1];
  if (!uid) throw new Error("binding_rejected");
  const plaintext = openStoredContent({
    env,
    uid,
    collection: "grinEvidence",
    recordId: path,
    revision: 1,
    purpose: "grin_evidence",
    seal: data.contentSeal as ContentSeal,
  });
  return JSON.parse(plaintext.toString("utf8")) as Record<string, unknown>;
}

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

export type MigrationPersistResult = "persisted" | "conflict" | "rejected" | "unknown";

export type MigrationRow = {
  id: string;
  updatedAt: number;
  contentSeal: ContentSeal | null;
  /** Document path. Ownership is this path, not the fields inside the seal. */
  path?: string;
};

export type MigrationBatchResult = {
  written: number;
  skipped: number;
  quarantined: string[];
  conflicts: string[];
  rejected: string[];
  unknown: string[];
  /** Inclusive. The next batch starts at this id, including a conflict or unconfirmed row. */
  nextCursor: string | null;
  stopped: null | "conflict" | "rejected" | "unknown" | "writer_threw";
};

/** users/{uid}/{collection}/{recordId}. The path is the source of ownership. */
export function sealMatchesSourcePath(row: MigrationRow): boolean {
  const seal = row.contentSeal;
  if (!seal || !row.path) return false;
  const parts = row.path.split("/");
  if (parts.length !== 4 || parts[0] !== "users") return false;
  const [, uid, collection, recordId] = parts;
  if (!uid || !collection || !recordId) return false;
  return seal.uid === uid && seal.collection === collection && seal.recordId === recordId && seal.revision === row.updatedAt;
}

/**
 * nextCursor is inclusive: a later batch must include that row.
 * A missing persistence adapter cannot count a write.
 */
export async function migrateContentKeyBatch(input: {
  rows: MigrationRow[];
  toKeyId: string;
  resolveKey: (keyId: string) => Buffer | null;
  dryRun: boolean;
  writer?: (row: MigrationRow, seal: ContentSeal) => Promise<MigrationPersistResult> | MigrationPersistResult;
}): Promise<MigrationBatchResult> {
  if (!input.dryRun && process.env.CONTENT_KEY_MIGRATION_ENABLED !== "true") {
    throw new Error("migration_disabled");
  }
  if (!input.dryRun && !input.writer) throw new Error("migration_writer_required");
  const rows = input.rows.slice(0, 50);
  const quarantined: string[] = [];
  const conflicts: string[] = [];
  const rejected: string[] = [];
  const unknown: string[] = [];
  let written = 0;
  let skipped = 0;
  const toKey = input.resolveKey(input.toKeyId);
  const finish = (stopped: MigrationBatchResult["stopped"], nextCursor: string | null): MigrationBatchResult => ({
    written: input.dryRun ? 0 : written,
    skipped,
    quarantined,
    conflicts,
    rejected,
    unknown,
    nextCursor,
    stopped,
  });
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const seal = row.contentSeal;
    if (!seal) {
      skipped += 1;
      continue;
    }
    if (seal.v === 2 && seal.keyId === input.toKeyId) {
      skipped += 1;
      continue;
    }
    if (!input.dryRun && !sealMatchesSourcePath(row)) {
      quarantined.push(row.id);
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
    let outcome: MigrationPersistResult;
    try {
      outcome = await input.writer!(row, next);
    } catch {
      return finish("writer_threw", row.id);
    }
    if (outcome === "persisted") {
      written += 1;
      continue;
    }
    if (outcome === "conflict") conflicts.push(row.id);
    else if (outcome === "rejected") rejected.push(row.id);
    else unknown.push(row.id);
    return finish(outcome === "conflict" ? "conflict" : outcome === "rejected" ? "rejected" : "unknown", row.id);
  }
  const nextCursor = input.rows.length > rows.length ? input.rows[rows.length]?.id ?? null : null;
  return finish(null, nextCursor);
}

export type MigrationLease = {
  runId: string;
  revision: number;
  cursor: string | null;
  toKeyId: string;
  leaseUntil: number;
  conflicts: string[];
  /** Bumped on every claim. A writer must present this value before each document write. */
  fence: number;
  scopeId: string;
  quarantined: string[];
  unresolved: string[];
};

export type MigrationCheckpointStore = {
  read(): Promise<MigrationLease | null>;
  compareAndSet(expectedRevision: number | null, next: MigrationLease): Promise<"stored" | "conflict">;
};

export function createMemoryMigrationCheckpointStore(): MigrationCheckpointStore {
  let current: MigrationLease | null = null;
  return {
    async read() {
      return current ? { ...current, conflicts: [...current.conflicts] } : null;
    },
    async compareAndSet(expectedRevision, next) {
      const revision = current?.revision ?? null;
      if (revision !== expectedRevision) return "conflict";
      current = { ...next, conflicts: [...next.conflicts] };
      return "stored";
    },
  };
}

/** Rows at and after the cursor. A missing cursor id is not treated as already done. */
export function rowsFromInclusiveCursor<T extends { id: string }>(rows: T[], cursor: string | null): T[] {
  if (!cursor) return rows;
  const index = rows.findIndex((row) => row.id === cursor);
  if (index < 0) return [];
  return rows.slice(index);
}

export function migrationMayComplete(input: {
  cursor: string | null;
  quarantined: readonly string[];
  unresolved: readonly string[];
}): boolean {
  return input.cursor == null && input.quarantined.length === 0 && input.unresolved.length === 0;
}

export async function runOwnedMigration(input: {
  store: MigrationCheckpointStore;
  runId: string;
  now: number;
  leaseMs: number;
  rows: MigrationRow[];
  toKeyId: string;
  scopeId?: string;
  ring?: readonly string[];
  resolveKey: (keyId: string) => Buffer | null;
  writer: (row: MigrationRow, seal: ContentSeal) => Promise<MigrationPersistResult> | MigrationPersistResult;
}): Promise<
  | { status: "owned_by_other" | "claim_conflict" | "cursor_not_in_page" | "checkpoint_conflict" | "key_not_in_ring" | "scope_mismatch"; cursor: string | null }
  | { status: "stored"; cursor: string | null; batch: MigrationBatchResult; complete: boolean }
> {
  if (input.ring && !input.ring.includes(input.toKeyId)) return { status: "key_not_in_ring", cursor: null };
  const existing = await input.store.read();
  const scopeId = input.scopeId ?? existing?.scopeId ?? "unscoped";
  if (existing && (existing.toKeyId !== input.toKeyId || existing.scopeId !== scopeId)) {
    return { status: "scope_mismatch", cursor: null };
  }
  if (existing && existing.leaseUntil > input.now && existing.runId !== input.runId) {
    return { status: "owned_by_other", cursor: existing.cursor };
  }
  const expected = existing?.revision ?? null;
  const claimed: MigrationLease = {
    runId: input.runId,
    revision: (existing?.revision ?? 0) + 1,
    cursor: existing?.cursor ?? null,
    toKeyId: input.toKeyId,
    leaseUntil: input.now + input.leaseMs,
    conflicts: existing?.conflicts ?? [],
    fence: (existing?.fence ?? 0) + 1,
    scopeId,
    quarantined: existing?.quarantined ?? [],
    unresolved: existing?.unresolved ?? [],
  };
  if ((await input.store.compareAndSet(expected, claimed)) !== "stored") {
    return { status: "claim_conflict", cursor: existing?.cursor ?? null };
  }
  const page = rowsFromInclusiveCursor(input.rows, claimed.cursor);
  if (claimed.cursor && page.length === 0) return { status: "cursor_not_in_page", cursor: claimed.cursor };
  const batch = await migrateContentKeyBatch({
    rows: page,
    toKeyId: input.toKeyId,
    resolveKey: input.resolveKey,
    dryRun: false,
    writer: input.writer,
  });
  const pageIds = new Set(page.map((row) => row.id));
  const quarantined = [...claimed.quarantined.filter((id) => !pageIds.has(id)), ...batch.quarantined];
  const unresolved = [
    ...claimed.unresolved.filter((id) => !pageIds.has(id)),
    ...batch.unknown,
    ...batch.rejected,
    ...batch.conflicts,
  ];
  const saved = await input.store.compareAndSet(claimed.revision, {
    ...claimed,
    revision: claimed.revision + 1,
    cursor: batch.nextCursor,
    conflicts: [...claimed.conflicts, ...batch.conflicts],
    quarantined,
    unresolved,
    leaseUntil: input.now + input.leaseMs,
  });
  if (saved !== "stored") return { status: "checkpoint_conflict", cursor: claimed.cursor };
  return {
    status: "stored",
    cursor: batch.nextCursor,
    batch,
    complete: migrationMayComplete({ cursor: batch.nextCursor, quarantined, unresolved }),
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

export type BackupObservation = {
  keyId: string;
  source: "backup_inventory";
  scope: string;
  observedAt: number;
  copies: number;
};

export const BACKUP_OBSERVATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Retirement becomes ready only from a fresh backup inventory of this key.
 * A caller-supplied "no copies" flag is not evidence. This does not delete a key.
 */
export function keyRetirementAllowed(input: {
  keyId: string;
  ring: readonly string[];
  activeUses: number;
  uncovered: readonly string[];
  observation?: BackupObservation | null;
  now?: number;
}): { allowed: boolean; reason: string } {
  if (!input.ring.includes(input.keyId)) return { allowed: false, reason: "key_not_in_ring" };
  if (input.activeUses > 0) return { allowed: false, reason: "active_records_remain" };
  if (input.uncovered.length > 0) return { allowed: false, reason: "uncovered_copies" };
  const observation = input.observation ?? null;
  if (!observation) return { allowed: false, reason: "backup_observation_missing" };
  if (observation.source !== "backup_inventory" || observation.keyId !== input.keyId || observation.scope !== `key-ring:${input.keyId}`) {
    return { allowed: false, reason: "backup_observation_unproven" };
  }
  const now = input.now ?? Date.now();
  if (!Number.isSafeInteger(observation.observedAt) || observation.observedAt > now || now - observation.observedAt > BACKUP_OBSERVATION_MAX_AGE_MS) {
    return { allowed: false, reason: "backup_observation_stale" };
  }
  if (observation.copies !== 0) return { allowed: false, reason: "backup_copies_remain" };
  return { allowed: true, reason: "ready_pending_disabled_execution" };
}

/** The decision can be ready. Deleting the key stays off until an executor is bound. */
export function executeKeyRetirement(input: Parameters<typeof keyRetirementAllowed>[0]): { deleted: false; reason: string } {
  const decision = keyRetirementAllowed(input);
  if (!decision.allowed) return { deleted: false, reason: decision.reason };
  return { deleted: false, reason: "retirement_executor_not_bound" };
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
