/**
 * Durable content-key migration. The checkpoint document id is the scope and
 * the target key, so one run cannot resume another migration's cursor.
 * Live migration stays off unless CONTENT_KEY_MIGRATION_ENABLED is exactly "true".
 */

import { createHash } from "node:crypto";

import { FieldPath, type Firestore, type QueryDocumentSnapshot } from "firebase-admin/firestore";

import {
  migrateContentKeyBatch,
  migrationMayComplete,
  type ContentSeal,
  type MigrationLease,
  type MigrationPersistResult,
  type MigrationRow,
} from "./contentEncryption";

export function migrationCheckpointId(scopeId: string, toKeyId: string): string {
  return createHash("sha256").update(`${scopeId}\0${toKeyId}`).digest("hex");
}

export function createFirestoreMigrationCheckpointStore(
  db: Firestore,
  scope: { scopeId: string; toKeyId: string }
): {
  read(): Promise<MigrationLease | null>;
  compareAndSet(expectedRevision: number | null, next: MigrationLease): Promise<"stored" | "conflict">;
  assertWriteFence(expected: { runId: string; fence: number; now: number }): Promise<"open" | "lost">;
  renew(expected: { runId: string; fence: number }, now: number, leaseMs: number): Promise<"renewed" | "lost">;
} {
  const ref = db.collection("_contentKeyMigration").doc(migrationCheckpointId(scope.scopeId, scope.toKeyId));
  const parse = (data: Record<string, unknown> | undefined): MigrationLease | null => {
    if (!data) return null;
    if (data.scopeId !== scope.scopeId || data.toKeyId !== scope.toKeyId) return null;
    if (typeof data.runId !== "string" || typeof data.revision !== "number" || typeof data.fence !== "number") return null;
    if (typeof data.scopeId !== "string" || typeof data.toKeyId !== "string") return null;
    const strings = (value: unknown) => (Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []);
    return {
      runId: data.runId,
      revision: data.revision,
      cursor: typeof data.cursor === "string" ? data.cursor : null,
      toKeyId: data.toKeyId,
      leaseUntil: Number(data.leaseUntil ?? 0),
      conflicts: strings(data.conflicts),
      fence: data.fence,
      scopeId: data.scopeId,
      quarantined: strings(data.quarantined),
      unresolved: strings(data.unresolved),
    };
  };
  return {
    async read() {
      const snap = await ref.get();
      return snap.exists ? parse(snap.data() as Record<string, unknown>) : null;
    },
    async compareAndSet(expectedRevision, next) {
      if (next.scopeId !== scope.scopeId || next.toKeyId !== scope.toKeyId) return "conflict";
      try {
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          const current = snap.exists ? Number(snap.get("revision")) : null;
          const stored = Number.isFinite(current) ? current : null;
          if (stored !== expectedRevision) throw new Error("conflict");
          if (snap.exists && (snap.get("scopeId") !== scope.scopeId || snap.get("toKeyId") !== scope.toKeyId)) {
            throw new Error("conflict");
          }
          tx.set(ref, next);
        });
        return "stored";
      } catch (error) {
        if (error instanceof Error && error.message === "conflict") return "conflict";
        throw error;
      }
    },
    async assertWriteFence(expected) {
      const lease = await this.read();
      if (!lease || lease.runId !== expected.runId || lease.fence !== expected.fence || lease.leaseUntil <= expected.now) {
        return "lost";
      }
      return "open";
    },
    async renew(expected, now, leaseMs) {
      const lease = await this.read();
      if (!lease || lease.runId !== expected.runId || lease.fence !== expected.fence) return "lost";
      const wrote = await this.compareAndSet(lease.revision, {
        ...lease,
        revision: lease.revision + 1,
        leaseUntil: now + leaseMs,
      });
      return wrote === "stored" ? "renewed" : "lost";
    },
  };
}

export async function readMigrationPage(
  db: Firestore,
  input: { collections: readonly string[]; cursor: string | null; limit: number }
): Promise<{ rows: MigrationRow[]; nextCursor: string | null }> {
  const users = await db.collection("users").orderBy(FieldPath.documentId()).get();
  const rows: MigrationRow[] = [];
  let seenCursor = input.cursor == null;
  const push = (doc: QueryDocumentSnapshot): boolean => {
    const path = doc.ref.path;
    if (!seenCursor) {
      if (path !== input.cursor) return false;
      seenCursor = true;
    }
    const seal = doc.get("contentSeal");
    rows.push({
      id: path,
      path,
      updatedAt: Number(doc.get("updatedAt") ?? 0),
      contentSeal: seal && typeof seal === "object" ? (seal as ContentSeal) : null,
    });
    return rows.length > input.limit;
  };
  for (const user of users.docs) {
    for (const collection of input.collections) {
      const docs = await db.collection(`users/${user.id}/${collection}`).orderBy(FieldPath.documentId()).get();
      for (const doc of docs.docs) {
        if (push(doc)) return { rows: rows.slice(0, input.limit), nextCursor: rows[input.limit]?.id ?? null };
      }
    }
  }
  return { rows, nextCursor: null };
}

/**
 * Checks the write fence immediately before the document transaction.
 * A checkpoint save after the batch does not authorise this write.
 * A lost acknowledgement is not counted as persisted.
 */
