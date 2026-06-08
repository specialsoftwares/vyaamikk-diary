import { MIGRATIONS_V1, MIGRATIONS_V2, DB_VERSION } from "./schema";
import { openLocalDatabase } from "./database";
import { createLogger } from "@/utils/logger";
import {
  execStatements,
  migrateToV3,
  migrateToV4,
  migrateToV5,
  migrateToV6,
  tableExists,
  tableHasColumn,
} from "./migrate";

const log = createLogger("localDb");

let initPromise: Promise<void> | null = null;
let ready = false;
let initError: Error | null = null;

function readSchemaVersion(database: ReturnType<typeof openLocalDatabase>): number {
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
 * Must complete during splash/boot before auth routing or form entry.
 */
export function initializeLocalDatabase(): Promise<void> {
  if (ready) return Promise.resolve();
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const database = openLocalDatabase();
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
      // Legacy V1 index conflicts with V3+ multi-draft; drop if a previous boot recreated it.
      database.execSync("DROP INDEX IF EXISTS idx_form_drafts_scope");
      let version = readSchemaVersion(database);
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

      database.runSync(
        "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
        ["schema_version", String(DB_VERSION)]
      );
      ready = true;
      initError = null;
      log.info("initialized", { version: DB_VERSION });
    } catch (e) {
      initError = e instanceof Error ? e : new Error(String(e));
      log.error("init failed", { message: initError.message });
      initPromise = null;
      throw initError;
    }
  })();

  return initPromise;
}

export function isLocalDatabaseReady(): boolean {
  return ready;
}

export function getLocalDatabaseInitError(): Error | null {
  return initError;
}
