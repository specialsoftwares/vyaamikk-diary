import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { captureLoadClaim, emptyOwnedLoad, runOwnedLoad, type OwnedLoad, type RequestClaim } from "@/components/screenState";
import { currentSessionCommitEpoch } from "@/services/auth/authSessionFence";
import { presentPublicError } from "@/domain/publicErrors";
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
  const [indexLoading, setIndexLoading] = useState(Boolean(userId));
  const [indexError, setIndexError] = useState<string | null>(null);
  const [indexClaim, setIndexClaim] = useState<RequestClaim | null>(null);
  const [requestClaim, setRequestClaim] = useState<RequestClaim | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filter, setFilter] = useState<GlobalSearchFilter>("all");
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadRef = useRef<OwnedLoad<IndexedSearchItem[]>>(emptyOwnedLoad());
  const generationRef = useRef(0);
  const userRef = useRef(userId);
  userRef.current = userId;

  const publishIndex = useCallback((next: OwnedLoad<IndexedSearchItem[]>) => {
    loadRef.current = next;
    setIndexLoading(next.loading);
    setIndexError(next.error);
    setRequestClaim(next.claim);
    setIndexClaim(next.valueClaim);
    setIndex(next.value ?? []);
  }, []);

  const reloadIndex = useCallback(async () => {
    const owner = userRef.current;
    if (!owner) {
      generationRef.current += 1;
      publishIndex(emptyOwnedLoad());
      return;
    }
    const claim = captureLoadClaim(owner, ++generationRef.current);
    await runOwnedLoad({
      claim,
      read: () => loadGlobalSearchIndex(owner, t),
      readState: () => loadRef.current,
      writeState: publishIndex,
      presentError: (error) => presentPublicError(error),
    });
  }, [publishIndex, t]);

  const epoch = currentSessionCommitEpoch();
  useEffect(() => {
    void reloadIndex();
  }, [reloadIndex, epoch]);

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
      if (userId) await pushRecentSearch(userId, debouncedQuery);
    }
  }, [debouncedQuery, userId]);

  return {
    query,
    setQuery,
    filter,
    setFilter,
    results,
    recentRecords,
    indexLoading,
    indexError,
    indexClaim,
    requestClaim,
    libraryCount: indexClaim ? index.length : 0,
    searching: searching && isQuerySearchable(query),
    showRecent,
    showEmpty,
    showResults,
    reloadIndex,
    commitSearch,
  };
}
