import { useCallback, useEffect, useRef, useState } from "react";

import { toAppError, userFacingMessage } from "@/domain/errors";
import type { BusinessEntry, BusinessEntryType } from "@/domain/businessEntry";
import {
  getDiaryRepository,
  type ListDiaryEntriesOptions,
} from "@/services/diary";
import { localEntriesRepository } from "@/repositories/localEntriesRepository";
import {
  mergeRemoteWithLocalUnsynced,
  type DiarySyncBadge,
} from "@/services/diary/mergeLocalUnsynced";
import { entrySearchBlob } from "@/utils/businessEntry/display";

interface DiaryListState {
  entries: BusinessEntry[];
  badgeById: Record<string, DiarySyncBadge>;
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

function applyClientFilters(
  entries: BusinessEntry[],
  options: ListDiaryEntriesOptions
): BusinessEntry[] {
  let out = entries;
  if (!options.includeDeleted) out = out.filter((e) => !e.deletedAt);
  if (options.entryType) out = out.filter((e) => e.entryType === options.entryType);
  if (options.upcomingOnly) {
    const now = Date.now();
    out = out.filter((e) => e.reminder && e.reminder.at > now);
  }
  if (options.search) {
    const needle = options.search.trim().toLowerCase();
    if (needle) out = out.filter((e) => entrySearchBlob(e).includes(needle));
  }
  if (options.limit) out = out.slice(0, options.limit);
  return out;
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
    badgeById: {},
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
      badgeById: {},
      initialLoading: Boolean(userId),
      refreshing: false,
      error: null,
    });
  }, [userId]);

  const fetchOnce = useCallback(
    async (mode: "mount" | "refresh") => {
      if (!userId) {
        hasLoadedOnceRef.current = false;
        setState({
          entries: [],
          badgeById: {},
          initialLoading: false,
          refreshing: false,
          error: null,
        });
        return;
      }

      const showInitial = mode === "mount" && !hasLoadedOnceRef.current;
      setState((s) => ({
        ...s,
        initialLoading: showInitial,
        refreshing: mode === "refresh" && hasLoadedOnceRef.current,
        error: null,
      }));

      const repoOpts: ListDiaryEntriesOptions = {
        search: options.search,
        entryType: options.entryType ?? null,
        upcomingOnly: options.upcomingOnly,
        limit: options.limit,
      };

      let remote: BusinessEntry[] = [];
      let cloudError: unknown = null;
      try {
        remote = await getDiaryRepository().list(userId, {
          ...repoOpts,
          limit: undefined,
        });
      } catch (e) {
        cloudError = e;
      }

      try {
        const localUnsynced = await localEntriesRepository.listUnsyncedRecords(userId);
        const merged = mergeRemoteWithLocalUnsynced(remote, localUnsynced);
        const entries = applyClientFilters(merged.entries, repoOpts);
        hasLoadedOnceRef.current = true;
        setState({
          entries,
          badgeById: merged.badgeById,
          initialLoading: false,
          refreshing: false,
          error: entries.length === 0 && cloudError ? userFacingMessage(toAppError(cloudError)) : null,
        });
      } catch (e) {
        hasLoadedOnceRef.current = true;
        setState({
          entries: [],
          badgeById: {},
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

  const refresh = useCallback(() => fetchOnce("refresh"), [fetchOnce]);
  const reload = useCallback(() => fetchOnce("refresh"), [fetchOnce]);

  return {
    ...state,
    loading: state.initialLoading,
    refresh,
    reload,
  };
}
