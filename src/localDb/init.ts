import { DB_VERSION } from "./schema";
import { openLocalDatabase } from "./database";
import { createLogger } from "@/utils/logger";
import { applyPendingLocalMigrations } from "./applyPendingMigrations";

const log = createLogger("localDb");

let initPromise: Promise<void> | null = null;
let ready = false;
let initError: Error | null = null;

/**
 * Must complete during splash/boot before auth routing or form entry.
 */
export function initializeLocalDatabase(): Promise<void> {
  if (ready) return Promise.resolve();
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const database = openLocalDatabase();
      const version = applyPendingLocalMigrations(database);
      ready = true;
      initError = null;
      log.info("initialized", { version });
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

/** Allows Clear local beta data + Retry to reopen/migrate the DB again. */
export function resetLocalDatabaseInitStateForStartup(): void {
  initPromise = null;
  ready = false;
  initError = null;
}

export { applyPendingLocalMigrations, readLocalSchemaVersion } from "./applyPendingMigrations";
export { DB_VERSION };
