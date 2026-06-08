import React, { useCallback, useMemo, useRef, useState } from "react";
import { RefreshControl, type RefreshControlProps } from "react-native";

import { useT } from "@/i18n";
import { useSync } from "@/state/sync";
import { useThemeColors } from "@/theme";

const DEFAULT_MIN_INTERVAL_MS = 2000;

export interface AppRefreshSyncResult {
  offline: boolean;
  sessionLocked: boolean;
}

export interface UseAppRefreshOptions {
  /** Reload local repositories / view models for this screen. */
  onReload: () => void | Promise<void>;
  /** Attempt background sync after local reload (default true). */
  sync?: boolean;
  /** Minimum ms between refresh runs (debounce). */
  minIntervalMs?: number;
  /**
   * When set, the parent owns the RefreshControl `refreshing` flag
   * (e.g. `useDiaryList` refresh mode).
   */
  externalRefreshing?: boolean;
}

export interface UseAppRefreshResult {
  refreshing: boolean;
  refreshNote: string | null;
  lastRefreshedAt: number | null;
  onRefresh: () => void;
  refreshControl: React.ReactElement<RefreshControlProps>;
  clearRefreshNote: () => void;
}

/**
 * Shared pull-to-refresh: local reload + optional silent sync.
 * Screens pass `onReload`; sync is centralized via `useSync().runRefreshSync`.
 */
export function useAppRefresh(options: UseAppRefreshOptions): UseAppRefreshResult {
  const {
    onReload,
    sync = true,
    minIntervalMs = DEFAULT_MIN_INTERVAL_MS,
    externalRefreshing,
  } = options;
  const t = useT();
  const colors = useThemeColors();
  const { runRefreshSync } = useSync();

  const [internalRefreshing, setInternalRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const lastStartedRef = useRef(0);

  const refreshing = externalRefreshing ?? internalRefreshing;

  const clearRefreshNote = useCallback(() => setRefreshNote(null), []);

  const performRefresh = useCallback(async () => {
    if (inFlightRef.current) {
      return inFlightRef.current;
    }
    const now = Date.now();
    if (now - lastStartedRef.current < minIntervalMs) {
      return;
    }
    lastStartedRef.current = now;

    const ownsSpinner = externalRefreshing === undefined;

    const task = (async () => {
      if (ownsSpinner) setInternalRefreshing(true);
      try {
        await onReload();
        let syncResult: AppRefreshSyncResult = { offline: false, sessionLocked: false };
        if (sync) {
          syncResult = await runRefreshSync();
        }
        setLastRefreshedAt(Date.now());
        if (syncResult.offline) {
          setRefreshNote(t("refresh.offlineSaved"));
        } else if (syncResult.sessionLocked) {
          setRefreshNote(t("refresh.sessionExpiredLocal"));
        } else {
          setRefreshNote(t("refresh.updatedJustNow"));
        }
      } finally {
        if (ownsSpinner) setInternalRefreshing(false);
        inFlightRef.current = null;
      }
    })();

    inFlightRef.current = task;
    return task;
  }, [onReload, sync, runRefreshSync, t, minIntervalMs, externalRefreshing]);

  const onRefresh = useCallback(() => {
    void performRefresh();
  }, [performRefresh]);

  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={onRefresh}
        tintColor={colors.primary}
        colors={[colors.primary]}
      />
    ),
    [refreshing, onRefresh, colors.primary]
  );

  return {
    refreshing,
    refreshNote,
    lastRefreshedAt,
    onRefresh,
    refreshControl,
    clearRefreshNote,
  };
}
