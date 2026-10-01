/**
 * Production local-database migration orchestrator.
 * Called by `initializeLocalDatabase` and by SQLITE_HOST tests.
 * Do not copy this sequence into tests.
 */

import { MIGRATIONS_V1, MIGRATIONS_V2, DB_VERSION } from "./schema";
import type { openLocalDatabase } from "./database";
import { createLogger } from "@/utils/logger";
import {
  execStatements,
  migrateToV3,
  migrateToV4,
  migrateToV5,
  migrateToV6,
  migrateToV7,
  migrateToV8,
  migrateToV9,
  tableExists,
  tableHasColumn,
} from "./migrate";
import { grinV10TablesPresent, migrateToV10 } from "./migrateGrin";

const log = createLogger("localDb");

export type LocalMigrationDb = ReturnType<typeof openLocalDatabase>;

export function readLocalSchemaVersion(database: LocalMigrationDb): number {
  try {
    const row = database.getFirstSync<{ value: string }>(
      "SELECT value FROM meta WHERE key = ?",
      ["schema_version"]
    );
    return row ? parseInt(row.value, 10) || 1 : 1;
  } catch {
    return 1;
  }
}

/**
 * Apply v1–v10 (including GRIN) and partial-schema repairs.
 * Does not mark the splash initializer ready. Throws if GRIN v10 tables are
 * still missing after migrateToV10 so schema_version is not stored as success.
 */
export function applyPendingLocalMigrations(database: LocalMigrationDb): number {
  execStatements(database, MIGRATIONS_V1, "v1");
  if (!tableExists(database, "entries_local")) {
    database.execSync(`
          CREATE TABLE IF NOT EXISTS entries_local (
            id TEXT PRIMARY KEY NOT NULL,
            user_id TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            sync_status TEXT NOT NULL DEFAULT 'pending',
            local_updated_at INTEGER NOT NULL,
            remote_updated_at INTEGER,
            version_number INTEGER NOT NULL DEFAULT 1
          )
        `);
    database.execSync(`
          CREATE INDEX IF NOT EXISTS idx_entries_local_user
            ON entries_local (user_id, local_updated_at DESC)
        `);
    log.warn("repaired missing entries_local table");
  }
  database.execSync("DROP INDEX IF EXISTS idx_form_drafts_scope");
  let version = readLocalSchemaVersion(database);
  if (version < 2) {
    execStatements(database, MIGRATIONS_V2, "v2");
    version = 2;
  }
  if (version < 3) {
    migrateToV3(database);
    version = 3;
  }
  if (version < 4) {
    migrateToV4(database);
    version = 4;
  }
  if (version < 5) {
    migrateToV5(database);
    version = 5;
  }
  if (version < 6) {
    migrateToV6(database);
    version = 6;
  }
  if (version < 7) {
    migrateToV7(database);
    version = 7;
  }
  if (version < 8) {
    migrateToV8(database);
    version = 8;
  }
  if (version < 9) {
    migrateToV9(database);
    version = 9;
  }
  if (version < 10) {
    migrateToV10(database);
    version = 10;
  }

  if (version >= 3 && !tableHasColumn(database, "form_drafts", "source")) {
    migrateToV3(database);
  }
  if (version >= 4 && !tableExists(database, "statutory_occurrences")) {
    migrateToV4(database);
  }
  if (version >= 5 && !tableExists(database, "master_data_suggestions")) {
    migrateToV5(database);
  }
  if (version >= 6 && !tableExists(database, "business_insights")) {
    migrateToV6(database);
  }
  if (version >= 7 && tableExists(database, "entries_local") && !tableHasColumn(database, "entries_local", "remote_confirmed")) {
    migrateToV7(database);
  }
  if (
    version >= 8 &&
    tableExists(database, "entries_local") &&
    !tableHasColumn(database, "entries_local", "local_revision")
  ) {
    migrateToV8(database);
  }
  if (
    version >= 9 &&
    tableExists(database, "entries_local") &&
    !tableHasColumn(database, "entries_local", "origin_revision")
  ) {
    migrateToV9(database);
  }
  if (version >= 10 && !grinV10TablesPresent(database)) {
    migrateToV10(database);
  }

  if (DB_VERSION >= 10 && !grinV10TablesPresent(database)) {
    throw new Error("grin_v10_tables_missing");
  }

  database.runSync("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", [
    "schema_version",
    String(DB_VERSION),
  ]);
  return DB_VERSION;
}
