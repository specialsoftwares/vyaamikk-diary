import { getLocalDatabase } from "@/localDb/database";
import type { StatutoryOccurrenceStatus, StatutoryReminderOffset } from "@/domain/statutoryInfo";

export interface StatutoryOccurrenceRow {
  id: string;
  userId: string;
  templateId: string;
  dueDateKey: string;
  dueDateMs: number;
  reminderOffsetDays: StatutoryReminderOffset;
  status: StatutoryOccurrenceStatus;
  dismissedAt: number | null;
  snoozedUntil: number | null;
  shownAt: number | null;
  updatedAt: number;
}

type DbRow = {
  id: string;
  user_id: string;
  template_id: string;
  due_date_key: string;
  due_date_ms: number;
  reminder_offset_days: number;
  status: string;
  dismissed_at: number | null;
  snoozed_until: number | null;
  shown_at: number | null;
  updated_at: number;
};

function rowToOccurrence(row: DbRow): StatutoryOccurrenceRow {
  return {
    id: row.id,
    userId: row.user_id,
    templateId: row.template_id,
    dueDateKey: row.due_date_key,
    dueDateMs: row.due_date_ms,
    reminderOffsetDays: row.reminder_offset_days as StatutoryReminderOffset,
    status: row.status as StatutoryOccurrenceStatus,
    dismissedAt: row.dismissed_at,
    snoozedUntil: row.snoozed_until,
    shownAt: row.shown_at,
    updatedAt: row.updated_at,
  };
}

export const statutoryInfoRepository = {
  async getById(userId: string, id: string): Promise<StatutoryOccurrenceRow | null> {
    const db = getLocalDatabase();
    const row = db.getFirstSync<DbRow>(
      `SELECT * FROM statutory_occurrences WHERE user_id = ? AND id = ?`,
      [userId, id]
    );
    return row ? rowToOccurrence(row) : null;
  },

  async listForUser(userId: string): Promise<StatutoryOccurrenceRow[]> {
    const db = getLocalDatabase();
    const rows = db.getAllSync<DbRow>(
      `SELECT * FROM statutory_occurrences WHERE user_id = ? ORDER BY due_date_ms ASC`,
      [userId]
    );
    return rows.map(rowToOccurrence);
  },

  async upsert(row: Omit<StatutoryOccurrenceRow, "updatedAt"> & { updatedAt?: number }): Promise<void> {
    const db = getLocalDatabase();
    const now = row.updatedAt ?? Date.now();
    db.runSync(
      `INSERT INTO statutory_occurrences (
        id, user_id, template_id, due_date_key, due_date_ms,
        reminder_offset_days, status, dismissed_at, snoozed_until, shown_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        dismissed_at = excluded.dismissed_at,
        snoozed_until = excluded.snoozed_until,
        shown_at = excluded.shown_at,
        updated_at = excluded.updated_at`,
      [
        row.id,
        row.userId,
        row.templateId,
        row.dueDateKey,
        row.dueDateMs,
        row.reminderOffsetDays,
        row.status,
        row.dismissedAt,
        row.snoozedUntil,
        row.shownAt,
        now,
      ]
    );
  },

  async markDismissed(userId: string, ids: string[]): Promise<void> {
    if (!ids.length) return;
    const db = getLocalDatabase();
    const now = Date.now();
    for (const id of ids) {
      db.runSync(
        `UPDATE statutory_occurrences SET status = 'dismissed', dismissed_at = ?, snoozed_until = NULL, updated_at = ?
         WHERE user_id = ? AND id = ?`,
        [now, now, userId, id]
      );
    }
  },

  async markSnoozed(userId: string, ids: string[], untilMs: number): Promise<void> {
    if (!ids.length) return;
    const db = getLocalDatabase();
    const now = Date.now();
    for (const id of ids) {
      db.runSync(
        `UPDATE statutory_occurrences SET status = 'snoozed', snoozed_until = ?, updated_at = ?
         WHERE user_id = ? AND id = ?`,
        [untilMs, now, userId, id]
      );
    }
  },

  async markShown(userId: string, ids: string[]): Promise<void> {
    if (!ids.length) return;
    const db = getLocalDatabase();
    const now = Date.now();
    for (const id of ids) {
      db.runSync(
        `UPDATE statutory_occurrences SET shown_at = ?, updated_at = ? WHERE user_id = ? AND id = ?`,
        [now, now, userId, id]
      );
    }
  },

  async clearExpiredSnoozes(userId: string, now: number = Date.now()): Promise<void> {
    const db = getLocalDatabase();
    db.runSync(
      `UPDATE statutory_occurrences SET status = 'pending', snoozed_until = NULL, updated_at = ?
       WHERE user_id = ? AND status = 'snoozed' AND snoozed_until IS NOT NULL AND snoozed_until <= ?`,
      [now, userId, now]
    );
  },
};
