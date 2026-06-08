import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

import { getLocalDatabase } from "@/localDb/database";
import { clearAuthWrapperChallenge, clearAuthWrapperProgress } from "@/auth-v2/authWrapperProgress";
import { clearMasterDataSessionCache } from "@/services/masterData";
import { createLogger } from "@/utils/logger";

import { isDevStorageKey, userScopedDevKeySuffixes } from "./storageKeys";

const log = createLogger("devReset/purgeExtras");

/** SQLite tables not covered by accountDeletion/purgeLocal. */
export function purgeSqliteDevTablesForUser(userId: string): void {
  try {
    const db = getLocalDatabase();
    db.runSync("DELETE FROM statutory_occurrences WHERE user_id = ?", [userId]);
  } catch (e) {
    log.warn("statutory_occurrences purge skipped", e);
  }
}

/** Wipe all SQLite user/app data (dev full reset). Keeps schema/meta version. */
export function purgeAllSqliteDevData(): void {
  try {
    const db = getLocalDatabase();
    const tables = [
      "form_drafts",
      "entries_local",
      "sync_queue",
      "active_route",
      "master_data_suggestions",
      "statutory_occurrences",
      "pincode_cache",
    ] as const;
    for (const table of tables) {
      db.runSync(`DELETE FROM ${table}`);
    }
  } catch (e) {
    log.warn("full sqlite purge skipped", e);
  }
}

export async function removeDevAsyncKeysForUser(userId: string): Promise<number> {
  const all = await AsyncStorage.getAllKeys();
  const suffixes = new Set(userScopedDevKeySuffixes(userId));
  const prefixed = all.filter(
    (k) =>
      suffixes.has(k) ||
      k.startsWith(`vyd_pro_pack_draft_${userId}_`) ||
      k === `vyaamikk:hasSeenIntroSplash:${userId}`
  );
  if (prefixed.length > 0) {
    await AsyncStorage.multiRemove(prefixed);
  }
  await clearAuthWrapperProgress(userId);
  return prefixed.length;
}

export async function removeAllDevAsyncStorageKeys(): Promise<number> {
  const all = await AsyncStorage.getAllKeys();
  const toRemove = all.filter(isDevStorageKey);
  if (toRemove.length > 0) {
    await AsyncStorage.multiRemove(toRemove);
  }
  await clearAuthWrapperChallenge();
  return toRemove.length;
}

export async function clearDevLocalFiles(): Promise<void> {
  const docDir = FileSystem.documentDirectory;
  if (docDir) {
    try {
      await FileSystem.deleteAsync(`${docDir}profile-logos`, { idempotent: true });
    } catch (e) {
      log.warn("profile-logos delete", e);
    }
  }
  const cacheDir = FileSystem.cacheDirectory;
  if (cacheDir) {
    try {
      const entries = await FileSystem.readDirectoryAsync(cacheDir);
      for (const name of entries) {
        if (/letterhead|vyd|pdf/i.test(name)) {
          await FileSystem.deleteAsync(`${cacheDir}${name}`, { idempotent: true });
        }
      }
    } catch (e) {
      log.warn("cache sweep skipped", e);
    }
  }
}

export function clearDevInMemoryCaches(): void {
  clearMasterDataSessionCache();
}
