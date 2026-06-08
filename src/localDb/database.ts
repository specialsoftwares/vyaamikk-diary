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
    db = SQLite.openDatabaseSync(DB_NAME);
  }
  return db;
}

export function closeLocalDatabaseForTests(): void {
  db = null;
}
