import { localEntriesRepository } from "@/repositories/localEntriesRepository";
import { syncQueueRepository } from "@/repositories/syncQueueRepository";
import {
  syncSessionOwnership,
  type SyncSessionToken,
} from "@/sync/syncSessionOwnership";

export type SyncPendingCounts = {
  pendingCount: number;
  quotaBlockedCount: number;
  syncBlockedCount: number;
};

export function computeSyncPendingCounts(
  unsynced: Awaited<ReturnType<typeof localEntriesRepository.listUnsyncedRecords>>,
  queue: Awaited<ReturnType<typeof syncQueueRepository.listForUser>>
): SyncPendingCounts {
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
  return { pendingCount: ids.size, quotaBlockedCount: quota, syncBlockedCount: blocked };
}

export async function refreshSyncPendingCounts(
  owner: SyncSessionToken,
  publish: (counts: SyncPendingCounts) => void
): Promise<void> {
  const unsynced = await localEntriesRepository.listUnsyncedRecords(owner.uid);
  if (!syncSessionOwnership.isCurrent(owner)) return;
  const queue = await syncQueueRepository.listForUser(owner.uid);
  if (!syncSessionOwnership.isCurrent(owner)) return;
  publish(computeSyncPendingCounts(unsynced, queue));
}

export type SyncActivityKind = "flush" | "pull";

export type SyncActivityLease = {
  token: SyncSessionToken;
  kind: SyncActivityKind;
  leaseId: number;
};

let nextLeaseId = 0;
let activeFlushLease: SyncActivityLease | null = null;
let activePullLease: SyncActivityLease | null = null;

export function acquireSyncActivity(
  kind: SyncActivityKind,
  token: SyncSessionToken
): SyncActivityLease {
  const lease: SyncActivityLease = { token, kind, leaseId: ++nextLeaseId };
  if (kind === "flush") activeFlushLease = lease;
  else activePullLease = lease;
  return lease;
}

export function shouldReleaseSyncActivity(lease: SyncActivityLease): boolean {
  const active = lease.kind === "flush" ? activeFlushLease : activePullLease;
  return active?.leaseId === lease.leaseId && syncSessionOwnership.isCurrent(lease.token);
}

export function resetSyncActivityLeasesForTests(): void {
  nextLeaseId = 0;
  activeFlushLease = null;
  activePullLease = null;
}

export type SyncUiSnapshot = {
  owner: SyncSessionToken | null;
  pendingCount: number;
  quotaBlockedCount: number;
  syncBlockedCount: number;
  syncing: boolean;
  pulling: boolean;
};

export const EMPTY_SYNC_UI_VIEW = {
  pendingCount: 0,
  quotaBlockedCount: 0,
  syncBlockedCount: 0,
  syncing: false,
  pulling: false,
};

export function retiredSyncUiSnapshot(): SyncUiSnapshot {
  return {
    owner: null,
    ...EMPTY_SYNC_UI_VIEW,
  };
}

export function emptySyncUiSnapshotFor(token: SyncSessionToken | null): SyncUiSnapshot {
  if (!token) return retiredSyncUiSnapshot();
  return {
    owner: { uid: token.uid, generation: token.generation },
    ...EMPTY_SYNC_UI_VIEW,
  };
}

/**
 * Immediate presentation mask. A's stored counts/activity cannot appear as B's
 * current state, including while B's refresh is still pending.
 */
export function presentSyncUi(
  liveUid: string | null,
  liveGeneration: number,
  stored: SyncUiSnapshot
): typeof EMPTY_SYNC_UI_VIEW {
  if (!liveUid || !stored.owner) return { ...EMPTY_SYNC_UI_VIEW };
  if (stored.owner.uid !== liveUid) return { ...EMPTY_SYNC_UI_VIEW };
  if (stored.owner.generation !== liveGeneration) return { ...EMPTY_SYNC_UI_VIEW };
  return {
    pendingCount: stored.pendingCount,
    quotaBlockedCount: stored.quotaBlockedCount,
    syncBlockedCount: stored.syncBlockedCount,
    syncing: stored.syncing,
    pulling: stored.pulling,
  };
}
