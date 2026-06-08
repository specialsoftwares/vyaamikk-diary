import { useCallback, useEffect, useRef, useState } from "react";

import { toAppError, userFacingMessage } from "@/domain/errors";
import type { BusinessEntry, BusinessEntryType } from "@/domain/businessEntry";
import {
  getDiaryRepository,
  type ListDiaryEntriesOptions,
} from "@/services/diary";
import { dedupeDiaryEntries } from "@/services/dashboard/diaryRecordCounts";

interface DiaryListState {
  entries: BusinessEntry[];
  /** True only until the first fetch for this hook instance completes. */
  initialLoading: boolean;
  refreshing: boolean;
  error: string | null;
}

interface UseDiaryListResult extends DiaryListState {
  /** @deprecated Prefer `initialLoading` — kept for existing screens. */
  loading: boolean;
  refresh: () => Promise<void>;
  reload: () => Promise<void>;
}

export function useDiaryList(
  userId: string | null,
  options: {
    search?: string;
    entryType?: BusinessEntryType | null;
    upcomingOnly?: boolean;
    limit?: number;
  }
): UseDiaryListResult {
  const hasLoadedOnceRef = useRef(false);
  const userIdRef = useRef(userId);

  const [state, setState] = useState<DiaryListState>({
    entries: [],
    initialLoading: Boolean(userId),
    refreshing: false,
    error: null,
  });

  useEffect(() => {
    if (userIdRef.current === userId) return;
    userIdRef.current = userId;
    hasLoadedOnceRef.current = false;
    setState({
      entries: [],
      initialLoading: Boolean(userId),
      refreshing: false,
      error: null,
    });
  }, [userId]);

  const fetchOnce = useCallback(
    async (mode: "mount" | "refresh") => {
      if (!userId) {
        hasLoadedOnceRef.current = false;
        setState({ entries: [], initialLoading: false, refreshing: false, error: null });
        return;
      }

      const showInitial = mode === "mount" && !hasLoadedOnceRef.current;
      setState((s) => ({
        ...s,
        initialLoading: showInitial,
        refreshing: mode === "refresh" && hasLoadedOnceRef.current,
        error: null,
      }));

      try {
        const repoOpts: ListDiaryEntriesOptions = {
          search: options.search,
          entryType: options.entryType ?? null,
          upcomingOnly: options.upcomingOnly,
          limit: options.limit,
        };
        const entries = dedupeDiaryEntries(await getDiaryRepository().list(userId, repoOpts));
        hasLoadedOnceRef.current = true;
        setState({ entries, initialLoading: false, refreshing: false, error: null });
      } catch (e) {
        hasLoadedOnceRef.current = true;
        setState({
          entries: [],
          initialLoading: false,
          refreshing: false,
          error: userFacingMessage(toAppError(e)),
        });
      }
    },
    [userId, options.search, options.entryType, options.upcomingOnly, options.limit]
  );

  useEffect(() => {
    void fetchOnce("mount");
  }, [fetchOnce]);

  // Stable identities — changing these re-triggers useFocusEffect in consumers.
  const refresh = useCallback(() => fetchOnce("refresh"), [fetchOnce]);
  const reload = useCallback(() => fetchOnce("refresh"), [fetchOnce]);

  return {
    ...state,
    loading: state.initialLoading,
    refresh,
    reload,
  };
}
