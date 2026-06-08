import type { BusinessEntry } from "@/domain/businessEntry";
import { getLocalDatabase } from "@/localDb/database";
import { shortId } from "@/utils/id";

export type LocalSyncStatus = "pending" | "synced" | "conflict" | "error";

export const localEntriesRepository = {
  async upsert(entry: BusinessEntry, syncStatus: LocalSyncStatus = "synced"): Promise<void> {
    const db = getLocalDatabase();
    db.runSync(
      `INSERT OR REPLACE INTO entries_local
       (id, user_id, payload_json, sync_status, local_updated_at, remote_updated_at, version_number)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.userId,
        JSON.stringify(entry),
        syncStatus,
        entry.updatedAt ?? Date.now(),
        entry.updatedAt ?? null,
        entry.documentHistory?.versionNumber ?? 1,
      ]
    );
  },

  async createPending(
    userId: string,
    build: (id: string) => BusinessEntry,
    preferredId?: string
  ): Promise<BusinessEntry> {
    const id = preferredId ?? `local_${shortId("entry")}`;
    const entry = build(id);
    await this.upsert(entry, "pending");
    return entry;
  },

  async getById(userId: string, id: string): Promise<BusinessEntry | null> {
    const db = getLocalDatabase();
    const row = db.getFirstSync<{ payload_json: string }>(
      "SELECT payload_json FROM entries_local WHERE user_id = ? AND id = ?",
      [userId, id]
    );
    if (!row) return null;
    try {
      return JSON.parse(row.payload_json) as BusinessEntry;
    } catch {
      return null;
    }
  },

  async listPending(userId: string): Promise<BusinessEntry[]> {
    const db = getLocalDatabase();
    const rows = db.getAllSync<{ payload_json: string }>(
      `SELECT payload_json FROM entries_local
       WHERE user_id = ? AND sync_status = 'pending' ORDER BY local_updated_at ASC`,
      [userId]
    );
    const out: BusinessEntry[] = [];
    for (const row of rows) {
      try {
        out.push(JSON.parse(row.payload_json) as BusinessEntry);
      } catch {
        // skip corrupt row
      }
    }
    return out;
  },

  async markSynced(entry: BusinessEntry): Promise<void> {
    await this.upsert(entry, "synced");
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
