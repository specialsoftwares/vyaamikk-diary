/**
 * When letterhead Storage migration may touch Firebase.
 * Never in true local-mock — Expo Go ships Firebase web config for other
 * modes but must not issue Firestore/Storage calls without a real backend.
 */

import type { ActiveBackend } from "@/config/runtimeEnvironment";

export const LETTERHEAD_STORAGE_MIGRATION_VERSION = 1;

export function letterheadMigrationStorageKey(userId: string, version = LETTERHEAD_STORAGE_MIGRATION_VERSION): string {
  return `letterhead.storageMigration.v${version}:${userId}`;
}

export function shouldRunLetterheadStorageMigration(input: {
  userId: string;
  backend: ActiveBackend;
  firebaseConfigured: boolean;
  storageAvailable: boolean;
  alreadyCompletedForVersion: boolean;
}): boolean {
  if (!input.userId.trim()) return false;
  if (input.backend === "local-mock") return false;
  if (!input.firebaseConfigured || !input.storageAvailable) return false;
  if (input.alreadyCompletedForVersion) return false;
  return true;
}

/** permission-denied / auth errors are recoverable failures — never success. */
export function isLetterheadMigrationSuccessError(_error: unknown): boolean {
  return false;
}
