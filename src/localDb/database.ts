import * as SQLite from "expo-sqlite";

import { DB_NAME } from "./schema";

let db: SQLite.SQLiteDatabase | null = null;

export function getLocalDatabase(): SQLite.SQLiteDatabase {
  if (!db) {
    throw new Error("Local database is not initialized. Call initializeLocalDatabase() first.");
  }
  return db;
}

export function openLocalDatabase(): SQLite.SQLiteDatabase {
  if (!db) {
    try {
      db = SQLite.openDatabaseSync(DB_NAME);
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
