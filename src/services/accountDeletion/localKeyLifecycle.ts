/**
 * Binds the production key after sign-in and migrates leftover plaintext.
 * Logout does not unbind it. Account deletion removes the key and the binding.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import { getLocalDatabase } from "@/localDb/database";
import { isLocalDatabaseReady } from "@/localDb/init";
import { createProductionLocalKeyStore } from "@/services/accountDeletion/localKeyStore.native";
import {
  resolveLocalDataKey,
  type LocalKeyResult,
} from "@/services/accountDeletion/localDataKey";
import {
  bindLocalDataKey,
  migrateGrinOwnedPayloads,
  migrateOwnedPayloads,
  unbindLocalDataKey,
} from "@/services/accountDeletion/localPayload";
import { migrateInsightJoinKeys } from "@/services/insights/businessInsightRepository";
import { sealRetainedMockDiary } from "@/services/diary/mockDiarySeal";

const SEARCH_PREFIX = "vyd_search_recent_v1_";

export async function prepareLocalAccountKey(uid: string): Promise<LocalKeyResult> {
  const legacy = {
    getItem: (key: string) => AsyncStorage.getItem(key),
    removeItem: (key: string) => AsyncStorage.removeItem(key),
  };
  const store = createProductionLocalKeyStore(legacy);
  const retained = await retainedCiphertext(uid);
  const resolved = await resolveLocalDataKey(store, uid, { retainedCiphertext: retained, legacy });
  if (resolved.state !== "ready") return resolved;
  bindLocalDataKey(uid, resolved.key);
  if (isLocalDatabaseReady()) {
    try {
      const db = getLocalDatabase();
      migrateOwnedPayloads(db, uid);
      if (grinPayloadTablesPresent(db)) migrateGrinOwnedPayloads(db, uid);
      migrateInsightJoinKeys(db, uid);
    } catch {
      return { state: "unavailable", reason: "migration_incomplete" };
    }
  }
  try {
    await sealRetainedMockDiary(AsyncStorage, uid);
  } catch {
    return { state: "unavailable", reason: "migration_incomplete" };
  }
  return resolved;
}

export function releaseLocalAccountKey(uid: string): void {
  unbindLocalDataKey(uid);
}

async function retainedCiphertext(uid: string): Promise<boolean> {
  const search = await AsyncStorage.getItem(SEARCH_PREFIX + uid);
  if (search && search.includes("\"ciphertext\"")) return true;
  if (!isLocalDatabaseReady()) return false;
  const db = getLocalDatabase();
  const tables = ["entries_local", "sync_queue", "form_drafts"] as const;
  for (const table of tables) {
    const row = db.getFirstSync<{ value: string | null }>(
      `SELECT payload_json AS value FROM ${table} WHERE user_id = ? AND payload_json LIKE 'vyd1:%' LIMIT 1`,
      [uid]
    );
    if (row?.value) return true;
  }
  if (!grinPayloadTablesPresent(db)) return false;
  const grin = db.getFirstSync<{ value: string | null }>(
    `SELECT payload_json AS value FROM grin_local_receipts WHERE owner_uid = ? AND payload_json LIKE 'vyd1:%' LIMIT 1`,
    [uid]
  );
  return Boolean(grin?.value);
}

function grinPayloadTablesPresent(db: {
  getFirstSync<T>(sql: string, params?: unknown[]): T | null;
}): boolean {
  try {
    const row = db.getFirstSync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'grin_local_receipts'"
    );
    return Boolean(row?.name);
  } catch {
    return false;
  }
}
