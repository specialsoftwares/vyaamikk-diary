/**
 * GRIN SQLite v10 tables. Team 3 owned.
 *
 * Coordinator wires a single call from `init.ts` after v9 and bumps `DB_VERSION`
 * in `schema.ts` to 10. This module does not write `meta.schema_version` and
 * does not alter diary tables (`entries_local`, `sync_queue`, `form_drafts`, …).
 *
 * Single-column primary keys so a later MemorySqlite wiring stays parseable.
 * Unique owner+ledger+id constraints are indexes (enforced on SQLITE_HOST /
 * expo-sqlite; MemorySqlite ignores CREATE INDEX).
 *
 * Do not bump DB_VERSION for additive v10 columns. Existing v10 files get
 * `ALTER TABLE ... ADD COLUMN` here (idempotent via tableHasColumn).
 */

import type { openLocalDatabase } from "./database";
import { execStatements, tableExists, tableHasColumn } from "./migrate";

type Db = ReturnType<typeof openLocalDatabase>;

/** Target schema version for coordinator `DB_VERSION`. Not applied until init wires it. */
export const GRIN_DB_TARGET_VERSION = 10;

export const GRIN_V10_INDEXES = [
  "idx_grin_receipts_identity",
  "idx_grin_receipts_command",
  "idx_grin_receipts_owner_state",
  "idx_grin_outbox_command_identity",
  "idx_grin_outbox_dispatch",
  "idx_grin_evidence_identity",
  "idx_grin_evidence_receipt",
] as const;

export const GRIN_MIGRATIONS_V10 = `
CREATE TABLE IF NOT EXISTS grin_local_receipts (
  id TEXT PRIMARY KEY NOT NULL,
  owner_uid TEXT NOT NULL,
  ledger_id TEXT NOT NULL,
  receipt_id TEXT NOT NULL,
  command_id TEXT NOT NULL,
  digest TEXT,
  local_state TEXT NOT NULL,
  issued_number TEXT,
  server_registered_at_utc TEXT,
  dispatch_generation INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grin_receipts_identity
  ON grin_local_receipts (owner_uid, ledger_id, receipt_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grin_receipts_command
  ON grin_local_receipts (owner_uid, ledger_id, command_id);

CREATE INDEX IF NOT EXISTS idx_grin_receipts_owner_state
  ON grin_local_receipts (owner_uid, local_state, updated_at);

CREATE TABLE IF NOT EXISTS grin_outbox_commands (
  id TEXT PRIMARY KEY NOT NULL,
  owner_uid TEXT NOT NULL,
  ledger_id TEXT NOT NULL,
  command_id TEXT NOT NULL,
  receipt_id TEXT NOT NULL,
  command_type TEXT NOT NULL,
  digest TEXT NOT NULL,
  frozen_payload_json TEXT NOT NULL,
  local_state TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  last_error_code TEXT,
  last_error_actionable TEXT,
  lease_worker_id TEXT,
  lease_generation INTEGER,
  lease_until_ms INTEGER,
  lease_attempt_id TEXT,
  dispatch_generation INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grin_outbox_command_identity
  ON grin_outbox_commands (owner_uid, ledger_id, command_id);

CREATE INDEX IF NOT EXISTS idx_grin_outbox_dispatch
  ON grin_outbox_commands (owner_uid, local_state, created_at);

CREATE TABLE IF NOT EXISTS grin_owner_runtime (
  owner_uid TEXT PRIMARY KEY NOT NULL,
  dispatch_generation INTEGER NOT NULL DEFAULT 0,
  session_active INTEGER NOT NULL DEFAULT 0,
  retirement_hold INTEGER NOT NULL DEFAULT 0,
  retirement_at INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS grin_local_evidence_files (
  id TEXT PRIMARY KEY NOT NULL,
  owner_uid TEXT NOT NULL,
  ledger_id TEXT NOT NULL,
  receipt_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  role TEXT NOT NULL,
  local_path TEXT NOT NULL,
  claimed_sha256 TEXT,
  byte_size INTEGER,
  category TEXT,
  upload_state TEXT NOT NULL,
  original_durable INTEGER NOT NULL DEFAULT 0,
  retain_local INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grin_evidence_identity
  ON grin_local_evidence_files (owner_uid, ledger_id, evidence_id, role);

CREATE INDEX IF NOT EXISTS idx_grin_evidence_receipt
  ON grin_local_evidence_files (owner_uid, ledger_id, receipt_id);
`;

function grinIndexExists(db: Db, name: string): boolean {
  const row = db.getFirstSync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?",
    [name]
  );
  return Boolean(row?.name);
}

/**
 * Idempotent. Safe to call when tables already exist. Does not bump diary schema_version.
 * Additive columns for existing v10 files use ALTER ADD COLUMN (not a DB_VERSION bump).
 */
export function migrateToV10(db: Db): void {
  execStatements(db, GRIN_MIGRATIONS_V10, "v10-grin");
  if (
    tableExists(db, "grin_local_evidence_files") &&
    !tableHasColumn(db, "grin_local_evidence_files", "category")
  ) {
    db.execSync("ALTER TABLE grin_local_evidence_files ADD COLUMN category TEXT");
  }
  if (
    tableExists(db, "grin_outbox_commands") &&
    !tableHasColumn(db, "grin_outbox_commands", "lease_attempt_id")
  ) {
    db.execSync("ALTER TABLE grin_outbox_commands ADD COLUMN lease_attempt_id TEXT");
  }
}

/**
 * Incomplete when any required table, additive v10 column, or named index is missing.
 * Coordinator `applyPendingLocalMigrations` re-runs `migrateToV10` when this is false.
 */
export function grinV10TablesPresent(db: Db): boolean {
  if (
    !tableExists(db, "grin_local_receipts") ||
    !tableExists(db, "grin_outbox_commands") ||
    !tableExists(db, "grin_owner_runtime") ||
    !tableExists(db, "grin_local_evidence_files")
  ) {
    return false;
  }
  if (!tableHasColumn(db, "grin_local_evidence_files", "category")) return false;
  if (!tableHasColumn(db, "grin_outbox_commands", "lease_attempt_id")) return false;
  return GRIN_V10_INDEXES.every((name) => grinIndexExists(db, name));
}
