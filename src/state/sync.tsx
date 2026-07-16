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
import { isFirebaseConfigured } from "@/config/env";
import { runLetterheadStorageMigrationForUser } from "@/services/letterhead/letterheadStorageMigration";
import { useAuth } from "@/state/auth";
import { useLocalDb } from "@/state/localDb";
import { createLogger } from "@/utils/logger";

const log = createLogger("state/sync");

export type SyncUiStatus =
  | "idle"
  | "syncing"
  | "offline"
  | "pending"
  | "session_expired"
  | "pulling";

interface SyncContextValue {
  status: SyncUiStatus;
  lockReason: SyncLockReason;
  pendingCount: number;
  flush: () => Promise<void>;
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
      return;
    }
    const pending = await localEntriesRepository.listPending(user.uid);
    const queue = await syncQueueRepository.listForUser(user.uid);
    const ids = new Set<string>();
    for (const entry of pending) ids.add(entry.id);
    for (const item of queue) {
      if (item.entity === "entry") ids.add(item.entityId);
    }
    setPendingCount(ids.size);
  }, [user]);

  const flush = useCallback(async () => {
    if (!user || sessionSyncGate.isLocked()) return;
    setSyncing(true);
    try {
      await syncEngine.flush(user.uid);
      await refreshPending();
    } finally {
      setSyncing(false);
    }
  }, [user, refreshPending]);

  const pullFromCloud = useCallback(async () => {
    if (!user || sessionSyncGate.isLocked()) return;
    setPulling(true);
    try {
      const count = await localEntriesRepository.countForUser(user.uid);
      if (count === 0) {
        await syncEngine.pullEntriesToLocalCache(user.uid);
      }
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

    setSyncing(true);
    try {
      await syncEngine.flush(user.uid);
      await syncEngine.pullEntriesToLocalCache(user.uid);
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
      void refreshPending();
      void pullFromCloud();
      void flush();
      if (isFirebaseConfigured()) {
        void runLetterheadStorageMigrationForUser(user.uid);
      }
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
    if (offline && pendingCount > 0) return "offline";
    if (pendingCount > 0) return "pending";
    return "idle";
  }, [lockReason, pulling, syncing, offline, pendingCount]);

  const value = useMemo(
    () => ({
      status,
      lockReason,
      pendingCount,
      flush,
      clearSessionLock: () => sessionSyncGate.unlock(),
      pullFromCloud,
      runRefreshSync,
    }),
    [status, lockReason, pendingCount, flush, pullFromCloud, runRefreshSync]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used within SyncProvider");
  return ctx;
}
