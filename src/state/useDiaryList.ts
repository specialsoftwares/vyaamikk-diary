import { useCallback, useEffect, useRef, useState } from "react";

import { toAppError, userFacingMessage } from "@/domain/errors";
import type { BusinessEntry, BusinessEntryType } from "@/domain/businessEntry";
import { getDiaryRepository } from "@/services/diary";
import { localEntriesRepository } from "@/repositories/localEntriesRepository";
import type { DiarySyncBadge } from "@/services/diary/mergeLocalUnsynced";
import { subscribeDomainChanges } from "@/services/dataChanges/domainChanges";
import { syncSessionOwnership } from "@/sync/syncSessionOwnership";

import {
  diaryQueryKey,
  refreshDiaryList,
  sessionStillOwns,
  type DiaryListQuery,
} from "./diaryListLoad";

interface DiaryListState {
  entries: BusinessEntry[];
  badgeById: Record<string, DiarySyncBadge>;
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

const emptyState = (userId: string | null): DiaryListState => ({
  entries: [],
  badgeById: {},
  initialLoading: Boolean(userId),
  refreshing: false,
  error: null,
});

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
  const remoteRef = useRef<BusinessEntry[]>([]);
  const removedRef = useRef(new Set<string>());
  const loadGenRef = useRef(0);
  const queryRef = useRef<DiaryListQuery>(options);
  queryRef.current = options;
  const queryKey = diaryQueryKey(options);
  const queryKeyRef = useRef(queryKey);
  queryKeyRef.current = queryKey;

  const [state, setState] = useState<DiaryListState>(() => emptyState(userId));

  const live = syncSessionOwnership.capture();
  const fenceKey = live ? `${live.uid}#${live.generation}` : `open:${userId ?? ""}`;
  const fenceRef = useRef(fenceKey);
  if (fenceRef.current !== fenceKey || userIdRef.current !== userId) {
    fenceRef.current = fenceKey;
    userIdRef.current = userId;
    hasLoadedOnceRef.current = false;
    remoteRef.current = [];
    removedRef.current = new Set();
    if (state.entries.length > 0 || state.error || state.initialLoading !== Boolean(userId)) {
      setState(emptyState(userId));
    }
  }

  const run = useCallback(
    async (includeRemote: boolean) => {
      const generation = ++loadGenRef.current;
      const owner = userIdRef.current;
      if (!owner) {
        hasLoadedOnceRef.current = false;
        remoteRef.current = [];
        setState(emptyState(null));
        return;
      }
      const admitted = syncSessionOwnership.capture();
      const sessionGeneration = admitted && admitted.uid === owner ? admitted.generation : null;
      const keyAtStart = queryKeyRef.current;
      setState((current) => ({
        ...current,
        initialLoading: !hasLoadedOnceRef.current,
        refreshing: includeRemote && hasLoadedOnceRef.current,
        error: null,
      }));
      try {
        const result = await refreshDiaryList({
          userId: owner,
          query: { ...queryRef.current },
          generation: sessionGeneration,
          removedIds: removedRef.current,
          previousRemote: remoteRef.current,
          includeRemote,
          readLocal: (id) => localEntriesRepository.listUnsyncedRecords(id),
          readRemote: (id) =>
            getDiaryRepository().list(id, {
              search: queryRef.current.search,
              entryType: queryRef.current.entryType ?? null,
              upcomingOnly: queryRef.current.upcomingOnly,
            }),
          stillCurrent: () =>
            generation === loadGenRef.current &&
            userIdRef.current === owner &&
            queryKeyRef.current === keyAtStart &&
            sessionStillOwns(owner, sessionGeneration),
          onPublish: (published) => {
            if (generation !== loadGenRef.current || userIdRef.current !== owner) return;
            if (queryKeyRef.current !== keyAtStart) return;
            if (!sessionStillOwns(owner, sessionGeneration)) return;
            hasLoadedOnceRef.current = true;
            setState({
              entries: published.entries,
              badgeById: published.badgeById,
              initialLoading: false,
              refreshing: false,
              error: null,
            });
          },
        });
        if (!result.stale && includeRemote) remoteRef.current = result.remote;
      } catch (error) {
        if (generation !== loadGenRef.current || userIdRef.current !== owner) return;
        if (!sessionStillOwns(owner, sessionGeneration)) return;
        hasLoadedOnceRef.current = true;
        setState((current) => ({
          ...current,
          initialLoading: false,
          refreshing: false,
          error:
            current.entries.length === 0 ? userFacingMessage(toAppError(error)) : current.error,
        }));
      }
    },
    []
  );

  useEffect(() => {
    void run(true);
  }, [run, userId, queryKey]);

  useEffect(() => {
    if (!userId) return;
    return subscribeDomainChanges((change) => {
      if (change.ownerUid !== userId || change.source !== "diary") return;
      if (change.effect === "delete" && change.recordId) {
        removedRef.current.add(change.recordId);
        remoteRef.current = remoteRef.current.filter((entry) => entry.id !== change.recordId);
      }
      if (change.effect === "upsert" && change.recordId) {
        removedRef.current.delete(change.recordId);
      }
      void run(false);
    });
  }, [run, userId]);

  const refresh = useCallback(() => run(true), [run]);
  const reload = useCallback(() => run(true), [run]);

  return {
    ...state,
    loading: state.initialLoading,
    refresh,
    reload,
  };
}
