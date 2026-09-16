import { getLocalDatabase } from "@/localDb/database";
import { shortId } from "@/utils/id";

export type SyncOp = "create" | "update" | "delete";
export type SyncEntity = "entry" | "profile";

export interface SyncQueueItem {
  id: string;
  userId: string;
  op: SyncOp;
  entity: SyncEntity;
  entityId: string;
  payload: unknown;
  createdAt: number;
  attempts: number;
  lastError: string | null;
}

export function enqueueSync(
  item: Omit<SyncQueueItem, "id" | "createdAt" | "attempts" | "lastError">,
  options?: { replacePayload?: boolean }
): string {
  const db = getLocalDatabase();
  const dup = db.getFirstSync<{ id: string }>(
    `SELECT id FROM sync_queue
     WHERE user_id = ? AND entity = ? AND entity_id = ? AND op = ? LIMIT 1`,
    [item.userId, item.entity, item.entityId, item.op]
  );
  if (dup?.id) {
    if (options?.replacePayload) {
      db.runSync(
        `UPDATE sync_queue SET payload_json = ?, last_error = NULL WHERE id = ?`,
        [item.payload == null ? null : JSON.stringify(item.payload), dup.id]
      );
    }
    return dup.id;
  }

  const id = shortId("sync");
  db.runSync(
    `INSERT INTO sync_queue (id, user_id, op, entity, entity_id, payload_json, created_at, attempts, last_error)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL)`,
    [
      id,
      item.userId,
      item.op,
      item.entity,
      item.entityId,
      item.payload == null ? null : JSON.stringify(item.payload),
      Date.now(),
    ]
  );
  return id;
}

export const syncQueueRepository = {
  async enqueue(
    item: Omit<SyncQueueItem, "id" | "createdAt" | "attempts" | "lastError">,
    options?: { replacePayload?: boolean }
  ): Promise<string> {
    return enqueueSync(item, options);
  },

  async listForUser(userId: string, limit = 50): Promise<SyncQueueItem[]> {
    const db = getLocalDatabase();
    const rows = db.getAllSync<{
      id: string;
      user_id: string;
      op: string;
      entity: string;
      entity_id: string;
      payload_json: string | null;
      created_at: number;
      attempts: number;
      last_error: string | null;
    }>(
      `SELECT * FROM sync_queue WHERE user_id = ? ORDER BY created_at ASC LIMIT ?`,
      [userId, limit]
    );
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      op: r.op as SyncOp,
      entity: r.entity as SyncEntity,
      entityId: r.entity_id,
      payload: r.payload_json ? JSON.parse(r.payload_json) : null,
      createdAt: r.created_at,
      attempts: r.attempts,
      lastError: r.last_error,
    }));
  },

  async remove(id: string): Promise<void> {
    const db = getLocalDatabase();
    db.runSync("DELETE FROM sync_queue WHERE id = ?", [id]);
  },

  async removeForEntity(
    userId: string,
    entity: SyncEntity,
    entityId: string,
    op?: SyncOp
  ): Promise<void> {
    const db = getLocalDatabase();
    if (op) {
      db.runSync(
        `DELETE FROM sync_queue WHERE user_id = ? AND entity = ? AND entity_id = ? AND op = ?`,
        [userId, entity, entityId, op]
      );
      return;
    }
    db.runSync(
      `DELETE FROM sync_queue WHERE user_id = ? AND entity = ? AND entity_id = ?`,
      [userId, entity, entityId]
    );
  },

  async markAttempt(id: string, error: string | null): Promise<void> {
    const db = getLocalDatabase();
    db.runSync(
      `UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?`,
      [error, id]
    );
  },
};
