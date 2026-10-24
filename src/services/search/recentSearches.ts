import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  openLocalText,
  resolveLocalDataKey,
  sealLocalText,
  type LocalKeyFailure,
  type LocalKeyStore,
} from "@/services/accountDeletion/localDataKey";
import { createProductionLocalKeyStore } from "@/services/accountDeletion/localKeyStore.native";
import { releaseLocalAccountKey } from "@/services/accountDeletion/localKeyLifecycle";

const LEGACY_KEY = "vyd_global_search_recent_v1";
const MAX = 6;

export type RecentSearchStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

function deviceKeys(): LocalKeyStore {
  return createProductionLocalKeyStore({
    getItem: (key) => AsyncStorage.getItem(key),
    removeItem: (key) => AsyncStorage.removeItem(key),
  });
}

export type RecentSearchRead =
  | { state: "ready"; queries: string[] }
  | { state: "unavailable"; reason: LocalKeyFailure };

function recentKey(uid: string): string {
  const owner = uid.trim();
  if (!owner) throw new Error("search_owner_required");
  return `vyd_search_recent_v1_${owner}`;
}

function sealedSearch(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { v?: unknown; ciphertext?: unknown };
    return parsed.v === 1 && typeof parsed.ciphertext === "string";
  } catch {
    return false;
  }
}

async function readOwned(
  uid: string,
  storage: RecentSearchStore,
  keys: LocalKeyStore
): Promise<RecentSearchRead> {
  const raw = await storage.getItem(recentKey(uid));
  if (!raw) return { state: "ready", queries: [] };
  if (!sealedSearch(raw)) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      const queries = Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length >= 2)
        : [];
      return { state: "ready", queries };
    } catch {
      return { state: "unavailable", reason: "key_corrupt" };
    }
  }
  const resolved = await resolveLocalDataKey(keys, uid, { retainedCiphertext: true });
  if (resolved.state !== "ready") return resolved;
  const clear = await openLocalText(resolved.key, raw);
  if (!clear) return { state: "unavailable", reason: "key_corrupt" };
  try {
    const parsed = JSON.parse(clear) as unknown;
    const queries = Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length >= 2)
      : [];
    return { state: "ready", queries };
  } catch {
    return { state: "unavailable", reason: "key_corrupt" };
  }
}

export async function readRecentSearches(
  uid: string,
  storage: RecentSearchStore = AsyncStorage,
  keys: LocalKeyStore = deviceKeys()
): Promise<RecentSearchRead> {
  return readOwned(uid, storage, keys);
}

export async function getRecentSearches(
  uid: string,
  storage: RecentSearchStore = AsyncStorage,
  keys: LocalKeyStore = deviceKeys()
): Promise<string[]> {
  const read = await readOwned(uid, storage, keys);
  if (read.state !== "ready") throw new Error(read.reason);
  return read.queries;
}

export async function pushRecentSearch(
  uid: string,
  query: string,
  storage: RecentSearchStore = AsyncStorage,
  keys: LocalKeyStore = deviceKeys()
): Promise<void> {
  const q = query.trim();
  if (q.length < 2) return;
  const prev = await readOwned(uid, storage, keys);
  if (prev.state !== "ready") throw new Error(prev.reason);
  const next = [q, ...prev.queries.filter((item) => item.toLocaleLowerCase() !== q.toLocaleLowerCase())].slice(0, MAX);
  const retained = sealedSearch(await storage.getItem(recentKey(uid)));
  const resolved = await resolveLocalDataKey(keys, uid, { retainedCiphertext: retained });
  if (resolved.state !== "ready") throw new Error(resolved.reason);
  await storage.setItem(recentKey(uid), await sealLocalText(resolved.key, JSON.stringify(next)));
}

/** Removes this account's queries and the old unscoped key. Logout does not call this. */
export async function clearRecentSearches(
  uid: string,
  storage: RecentSearchStore = AsyncStorage,
  keys: LocalKeyStore = deviceKeys()
): Promise<void> {
  await storage.removeItem(recentKey(uid));
  await storage.removeItem(LEGACY_KEY);
  await keys.delete(uid);
  releaseLocalAccountKey(uid);
}
