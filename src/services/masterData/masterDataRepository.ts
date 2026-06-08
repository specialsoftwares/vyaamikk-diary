import { getLocalDatabase } from "@/localDb/database";
import { shortId } from "@/utils/id";

import { categoryForFieldKey, queryKeysForFieldKey } from "./fieldKeys";
import {
  displayMasterValue,
  isJunkMasterValue,
  normalizeMasterValue,
} from "./normalize";
import type {
  MasterDataQueryInput,
  MasterDataSuggestion,
  MasterDataUpsertInput,
  MasterDataUserScope,
  MasterFieldKey,
} from "./types";

type Row = {
  id: string;
  user_id: string;
  ueid: string;
  field_key: string;
  value: string;
  normalized_value: string;
  display_value: string;
  category: string;
  source_record_type: string | null;
  source_field: string | null;
  usage_count: number;
  last_used_at: number;
  created_at: number;
  updated_at: number;
  hidden_at: number | null;
  metadata_json: string | null;
};

function assertScope(scope: MasterDataUserScope): void {
  if (!scope.userId?.trim() || !scope.ueid?.trim()) {
    throw new Error("Master data requires authenticated user scope.");
  }
}

function rowToSuggestion(row: Row): MasterDataSuggestion {
  let metadata: Record<string, string> | null = null;
  if (row.metadata_json) {
    try {
      metadata = JSON.parse(row.metadata_json) as Record<string, string>;
    } catch {
      metadata = null;
    }
  }
  return {
    id: row.id,
    userId: row.user_id,
    ueid: row.ueid,
    fieldKey: row.field_key as MasterFieldKey,
    value: row.value,
    normalizedValue: row.normalized_value,
    displayValue: row.display_value,
    category: row.category as MasterDataSuggestion["category"],
    sourceRecordType: row.source_record_type,
    sourceField: row.source_field,
    usageCount: row.usage_count,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    hiddenAt: row.hidden_at,
    metadata,
  };
}

/** Cleared on logout / user switch so no stale suggestions linger in memory. */
let sessionUserId: string | null = null;

export function clearMasterDataSessionCache(): void {
  sessionUserId = null;
}

export function setMasterDataSessionUser(userId: string | null): void {
  sessionUserId = userId;
}

function verifySessionScope(scope: MasterDataUserScope): boolean {
  if (!sessionUserId) {
    sessionUserId = scope.userId;
    return true;
  }
  return sessionUserId === scope.userId;
}

