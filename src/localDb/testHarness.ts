import { MIGRATIONS_V1 } from "./schema";
import { execStatements, migrateToV7, migrateToV8 } from "./migrate";
import { cloneMemorySqlite, MemorySqlite, openMemorySqlite } from "./memorySqlite";
import { setLocalDatabaseForTests, closeLocalDatabaseForTests } from "./database";

function applyDiaryTestMigrations(memory: MemorySqlite): void {
  execStatements(memory as unknown as ReturnType<typeof import("./database").openLocalDatabase>, MIGRATIONS_V1, "v1");
  migrateToV7(memory as unknown as ReturnType<typeof import("./database").openLocalDatabase>);
  migrateToV8(memory as unknown as ReturnType<typeof import("./database").openLocalDatabase>);
}

export function installMemoryLocalDatabase(): MemorySqlite {
  const memory = openMemorySqlite();
  applyDiaryTestMigrations(memory);
  setLocalDatabaseForTests(memory);
  return memory;
}

/**
 * Replace the installed database with a fresh MemorySqlite instance loaded
 * from `source`'s persisted tables. Not a same-instance re-read.
 */
export function reopenMemoryLocalDatabaseFrom(source: MemorySqlite): MemorySqlite {
  const next = cloneMemorySqlite(source);
  setLocalDatabaseForTests(next);
  return next;
}

export function uninstallMemoryLocalDatabase(): void {
  closeLocalDatabaseForTests();
}