export async function persistMigratedSeal(
  db: Firestore,
  store: { assertWriteFence(expected: { runId: string; fence: number; now: number }): Promise<"open" | "lost"> },
  claim: { runId: string; fence: number; now: number },
  row: MigrationRow,
  seal: ContentSeal,
  afterCommit?: () => Promise<void>
): Promise<MigrationPersistResult> {
  if ((await store.assertWriteFence(claim)) !== "open") return "rejected";
  if (!row.path) return "rejected";
  const ref = db.doc(row.path);
  let committed = false;
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists || Number(snap.get("updatedAt")) !== row.updatedAt) {
        throw new Error("conflict");
      }
      tx.update(ref, { contentSeal: seal });
    });
    committed = true;
    if (afterCommit) await afterCommit();
    return "persisted";
  } catch (error) {
    if (!committed && error instanceof Error && error.message === "conflict") return "conflict";
    if (!committed) return "rejected";
    const after = await ref.get();
    const stored = after.get("contentSeal") as ContentSeal | undefined;
    if (stored && stored.v === seal.v && stored.keyId === seal.keyId && stored.ciphertext === seal.ciphertext) {
      return "unknown";
    }
    return "unknown";
  }
}

export async function runDurableMigration(input: {
  db: Firestore;
  scopeId: string;
  toKeyId: string;
  collections: readonly string[];
  runId: string;
  now: number;
  leaseMs: number;
  limit: number;
  resolveKey: (keyId: string) => Buffer | null;
  env?: NodeJS.ProcessEnv;
  afterCommit?: (row: MigrationRow) => Promise<void>;
}): Promise<
  | { status: "disabled" | "owned_by_other" | "claim_conflict" | "fence_lost" | "checkpoint_conflict"; cursor: string | null; complete: false }
  | { status: "stored"; cursor: string | null; complete: boolean; written: number; quarantined: string[]; unresolved: string[] }
> {
  const env = input.env ?? process.env;
  if (env.CONTENT_KEY_MIGRATION_ENABLED !== "true") {
    return { status: "disabled", cursor: null, complete: false };
  }
  const store = createFirestoreMigrationCheckpointStore(input.db, { scopeId: input.scopeId, toKeyId: input.toKeyId });
  const existing = await store.read();
  if (existing && existing.leaseUntil > input.now && existing.runId !== input.runId) {
    return { status: "owned_by_other", cursor: existing.cursor, complete: false };
  }
  const claimed: MigrationLease = {
    runId: input.runId,
    revision: (existing?.revision ?? 0) + 1,
    cursor: existing?.cursor ?? null,
    toKeyId: input.toKeyId,
    leaseUntil: input.now + input.leaseMs,
    conflicts: existing?.conflicts ?? [],
    fence: (existing?.fence ?? 0) + 1,
    scopeId: input.scopeId,
    quarantined: existing?.quarantined ?? [],
    unresolved: existing?.unresolved ?? [],
  };
  if ((await store.compareAndSet(existing?.revision ?? null, claimed)) !== "stored") {
    return { status: "claim_conflict", cursor: existing?.cursor ?? null, complete: false };
  }
  const page = await readMigrationPage(input.db, {
    collections: input.collections,
    cursor: claimed.cursor,
    limit: input.limit,
  });
  let fenceLost = false;
  const batch = await migrateContentKeyBatch({
    rows: page.rows,
    toKeyId: input.toKeyId,
    resolveKey: input.resolveKey,
    dryRun: false,
    writer: async (row, seal) => {
      if (fenceLost) return "rejected";
      const outcome = await persistMigratedSeal(
        input.db,
        store,
        { runId: claimed.runId, fence: claimed.fence, now: input.now },
        row,
        seal,
        input.afterCommit ? () => input.afterCommit!(row) : undefined
      );
      if (outcome === "rejected") fenceLost = true;
      return outcome;
    },
  });
  if (fenceLost && batch.written === 0 && batch.stopped === "rejected") {
    return { status: "fence_lost", cursor: claimed.cursor, complete: false };
  }
  const pageIds = new Set(page.rows.map((row) => row.id));
  const quarantined = [...claimed.quarantined.filter((id) => !pageIds.has(id)), ...batch.quarantined];
  const unresolved = [
    ...claimed.unresolved.filter((id) => !pageIds.has(id)),
    ...batch.unknown,
    ...batch.conflicts,
    ...batch.rejected,
  ];
  const nextCursor = batch.nextCursor ?? page.nextCursor;
  const saved = await store.compareAndSet(claimed.revision, {
    ...claimed,
    revision: claimed.revision + 1,
    cursor: nextCursor,
    conflicts: [...claimed.conflicts, ...batch.conflicts],
    quarantined,
    unresolved,
    leaseUntil: input.now + input.leaseMs,
  });
  if (saved !== "stored") return { status: "checkpoint_conflict", cursor: claimed.cursor, complete: false };
  return {
    status: "stored",
    cursor: nextCursor,
    complete: migrationMayComplete({ cursor: nextCursor, quarantined, unresolved }) && batch.stopped == null,
    written: batch.written,
    quarantined,
    unresolved,
  };
}
