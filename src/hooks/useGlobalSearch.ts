import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useT } from "@/i18n";
import {
  getRecentRecordsFromIndex,
  isQuerySearchable,
  loadGlobalSearchIndex,
  queryGlobalSearch,
  type GlobalSearchFilter,
  type GlobalSearchResult,
} from "@/services/search";
import type { IndexedSearchItem } from "@/services/search/globalSearchRepository";
import { pushRecentSearch } from "@/services/search/recentSearches";

const DEBOUNCE_MS = 320;

export function useGlobalSearch(userId: string | null) {
  const t = useT();
  const [index, setIndex] = useState<IndexedSearchItem[]>([]);
  const [indexLoading, setIndexLoading] = useState(false);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filter, setFilter] = useState<GlobalSearchFilter>("all");
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reloadIndex = useCallback(async () => {
    if (!userId) {
      setIndex([]);
      return;
    }
    setIndexLoading(true);
    setIndexError(null);
    try {
      const items = await loadGlobalSearchIndex(userId, t);
      setIndex(items);
    } catch {
      setIndexError("globalSearch.indexError");
      setIndex([]);
    } finally {
      setIndexLoading(false);
    }
  }, [userId, t]);

  useEffect(() => {
    void reloadIndex();
  }, [reloadIndex]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query);
      setSearching(false);
    }, DEBOUNCE_MS);
    if (isQuerySearchable(query)) setSearching(true);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const results: GlobalSearchResult[] = useMemo(() => {
    if (!isQuerySearchable(debouncedQuery)) return [];
    return queryGlobalSearch(index, debouncedQuery, filter);
  }, [index, debouncedQuery, filter]);

  const recentRecords = useMemo(
    () => getRecentRecordsFromIndex(index, 10),
    [index]
  );

  const showRecent = !isQuerySearchable(debouncedQuery);
  const showEmpty =
    isQuerySearchable(debouncedQuery) && !searching && !indexLoading && results.length === 0;
  const showResults = isQuerySearchable(debouncedQuery) && results.length > 0;

  const commitSearch = useCallback(async () => {
    if (isQuerySearchable(debouncedQuery)) {
      await pushRecentSearch(debouncedQuery);
    }
  }, [debouncedQuery]);

  return {
    query,
    setQuery,
    filter,
    setFilter,
    results,
    recentRecords,
    indexLoading,
    indexError,
    searching: searching && isQuerySearchable(query),
    showRecent,
    showEmpty,
    showResults,
    reloadIndex,
    commitSearch,
  };
}
