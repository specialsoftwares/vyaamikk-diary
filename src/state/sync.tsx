import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, InteractionManager, type AppStateStatus } from "react-native";
import NetInfo from "@react-native-community/netinfo";

import { isBootNavigationSettled } from "@/boot/bootGate";
import { syncEngine } from "@/sync/syncEngine";
import {
  sessionSyncGate,
  type SyncLockReason,
} from "@/sync/sessionSyncGate";
import { applyAuthSyncIdentityTransition } from "@/sync/syncLockIdentityPolicy";
import { syncSessionOwnership, type SyncSessionToken } from "@/sync/syncSessionOwnership";
import {
  acquireSyncActivity,
  emptySyncUiSnapshotFor,
  presentSyncUi,
  refreshSyncPendingCounts,
  retiredSyncUiSnapshot,
  shouldReleaseSyncActivity,
  type SyncUiSnapshot,
} from "@/sync/syncUiPublication";
import { localEntriesRepository } from "@/repositories/localEntriesRepository";
import { getActiveBackend } from "@/config/env";
import { runLetterheadStorageMigrationForUser } from "@/services/letterhead/letterheadStorageMigration";
import { markFirstActionFreeze } from "@/diagnostics/firstActionFreezeDiag";
import { useAuth } from "@/state/auth";
import { useLocalDb } from "@/state/localDb";
import { createLogger } from "@/utils/logger";

const log = createLogger("state/sync");

export type SyncUiStatus =
  | "idle"
  | "syncing"
  | "offline"
  | "pending"
  | "quota_blocked"
  | "sync_blocked"
  | "session_expired"
  | "pulling";

interface SyncContextValue {
  status: SyncUiStatus;
  lockReason: SyncLockReason;
  pendingCount: number;
  quotaBlockedCount: number;
  syncBlockedCount: number;
  flush: () => Promise<void>;
  retryBlocked: () => Promise<void>;
  clearSessionLock: () => void;
  pullFromCloud: () => Promise<void>;
  /** Pull-to-refresh: flush queue + pull cloud when online; local-only when offline/expired. */
  runRefreshSync: () => Promise<{ offline: boolean; sessionLocked: boolean }>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { status: authStatus, user } = useAuth();
  const { status: dbStatus } = useLocalDb();
  const [lockReason, setLockReason] = useState<SyncLockReason>(null);
  const [offline, setOffline] = useState(false);
  const [storedUi, setStoredUi] = useState<SyncUiSnapshot>(retiredSyncUiSnapshot);
  const identityRef = useRef<{
    status: typeof authStatus;
    uid: string | null;
    generation: number;
  }>({ status: "loading", uid: null, generation: 0 });

  const nextUid = user?.uid ?? null;
  if (identityRef.current.status !== authStatus || identityRef.current.uid !== nextUid) {
    const token = applyAuthSyncIdentityTransition({
      prevStatus: identityRef.current.status,
      nextStatus: authStatus,
      prevUid: identityRef.current.uid,
      nextUid,
    });
    identityRef.current = {
      status: authStatus,
      uid: nextUid,
      generation: token?.generation ?? 0,
    };
  }

  const presented = presentSyncUi(nextUid, identityRef.current.generation, storedUi);

  useEffect(() => sessionSyncGate.subscribe(setLockReason), []);

