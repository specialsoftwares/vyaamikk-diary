import type { BusinessEntry } from "@/domain/businessEntry";
import { getLocalDatabase } from "@/localDb/database";
import { shortId } from "@/utils/id";

export type LocalSyncStatus = "pending" | "synced" | "conflict" | "error";
export type PendingOp = "create" | "update" | "delete";

export interface LocalEntrySyncMeta {
  syncStatus: LocalSyncStatus;
  pendingOp: PendingOp | null;
  remoteConfirmed: boolean;
  syncErrorCode: string | null;
  autoRetry: boolean;
  localUpdatedAt: number;
  localRevision: number;
  ackedRevision: number;
}

export interface LocalEntryRecord {
  entry: BusinessEntry;
  meta: LocalEntrySyncMeta;
}

export interface UpsertLocalEntryOptions {
  syncStatus: LocalSyncStatus;
  pendingOp?: PendingOp | null;
  remoteConfirmed?: boolean;
  syncErrorCode?: string | null;
  autoRetry?: boolean;
  localRevision?: number;
  ackedRevision?: number;
  bumpRevision?: boolean;
  /** When true, unspecified meta fields keep the existing row's values. */
  preserveUnspecifiedMeta?: boolean;
}

function boolInt(v: boolean | undefined, fallback: number): number {
  if (v === undefined) return fallback;
  return v ? 1 : 0;
}

function parsePendingOp(raw: unknown): PendingOp | null {
  return raw === "create" || raw === "update" || raw === "delete" ? raw : null;
}

function parseSyncStatus(raw: unknown): LocalSyncStatus {
  if (raw === "synced" || raw === "conflict" || raw === "error" || raw === "pending") return raw;
  return "pending";
}

function parseRow(row: {
  payload_json: string;
  sync_status?: string;
  pending_op?: string | null;
  remote_confirmed?: number | null;
  sync_error_code?: string | null;
  auto_retry?: number | null;
  local_updated_at?: number;
  local_revision?: number | null;
  acked_revision?: number | null;
}): LocalEntryRecord | null {
  try {
    const entry = JSON.parse(row.payload_json) as BusinessEntry;
    return {
      entry,
      meta: {
        syncStatus: parseSyncStatus(row.sync_status),
        pendingOp: parsePendingOp(row.pending_op),
        remoteConfirmed: Number(row.remote_confirmed) === 1,
        syncErrorCode: row.sync_error_code ?? null,
        autoRetry: row.auto_retry == null ? true : Number(row.auto_retry) === 1,
        localUpdatedAt: Number(row.local_updated_at ?? entry.updatedAt ?? 0),
        localRevision: Number(row.local_revision ?? 0),
        ackedRevision: Number(row.acked_revision ?? 0),
      },
    };
  } catch {
    return null;
  }
}

const ENTRY_SELECT = `payload_json, sync_status, pending_op, remote_confirmed, sync_error_code, auto_retry, local_updated_at, local_revision, acked_revision`;

export function readLocalEntryRecordSync(userId: string, id: string): LocalEntryRecord | null {
  const db = getLocalDatabase();
  const row = db.getFirstSync<{
    payload_json: string;
    sync_status: string;
    pending_op: string | null;
    remote_confirmed: number | null;
    sync_error_code: string | null;
    auto_retry: number | null;
    local_updated_at: number;
    local_revision: number | null;
    acked_revision: number | null;
  }>(
    `SELECT ${ENTRY_SELECT}
       FROM entries_local WHERE user_id = ? AND id = ?`,
    [userId, id]
  );
  if (!row) return null;
  return parseRow(row);
}

