import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "vyd_global_search_recent_v1";
const MAX = 6;

export async function getRecentSearches(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr)
      ? arr.filter((s): s is string => typeof s === "string" && s.trim().length >= 2)
      : [];
  } catch {
    return [];
  }
}

export async function pushRecentSearch(query: string): Promise<void> {
  const q = query.trim();
  if (q.length < 2) return;
  const prev = await getRecentSearches();
  const next = [q, ...prev.filter((p) => p.toLocaleLowerCase() !== q.toLocaleLowerCase())].slice(
    0,
    MAX
  );
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // non-fatal
  }
}

export async function clearRecentSearches(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // non-fatal
  }
}
