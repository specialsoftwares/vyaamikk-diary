import { MIGRATIONS_V1 } from "./schema";
import { execStatements, migrateToV7 } from "./migrate";
import { MemorySqlite, openMemorySqlite } from "./memorySqlite";
import { setLocalDatabaseForTests, closeLocalDatabaseForTests } from "./database";

export function installMemoryLocalDatabase(): MemorySqlite {
  const memory = openMemorySqlite();
  execStatements(memory as unknown as ReturnType<typeof import("./database").openLocalDatabase>, MIGRATIONS_V1, "v1");
  migrateToV7(memory as unknown as ReturnType<typeof import("./database").openLocalDatabase>);
  setLocalDatabaseForTests(memory);
  return memory;
}

export function uninstallMemoryLocalDatabase(): void {
  closeLocalDatabaseForTests();
}
