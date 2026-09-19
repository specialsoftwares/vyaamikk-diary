import { DB_NAME } from "./schema";

type LocalSqlDb = {
  runSync: (sql: string, params?: unknown[]) => unknown;
  getFirstSync: <T>(sql: string, params?: unknown[]) => T | null;
  getAllSync: <T>(sql: string, params?: unknown[]) => T[];
  execSync: (sql: string) => void;
  withTransactionSync: (fn: () => void) => void;
};

let db: LocalSqlDb | null = null;

export function getLocalDatabase(): LocalSqlDb {
  if (!db) {
    throw new Error("Local database is not initialized. Call initializeLocalDatabase() first.");
  }
  return db;
}

export function openLocalDatabase(): LocalSqlDb {
  if (!db) {
    try {
      // Lazy: expo-sqlite pulls React Native and cannot load in Node tests.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const SQLite = require("expo-sqlite") as typeof import("expo-sqlite");
      db = SQLite.openDatabaseSync(DB_NAME) as unknown as LocalSqlDb;
    } catch (e) {
      db = null;
      throw e instanceof Error ? e : new Error(String(e));
    }
  }
  return db;
}

export function closeLocalDatabaseForTests(): void {
  db = null;
}

/** Node/CI seam — in-memory SQL stand-in. Not used on device. */
export function setLocalDatabaseForTests(database: LocalSqlDb): void {
  db = database;
}