  useEffect(() => {
    const uid = user?.uid ?? null;
    const generation = identityRef.current.generation;
    setStoredUi((prev) => {
      if (!uid) return retiredSyncUiSnapshot();
      if (prev.owner?.uid === uid && prev.owner?.generation === generation) return prev;
      return emptySyncUiSnapshotFor({ uid, generation });
    });
  }, [authStatus, user?.uid]);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => {
      setOffline(!(s.isConnected ?? false));
    });
    return () => unsub();
  }, []);

  const publishIfCurrent = useCallback((token: SyncSessionToken, patch: Partial<SyncUiSnapshot>) => {
    if (!syncSessionOwnership.isCurrent(token)) return;
    setStoredUi((prev) => {
      if (!syncSessionOwnership.isCurrent(token)) return prev;
      return {
        ...prev,
        owner: token,
        ...patch,
      };
    });
  }, []);

  const refreshPending = useCallback(async () => {
    const token = syncSessionOwnership.capture();
    if (!token) {
      setStoredUi(retiredSyncUiSnapshot());
      return;
    }
    await refreshSyncPendingCounts(token, (counts) => {
      publishIfCurrent(token, counts);
    });
  }, [publishIfCurrent]);

  const flush = useCallback(async () => {
    const uid = user?.uid;
    const token = syncSessionOwnership.capture();
    if (!uid || !token || token.uid !== uid || sessionSyncGate.isLocked()) return;
    const lease = acquireSyncActivity("flush", token);
    publishIfCurrent(token, { syncing: true });
    try {
      await syncEngine.flush(uid);
      if (!syncSessionOwnership.isCurrent(token)) return;
      await refreshPending();
    } finally {
      if (shouldReleaseSyncActivity(lease)) publishIfCurrent(token, { syncing: false });
    }
  }, [user, refreshPending, publishIfCurrent]);

  const retryBlocked = useCallback(async () => {
    const uid = user?.uid;
    const token = syncSessionOwnership.capture();
    if (!uid || !token || token.uid !== uid || sessionSyncGate.isLocked()) return;
    const lease = acquireSyncActivity("flush", token);
    publishIfCurrent(token, { syncing: true });
    try {
      const unsynced = await localEntriesRepository.listUnsyncedRecords(uid);
      if (!syncSessionOwnership.isCurrent(token)) return;
      for (const record of unsynced) {
        if (!syncSessionOwnership.isCurrent(token)) return;
        if (!record.meta.autoRetry) {
          await syncEngine.retryUnsyncedEntry(uid, record.entry.id);
        }
      }
      if (!syncSessionOwnership.isCurrent(token)) return;
      await refreshPending();
    } finally {
      if (shouldReleaseSyncActivity(lease)) publishIfCurrent(token, { syncing: false });
    }
  }, [user, refreshPending, publishIfCurrent]);

  const pullFromCloud = useCallback(async () => {
    const uid = user?.uid;
    const token = syncSessionOwnership.capture();
    if (!uid || !token || token.uid !== uid || sessionSyncGate.isLocked()) return;
    const lease = acquireSyncActivity("pull", token);
    publishIfCurrent(token, { pulling: true });
    try {
      const count = await localEntriesRepository.countForUser(uid);
      if (!syncSessionOwnership.isCurrent(token)) return;
      if (count === 0) {
        await syncEngine.pullEntriesToLocalCache(uid);
      }
      if (!syncSessionOwnership.isCurrent(token)) return;
      await refreshPending();
    } catch (e) {
      log.warn("pullFromCloud", e);
    } finally {
      if (shouldReleaseSyncActivity(lease)) publishIfCurrent(token, { pulling: false });
    }
  }, [user, refreshPending, publishIfCurrent]);

  const runRefreshSync = useCallback(async (): Promise<{
    offline: boolean;
    sessionLocked: boolean;
  }> => {
    const token = syncSessionOwnership.capture();
    const net = await NetInfo.fetch();
    const offline = !(net.isConnected ?? false);
    const sessionLocked = sessionSyncGate.isLocked();

    if (!user || !token) {
      return { offline, sessionLocked };
    }
    if (!syncSessionOwnership.isCurrent(token)) {
      return { offline, sessionLocked };
    }

    await refreshPending();
    if (!syncSessionOwnership.isCurrent(token)) {
      return { offline, sessionLocked };
    }

    if (offline || sessionLocked) {
      return { offline, sessionLocked };
    }

    const uid = user.uid;
    const lease = acquireSyncActivity("flush", token);
    publishIfCurrent(token, { syncing: true });
    try {
      await syncEngine.flush(uid);
      if (!syncSessionOwnership.isCurrent(token)) return { offline: false, sessionLocked: false };
      await syncEngine.pullEntriesToLocalCache(uid);
      if (!syncSessionOwnership.isCurrent(token)) return { offline: false, sessionLocked: false };
      await refreshPending();
    } catch (e) {
      log.warn("runRefreshSync", e);
    } finally {
      if (shouldReleaseSyncActivity(lease)) publishIfCurrent(token, { syncing: false });
    }

    return { offline: false, sessionLocked: false };
  }, [user, refreshPending, publishIfCurrent]);

  useEffect(() => {
    if (dbStatus !== "ready" || authStatus !== "signed_in" || !user) return;
    if (!isBootNavigationSettled()) return;
    const task = InteractionManager.runAfterInteractions(() => {
      markFirstActionFreeze("sync_background_start", { uidLen: user.uid.length });
      // Fire-and-forget: never await on the interaction / navigation path.
      void refreshPending();
      void pullFromCloud();
      void flush();
      // Policy inside migration skips local-mock; still gate here so we never
      // even schedule Firebase work when the active backend is local-mock.
      if (getActiveBackend() !== "local-mock") {
        void runLetterheadStorageMigrationForUser(user.uid);
      }
      markFirstActionFreeze("sync_background_scheduled");
    });
    return () => task.cancel();
  }, [dbStatus, authStatus, user?.uid, pullFromCloud, flush, refreshPending]);

  useEffect(() => {
    if (!user) return;
    const onState = (next: AppStateStatus) => {
      if (next === "active") void flush();
    };
    const sub = AppState.addEventListener("change", onState);
    const netSub = NetInfo.addEventListener((s) => {
      if (s.isConnected) void flush();
    });
    return () => {
      sub.remove();
      netSub();
    };
  }, [user, flush]);

  const status: SyncUiStatus = useMemo(() => {
    if (lockReason === "session_expired") return "session_expired";
    if (presented.pulling) return "pulling";
    if (presented.syncing) return "syncing";
    if (presented.quotaBlockedCount > 0) return "quota_blocked";
    if (presented.syncBlockedCount > 0) return "sync_blocked";
    if (offline && presented.pendingCount > 0) return "offline";
    if (presented.pendingCount > 0) return "pending";
    return "idle";
  }, [lockReason, presented, offline]);

  const value = useMemo(
    () => ({
      status,
      lockReason,
      pendingCount: presented.pendingCount,
      quotaBlockedCount: presented.quotaBlockedCount,
      syncBlockedCount: presented.syncBlockedCount,
      flush,
      retryBlocked,
      clearSessionLock: () => sessionSyncGate.unlock(),
      pullFromCloud,
      runRefreshSync,
    }),
    [status, lockReason, presented, flush, retryBlocked, pullFromCloud, runRefreshSync]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used within SyncProvider");
  return ctx;
}
