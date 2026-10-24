import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  createStorageLocalKeyStore,
  ensureLocalDataKey,
  openLocalText,
  sealLocalText,
  type LocalKeyStore,
} from "@/services/accountDeletion/localDataKey";

const LEGACY_KEY = "vyd_global_search_recent_v1";
const MAX = 6;

export type RecentSearchStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

const deviceKeys = createStorageLocalKeyStore(AsyncStorage);

function recentKey(uid: string): string {
  const owner = uid.trim();
  if (!owner) throw new Error("search_owner_required");
  return `vyd_search_recent_v1_${owner}`;
}

async function readOwned(
  uid: string,
  storage: RecentSearchStore,
  keys: LocalKeyStore
): Promise<string[]> {
  const raw = await storage.getItem(recentKey(uid));
  if (!raw) return [];
  const key = await keys.get(uid);
  if (!key) return [];
  const clear = await openLocalText(key, raw);
  if (!clear) return [];
  try {
    const parsed = JSON.parse(clear) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length >= 2)
      : [];
  } catch {
    return [];
  }
}

export async function getRecentSearches(
  uid: string,
  storage: RecentSearchStore = AsyncStorage,
  keys: LocalKeyStore = deviceKeys
): Promise<string[]> {
  return readOwned(uid, storage, keys);
}

export async function pushRecentSearch(
  uid: string,
  query: string,
  storage: RecentSearchStore = AsyncStorage,
  keys: LocalKeyStore = deviceKeys
): Promise<void> {
  const q = query.trim();
  if (q.length < 2) return;
  const prev = await readOwned(uid, storage, keys);
  const next = [q, ...prev.filter((item) => item.toLocaleLowerCase() !== q.toLocaleLowerCase())].slice(0, MAX);
  const key = await ensureLocalDataKey(keys, uid);
  await storage.setItem(recentKey(uid), await sealLocalText(key, JSON.stringify(next)));
}

/** Removes this account's queries and the old unscoped key. Logout does not call this. */
export async function clearRecentSearches(
  uid: string,
  storage: RecentSearchStore = AsyncStorage,
  keys: LocalKeyStore = deviceKeys
): Promise<void> {
  await storage.removeItem(recentKey(uid));
  await storage.removeItem(LEGACY_KEY);
  await keys.delete(uid);
}