export function writeLocalEntryRowSync(
  entry: BusinessEntry,
  options: UpsertLocalEntryOptions,
  existing: LocalEntryRecord | null
): void {
  const db = getLocalDatabase();
  const meta = existing?.meta;
  const pendingOp =
    options.pendingOp !== undefined
      ? options.pendingOp
      : options.preserveUnspecifiedMeta
        ? (meta?.pendingOp ?? null)
        : null;
  const remoteConfirmed =
    options.remoteConfirmed !== undefined
      ? options.remoteConfirmed
      : options.preserveUnspecifiedMeta
        ? (meta?.remoteConfirmed ?? false)
        : false;
  const syncErrorCode =
    options.syncErrorCode !== undefined
      ? options.syncErrorCode
      : options.preserveUnspecifiedMeta
        ? (meta?.syncErrorCode ?? null)
        : null;
  const autoRetry =
    options.autoRetry !== undefined
      ? options.autoRetry
      : options.preserveUnspecifiedMeta
        ? (meta?.autoRetry ?? true)
        : true;
  const localRevision =
    options.localRevision !== undefined
      ? options.localRevision
      : options.bumpRevision
        ? (meta?.localRevision ?? 0) + 1
        : options.preserveUnspecifiedMeta
          ? (meta?.localRevision ?? 0)
          : (meta?.localRevision ?? 0);
  const ackedRevision =
    options.ackedRevision !== undefined
      ? options.ackedRevision
      : options.preserveUnspecifiedMeta
        ? (meta?.ackedRevision ?? 0)
        : (meta?.ackedRevision ?? 0);
  db.runSync(
    `INSERT OR REPLACE INTO entries_local
     (id, user_id, payload_json, sync_status, local_updated_at, remote_updated_at, version_number,
      pending_op, remote_confirmed, sync_error_code, auto_retry, local_revision, acked_revision)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.id,
      entry.userId,
      JSON.stringify(entry),
      options.syncStatus,
      entry.updatedAt ?? Date.now(),
      remoteConfirmed ? (entry.updatedAt ?? Date.now()) : null,
      entry.documentHistory?.versionNumber ?? 1,
      pendingOp,
      boolInt(remoteConfirmed, 0),
      syncErrorCode,
      boolInt(autoRetry, 1),
      localRevision,
      ackedRevision,
    ]
  );
}

export const localEntriesRepository = {
  async getRecord(userId: string, id: string): Promise<LocalEntryRecord | null> {
    return readLocalEntryRecordSync(userId, id);
  },

  async upsert(entry: BusinessEntry, syncStatus: LocalSyncStatus = "synced"): Promise<void> {
    await this.upsertWithMeta(entry, {
      syncStatus,
      pendingOp: syncStatus === "synced" ? null : undefined,
      remoteConfirmed: syncStatus === "synced" ? true : undefined,
      syncErrorCode: syncStatus === "synced" ? null : undefined,
      autoRetry: syncStatus === "synced" ? true : undefined,
      ackedRevision: syncStatus === "synced" ? undefined : undefined,
      preserveUnspecifiedMeta: true,
    });
  },

  async upsertWithMeta(entry: BusinessEntry, options: UpsertLocalEntryOptions): Promise<void> {
    const existing = readLocalEntryRecordSync(entry.userId, entry.id);
    const syncedAck =
      options.syncStatus === "synced" && options.ackedRevision === undefined
        ? (options.localRevision ?? existing?.meta.localRevision ?? 0)
        : options.ackedRevision;
    writeLocalEntryRowSync(
      entry,
      syncedAck !== undefined && options.syncStatus === "synced"
        ? { ...options, ackedRevision: syncedAck }
        : options,
      existing
    );
  },

  async createPending(
    userId: string,
    build: (id: string) => BusinessEntry,
    preferredId?: string
  ): Promise<BusinessEntry> {
    const id = preferredId ?? `local_${shortId("entry")}`;
    const entry = build(id);
    writeLocalEntryRowSync(
      entry,
      {
        syncStatus: "pending",
        pendingOp: "create",
        remoteConfirmed: false,
        syncErrorCode: null,
        autoRetry: true,
        localRevision: 1,
        ackedRevision: 0,
      },
      null
    );
    return entry;
  },

  async getById(userId: string, id: string): Promise<BusinessEntry | null> {
    return readLocalEntryRecordSync(userId, id)?.entry ?? null;
  },

  async listPending(userId: string): Promise<BusinessEntry[]> {
    const records = await this.listUnsyncedRecords(userId);
    return records.filter((r) => r.meta.syncStatus === "pending").map((r) => r.entry);
  },

  async listUnsyncedRecords(userId: string): Promise<LocalEntryRecord[]> {
    const db = getLocalDatabase();
    const rows = db.getAllSync<{
      payload_json: string;
      sync_status: string;
      pending_op: string | null;
      remote_confirmed: number | null;
      sync_error_code: string | null;
      auto_retry: number | null;
      local_updated_at: number;
      local_revision: number | null;
      acked_revision: number | null;
    }>(
      `SELECT ${ENTRY_SELECT}
         FROM entries_local
        WHERE user_id = ? AND (remote_confirmed = 0 OR sync_status != 'synced')
        ORDER BY local_updated_at ASC`,
      [userId]
    );
    const out: LocalEntryRecord[] = [];
    for (const row of rows) {
      const parsed = parseRow(row);
      if (parsed) out.push(parsed);
    }
    return out;
  },

  async markSynced(entry: BusinessEntry): Promise<void> {
    const existing = readLocalEntryRecordSync(entry.userId, entry.id);
    const revision = existing?.meta.localRevision ?? 0;
    writeLocalEntryRowSync(
      entry,
      {
        syncStatus: "synced",
        pendingOp: null,
        remoteConfirmed: true,
        syncErrorCode: null,
        autoRetry: true,
        localRevision: revision,
        ackedRevision: revision,
      },
      existing
    );
  },

  async markRemoteConfirmedKeepLocal(
    userId: string,
    id: string,
    nextPendingOp: PendingOp | null
  ): Promise<void> {
    const record = readLocalEntryRecordSync(userId, id);
    if (!record) return;
    writeLocalEntryRowSync(
      record.entry,
      {
        syncStatus: nextPendingOp ? "pending" : "synced",
        pendingOp: nextPendingOp,
        remoteConfirmed: true,
        syncErrorCode: null,
        autoRetry: true,
      },
      record
    );
  },

  async suspendAutoRetry(userId: string, id: string, errorCode: string): Promise<void> {
    const record = readLocalEntryRecordSync(userId, id);
    if (!record) return;
    writeLocalEntryRowSync(
      record.entry,
      {
        syncStatus: "error",
        pendingOp: record.meta.pendingOp,
        remoteConfirmed: record.meta.remoteConfirmed,
        syncErrorCode: errorCode,
        autoRetry: false,
        preserveUnspecifiedMeta: true,
      },
      record
    );
  },

  async enableAutoRetry(userId: string, id: string): Promise<void> {
    const record = readLocalEntryRecordSync(userId, id);
    if (!record) return;
    writeLocalEntryRowSync(
      record.entry,
      {
        syncStatus: "pending",
        pendingOp: record.meta.pendingOp,
        remoteConfirmed: record.meta.remoteConfirmed,
        syncErrorCode: null,
        autoRetry: true,
      },
      record
    );
  },

  async removeById(userId: string, id: string): Promise<void> {
    const db = getLocalDatabase();
    db.runSync("DELETE FROM entries_local WHERE user_id = ? AND id = ?", [userId, id]);
  },

  async countForUser(userId: string): Promise<number> {
    const db = getLocalDatabase();
    const row = db.getFirstSync<{ c: number }>(
      "SELECT COUNT(*) as c FROM entries_local WHERE user_id = ?",
      [userId]
    );
    return row?.c ?? 0;
  },

  /**
   * Count entries that carry a stored map footprint (GPS or legacy geo
   * object). Null locations serialise as `"gps":null`, so the `{` guard only
   * matches real coordinate objects.
   */
  async countMapPinsForUser(userId: string): Promise<number> {
    const db = getLocalDatabase();
    const row = db.getFirstSync<{ c: number }>(
      `SELECT COUNT(*) as c FROM entries_local
       WHERE user_id = ?
         AND (payload_json LIKE '%"gps":{%' OR payload_json LIKE '%"geo":{%')`,
      [userId]
    );
    return row?.c ?? 0;
  },
};
