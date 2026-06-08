/** SQLite schema — single on-device source of truth for drafts, cache, and sync queue. */

export const DB_NAME = "vyaamikk_diary.db";
export const DB_VERSION = 6;

export const MIGRATIONS_V1 = `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS form_drafts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  draft_kind TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  entry_id TEXT,
  payload_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS entries_local (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  local_updated_at INTEGER NOT NULL,
  remote_updated_at INTEGER,
  version_number INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_entries_local_user
  ON entries_local (user_id, local_updated_at DESC);

CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  op TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload_json TEXT,
  created_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_user
  ON sync_queue (user_id, created_at ASC);

CREATE TABLE IF NOT EXISTS active_route (
  user_id TEXT PRIMARY KEY NOT NULL,
  href TEXT NOT NULL,
  params_json TEXT,
  updated_at INTEGER NOT NULL
);
`;

export const MIGRATIONS_V2 = `
CREATE TABLE IF NOT EXISTS pincode_cache (
  pin_code TEXT PRIMARY KEY NOT NULL,
  payload_json TEXT NOT NULL,
  cached_at INTEGER NOT NULL
);
`;

/** Multi-draft: user-saved drafts + single recovery slot per scope. */
export const MIGRATIONS_V3 = `
ALTER TABLE form_drafts ADD COLUMN title TEXT NOT NULL DEFAULT '';
ALTER TABLE form_drafts ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE form_drafts ADD COLUMN source TEXT NOT NULL DEFAULT 'recovery';
DROP INDEX IF EXISTS idx_form_drafts_scope;
CREATE UNIQUE INDEX IF NOT EXISTS idx_form_drafts_recovery
  ON form_drafts (user_id, draft_kind, scope_key, COALESCE(entry_id, ''))
  WHERE source = 'recovery';
CREATE INDEX IF NOT EXISTS idx_form_drafts_user_active
  ON form_drafts (user_id, status, updated_at DESC);
`;

/** Statutory information occurrence state (dismiss / snooze per reminder offset). */
export const MIGRATIONS_V4 = `
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
);

CREATE INDEX IF NOT EXISTS idx_statutory_user_due
  ON statutory_occurrences (user_id, due_date_ms ASC);
`;

/** Per-user private master data for form field suggestions (never shared across users). */
export const MIGRATIONS_V5 = `
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
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_master_data_user_field_norm
  ON master_data_suggestions (user_id, field_key, normalized_value);

CREATE INDEX IF NOT EXISTS idx_master_data_user_field_prefix
  ON master_data_suggestions (user_id, field_key, normalized_value, last_used_at DESC);
`;

/** User-scoped business insight aggregates (parties, PINs, cash links). */
export const MIGRATIONS_V6 = `
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
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bi_user_kind_fy_key
  ON business_insights (user_id, insight_kind, financial_year, normalized_key);

CREATE INDEX IF NOT EXISTS idx_bi_user_fy_kind
  ON business_insights (user_id, financial_year, insight_kind, last_used_at DESC);

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
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bi_link_source
  ON business_insight_links (user_id, source_record_type, source_record_id, insight_kind, normalized_key);

CREATE INDEX IF NOT EXISTS idx_bi_link_user_fy
  ON business_insight_links (user_id, financial_year, insight_kind);
`;