export const masterDataRepository = {
  async query(input: MasterDataQueryInput): Promise<MasterDataSuggestion[]> {
    assertScope(input.scope);
    if (!verifySessionScope(input.scope)) return [];

    const prefix = input.prefix.trim();
    if (prefix.length < 1) return [];

    const normalizedPrefix = normalizeMasterValue(input.fieldKey, prefix);
    const keys = queryKeysForFieldKey(input.fieldKey);
    const limit = Math.min(Math.max(input.limit ?? 5, 1), 8);
    const placeholders = keys.map(() => "?").join(", ");

    const db = getLocalDatabase();
    const rows = db.getAllSync<Row>(
      `SELECT * FROM master_data_suggestions
       WHERE user_id = ?
         AND field_key IN (${placeholders})
         AND hidden_at IS NULL
         AND normalized_value LIKE ? ESCAPE '\\'
       ORDER BY
         CASE WHEN normalized_value = ? THEN 0
              WHEN normalized_value LIKE ? ESCAPE '\\' THEN 1
              ELSE 2 END,
         usage_count DESC,
         last_used_at DESC
       LIMIT ?`,
      [
        input.scope.userId,
        ...keys,
        `${escapeLike(normalizedPrefix)}%`,
        normalizedPrefix,
        `${escapeLike(normalizedPrefix)}%`,
        limit,
      ]
    );

    const seen = new Set<string>();
    const out: MasterDataSuggestion[] = [];
    for (const row of rows) {
      const key = `${row.field_key}:${row.normalized_value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(rowToSuggestion(row));
      if (out.length >= limit) break;
    }
    return out;
  },

  async upsert(input: MasterDataUpsertInput): Promise<void> {
    assertScope(input.scope);
    if (!verifySessionScope(input.scope)) return;

    const raw = input.value.trim();
    if (!raw) return;

    const fieldKey = input.fieldKey;
    const normalized = normalizeMasterValue(fieldKey, raw);
    const display = displayMasterValue(fieldKey, raw);

    const db = getLocalDatabase();
    const existing = db.getFirstSync<Row>(
      `SELECT * FROM master_data_suggestions
       WHERE user_id = ? AND field_key = ? AND normalized_value = ?`,
      [input.scope.userId, fieldKey, normalized]
    );

    if (isJunkMasterValue(raw)) {
      if (!existing || existing.usage_count < 2) return;
    }

    const now = Date.now();
    if (existing) {
      db.runSync(
        `UPDATE master_data_suggestions SET
          value = ?,
          display_value = ?,
          usage_count = usage_count + 1,
          last_used_at = ?,
          updated_at = ?,
          hidden_at = NULL,
          source_record_type = COALESCE(?, source_record_type),
          source_field = COALESCE(?, source_field),
          ueid = ?
         WHERE id = ? AND user_id = ?`,
        [
          raw,
          display,
          now,
          now,
          input.sourceRecordType ?? null,
          input.sourceField ?? null,
          input.scope.ueid,
          existing.id,
          input.scope.userId,
        ]
      );
      return;
    }

    const id = shortId("mds");
    db.runSync(
      `INSERT INTO master_data_suggestions (
        id, user_id, ueid, field_key, value, normalized_value, display_value,
        category, source_record_type, source_field, usage_count, last_used_at,
        created_at, updated_at, hidden_at, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, NULL, NULL)`,
      [
        id,
        input.scope.userId,
        input.scope.ueid,
        fieldKey,
        raw,
        normalized,
        display,
        categoryForFieldKey(fieldKey),
        input.sourceRecordType ?? null,
        input.sourceField ?? null,
        now,
        now,
        now,
      ]
    );
  },

  /** Top suggestions by usage for insights (empty prefix = all values for field). */
  async listTopByField(
    scope: MasterDataUserScope,
    fieldKey: MasterFieldKey,
    limit = 5
  ): Promise<MasterDataSuggestion[]> {
    assertScope(scope);
    if (!verifySessionScope(scope)) return [];
    const cap = Math.min(Math.max(limit, 1), 12);
    const db = getLocalDatabase();
    const rows = db.getAllSync<Row>(
      `SELECT * FROM master_data_suggestions
       WHERE user_id = ? AND field_key = ? AND hidden_at IS NULL
       ORDER BY usage_count DESC, last_used_at DESC
       LIMIT ?`,
      [scope.userId, fieldKey, cap]
    );
    return rows.map(rowToSuggestion);
  },

  async hide(scope: MasterDataUserScope, suggestionId: string): Promise<void> {
    assertScope(scope);
    if (!verifySessionScope(scope)) return;
    const db = getLocalDatabase();
    db.runSync(
      `UPDATE master_data_suggestions SET hidden_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      [Date.now(), Date.now(), suggestionId, scope.userId]
    );
  },

  /** Drop usage contributed by one deleted record; remove row when count reaches zero. */
  async decrementUsage(
    scope: MasterDataUserScope,
    fieldKey: MasterFieldKey,
    normalizedValue: string
  ): Promise<void> {
    assertScope(scope);
    if (!verifySessionScope(scope)) return;

    const db = getLocalDatabase();
    const existing = db.getFirstSync<Row>(
      `SELECT * FROM master_data_suggestions
       WHERE user_id = ? AND field_key = ? AND normalized_value = ?`,
      [scope.userId, fieldKey, normalizedValue]
    );
    if (!existing) return;

    const nextCount = existing.usage_count - 1;
    if (nextCount <= 0) {
      db.runSync(
        "DELETE FROM master_data_suggestions WHERE id = ? AND user_id = ?",
        [existing.id, scope.userId]
      );
      return;
    }

    db.runSync(
      `UPDATE master_data_suggestions SET usage_count = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      [nextCount, Date.now(), existing.id, scope.userId]
    );
  },

  purgeUser(userId: string): void {
    const db = getLocalDatabase();
    db.runSync("DELETE FROM master_data_suggestions WHERE user_id = ?", [userId]);
    if (sessionUserId === userId) sessionUserId = null;
  },
};

function escapeLike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
