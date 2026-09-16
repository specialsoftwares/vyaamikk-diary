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
import { shouldClearSyncLockOnAuthTransition } from "@/sync/syncLockIdentityPolicy";
import { localEntriesRepository } from "@/repositories/localEntriesRepository";
import { syncQueueRepository } from "@/repositories/syncQueueRepository";
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
  const [syncing, setSyncing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [offline, setOffline] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [quotaBlockedCount, setQuotaBlockedCount] = useState(0);
  const [syncBlockedCount, setSyncBlockedCount] = useState(0);
  const identityRef = useRef<{
    status: typeof authStatus;
    uid: string | null;
  }>({ status: authStatus, uid: user?.uid ?? null });

  useEffect(() => sessionSyncGate.subscribe(setLockReason), []);

  // Process-wide sync lock must not survive logout / account switch.
  useEffect(() => {
    const prev = identityRef.current;
    const next = { status: authStatus, uid: user?.uid ?? null };
    if (
      shouldClearSyncLockOnAuthTransition({
        prevStatus: prev.status,
        nextStatus: next.status,
        prevUid: prev.uid,
        nextUid: next.uid,
      })
    ) {
      sessionSyncGate.unlock();
    }
    identityRef.current = next;
  }, [authStatus, user?.uid]);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => {
      setOffline(!(s.isConnected ?? false));
    });
    return () => unsub();
  }, []);

  const refreshPending = useCallback(async () => {
    if (!user) {
      setPendingCount(0);
      setQuotaBlockedCount(0);
      setSyncBlockedCount(0);
      return;
    }
    const unsynced = await localEntriesRepository.listUnsyncedRecords(user.uid);
    const queue = await syncQueueRepository.listForUser(user.uid);
    const ids = new Set<string>();
    let quota = 0;
    let blocked = 0;
    for (const record of unsynced) {
      ids.add(record.entry.id);
      if (record.meta.syncErrorCode === "quota_exhausted") quota += 1;
      else if (!record.meta.autoRetry) blocked += 1;
    }
    for (const item of queue) {
      if (item.entity === "entry") ids.add(item.entityId);
    }
    setPendingCount(ids.size);
    setQuotaBlockedCount(quota);
    setSyncBlockedCount(blocked);
  }, [user]);

  const flush = useCallback(async () => {
    const uid = user?.uid;
    if (!uid || sessionSyncGate.isLocked()) return;
    setSyncing(true);
    try {
      await syncEngine.flush(uid);
      if (identityRef.current.uid !== uid) return;
      await refreshPending();
    } finally {
      setSyncing(false);
    }
  }, [user, refreshPending]);

  const retryBlocked = useCallback(async () => {
    const uid = user?.uid;
    if (!uid || sessionSyncGate.isLocked()) return;
    setSyncing(true);
    try {
      const unsynced = await localEntriesRepository.listUnsyncedRecords(uid);
      for (const record of unsynced) {
        if (!record.meta.autoRetry) {
          await syncEngine.retryUnsyncedEntry(uid, record.entry.id);
        }
      }
      if (identityRef.current.uid !== uid) return;
      await refreshPending();
    } finally {
      setSyncing(false);
    }
  }, [user, refreshPending]);

  const pullFromCloud = useCallback(async () => {
    const uid = user?.uid;
    if (!uid || sessionSyncGate.isLocked()) return;
    setPulling(true);
    try {
      const count = await localEntriesRepository.countForUser(uid);
      if (count === 0) {
        await syncEngine.pullEntriesToLocalCache(uid);
      }
      if (identityRef.current.uid !== uid) return;
      await refreshPending();
    } catch (e) {
      log.warn("pullFromCloud", e);
    } finally {
      setPulling(false);
    }
  }, [user, refreshPending]);

  const runRefreshSync = useCallback(async (): Promise<{
    offline: boolean;
    sessionLocked: boolean;
  }> => {
    const net = await NetInfo.fetch();
    const offline = !(net.isConnected ?? false);
    const sessionLocked = sessionSyncGate.isLocked();

    if (!user) {
      return { offline, sessionLocked };
    }

    await refreshPending();

    if (offline || sessionLocked) {
      return { offline, sessionLocked };
    }

    const uid = user.uid;
    setSyncing(true);
    try {
      await syncEngine.flush(uid);
      if (identityRef.current.uid !== uid) return { offline: false, sessionLocked: false };
      await syncEngine.pullEntriesToLocalCache(uid);
      if (identityRef.current.uid !== uid) return { offline: false, sessionLocked: false };
      await refreshPending();
    } catch (e) {
      log.warn("runRefreshSync", e);
    } finally {
      setSyncing(false);
    }

    return { offline: false, sessionLocked: false };
  }, [user, refreshPending]);

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
    if (pulling) return "pulling";
    if (syncing) return "syncing";
    if (quotaBlockedCount > 0) return "quota_blocked";
    if (syncBlockedCount > 0) return "sync_blocked";
    if (offline && pendingCount > 0) return "offline";
    if (pendingCount > 0) return "pending";
    return "idle";
  }, [lockReason, pulling, syncing, offline, pendingCount, quotaBlockedCount, syncBlockedCount]);

  const value = useMemo(
    () => ({
      status,
      lockReason,
      pendingCount,
      quotaBlockedCount,
      syncBlockedCount,
      flush,
      retryBlocked,
      clearSessionLock: () => sessionSyncGate.unlock(),
      pullFromCloud,
      runRefreshSync,
    }),
    [status, lockReason, pendingCount, quotaBlockedCount, syncBlockedCount, flush, retryBlocked, pullFromCloud, runRefreshSync]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used within SyncProvider");
  return ctx;
}
