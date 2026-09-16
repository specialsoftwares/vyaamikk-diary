import type { openLocalDatabase } from "./database";

type Db = ReturnType<typeof openLocalDatabase>;

/** Run SQL statements one at a time (expo-sqlite is safer than multi-statement execSync). */
function stripLineComments(statement: string): string {
  return statement
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .trim();
}

export function execStatements(db: Db, sql: string, label: string): void {
  const parts = sql
    .split(";")
    .map((s) => stripLineComments(s))
    .filter((s) => s.length > 0);

  for (let i = 0; i < parts.length; i++) {
    const statement = parts[i];
    try {
      db.execSync(statement);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      throw new Error(`${label} step ${i + 1}/${parts.length}: ${err.message}`);
    }
  }
}

export function tableHasColumn(db: Db, table: string, column: string): boolean {
  const rows = db.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`);
  return rows.some((r) => r.name === column);
}

export function tableExists(db: Db, name: string): boolean {
  const row = db.getFirstSync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [name]
  );
  return Boolean(row?.name);
}

/** Idempotent V3 — safe when columns/indexes already exist. */
export function migrateToV3(db: Db): void {
  if (!tableHasColumn(db, "form_drafts", "title")) {
    db.execSync(`ALTER TABLE form_drafts ADD COLUMN title TEXT NOT NULL DEFAULT ''`);
  }
  if (!tableHasColumn(db, "form_drafts", "status")) {
    db.execSync(`ALTER TABLE form_drafts ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`);
  }
  if (!tableHasColumn(db, "form_drafts", "source")) {
    db.execSync(`ALTER TABLE form_drafts ADD COLUMN source TEXT NOT NULL DEFAULT 'recovery'`);
  }
  db.execSync("DROP INDEX IF EXISTS idx_form_drafts_scope");
  db.execSync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_form_drafts_recovery
      ON form_drafts (user_id, draft_kind, scope_key, COALESCE(entry_id, ''))
      WHERE source = 'recovery'
  `);
  db.execSync(`
    CREATE INDEX IF NOT EXISTS idx_form_drafts_user_active
      ON form_drafts (user_id, status, updated_at DESC)
  `);
}

export function migrateToV5(db: Db): void {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS master_data_suggestions (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      ueid TEXT NOT NULL,
      field_key TEXT NOT NULL,
      value TEXT NOT NULL,
      normalized_value TEXT NOT NULL,
      display_value TEXT NOT NULL,
      category TEXT NOT NULL,
      source_record_type TEXT,
      source_field TEXT,
      usage_count INTEGER NOT NULL DEFAULT 1,
      last_used_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      hidden_at INTEGER,
      metadata_json TEXT
    )
  `);
  db.execSync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_master_data_user_field_norm
      ON master_data_suggestions (user_id, field_key, normalized_value)
  `);
  db.execSync(`
    CREATE INDEX IF NOT EXISTS idx_master_data_user_field_prefix
      ON master_data_suggestions (user_id, field_key, normalized_value, last_used_at DESC)
  `);
}

export function migrateToV6(db: Db): void {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS business_insights (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      ueid TEXT NOT NULL,
      insight_kind TEXT NOT NULL,
      financial_year INTEGER NOT NULL,
      normalized_key TEXT NOT NULL,
      display_label TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      record_count INTEGER NOT NULL DEFAULT 0,
      last_used_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  db.execSync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_bi_user_kind_fy_key
      ON business_insights (user_id, insight_kind, financial_year, normalized_key)
  `);
  db.execSync(`
    CREATE INDEX IF NOT EXISTS idx_bi_user_fy_kind
      ON business_insights (user_id, financial_year, insight_kind, last_used_at DESC)
  `);
  db.execSync(`
    CREATE TABLE IF NOT EXISTS business_insight_links (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      insight_kind TEXT NOT NULL,
      normalized_key TEXT NOT NULL,
      financial_year INTEGER NOT NULL,
      source_record_type TEXT NOT NULL,
      source_record_id TEXT NOT NULL,
      record_date_ms INTEGER NOT NULL,
      metadata_json TEXT
    )
  `);
  db.execSync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_bi_link_source
      ON business_insight_links (user_id, source_record_type, source_record_id, insight_kind, normalized_key)
  `);
  db.execSync(`
    CREATE INDEX IF NOT EXISTS idx_bi_link_user_fy
      ON business_insight_links (user_id, financial_year, insight_kind)
  `);
}

export function migrateToV7(db: Db): void {
  if (!tableHasColumn(db, "entries_local", "pending_op")) {
    db.execSync(`ALTER TABLE entries_local ADD COLUMN pending_op TEXT`);
  }
  if (!tableHasColumn(db, "entries_local", "remote_confirmed")) {
    db.execSync(`ALTER TABLE entries_local ADD COLUMN remote_confirmed INTEGER NOT NULL DEFAULT 0`);
  }
  if (!tableHasColumn(db, "entries_local", "sync_error_code")) {
    db.execSync(`ALTER TABLE entries_local ADD COLUMN sync_error_code TEXT`);
  }
  if (!tableHasColumn(db, "entries_local", "auto_retry")) {
    db.execSync(`ALTER TABLE entries_local ADD COLUMN auto_retry INTEGER NOT NULL DEFAULT 1`);
  }
  db.execSync(`
    CREATE INDEX IF NOT EXISTS idx_entries_local_sync
      ON entries_local (user_id, remote_confirmed, auto_retry)
  `);
  // Legacy: synced rows are already server-accepted. Do not infer that from timestamps.
  db.execSync(`
    UPDATE entries_local
       SET remote_confirmed = 1
     WHERE sync_status = 'synced'
  `);
  // Legacy local_* pending rows are unsynced CREATEs; keep that identity.
  db.execSync(`
    UPDATE entries_local
       SET pending_op = 'create'
     WHERE pending_op IS NULL
       AND sync_status = 'pending'
       AND id LIKE 'local_%'
  `);
}

export function migrateToV4(db: Db): void {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS statutory_occurrences (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      template_id TEXT NOT NULL,
      due_date_key TEXT NOT NULL,
      due_date_ms INTEGER NOT NULL,
      reminder_offset_days INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      dismissed_at INTEGER,
      snoozed_until INTEGER,
      shown_at INTEGER,
      updated_at INTEGER NOT NULL
    )
  `);
  db.execSync(`
    CREATE INDEX IF NOT EXISTS idx_statutory_user_due
      ON statutory_occurrences (user_id, due_date_ms ASC)
  `);
}
