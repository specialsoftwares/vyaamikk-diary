import type { BusinessEntry } from "@/domain/businessEntry";
import type {
  CreateBusinessEntryInput,
  UpdateBusinessEntryInput,
} from "@/services/diary/types";
import { getDiaryRepository } from "@/services/diary";
import {
  localEntriesRepository,
  type LocalEntryRecord,
} from "@/repositories/localEntriesRepository";
import { syncQueueRepository } from "@/repositories/syncQueueRepository";
import { persistRemoteAccepted } from "@/repositories/diaryLocalIntent";
import { detectEntryConflict } from "@/sync/conflict";
import { isSyncAuthError, sessionSyncGate } from "@/sync/sessionSyncGate";
import { classifyAtomicCreateError } from "@/billing/optionC/classifyCreateError";
import {
  localContentDiffers,
  resolveDiaryPendingOp,
  shouldAutoEnqueue,
  shouldSkipHeuristicPurge,
} from "@/sync/diarySyncIntent";
import { createLogger } from "@/utils/logger";

const log = createLogger("sync");

export type SyncPhase = "idle" | "syncing" | "offline" | "error";

type FlushJob = {
  userId: string;
  promise: Promise<{ synced: number; failed: number }>;
};

let flushChain: FlushJob | null = null;

function entryToCreateInput(entry: BusinessEntry): CreateBusinessEntryInput {
  return {
    clientRecordId: entry.id,
    ueid: entry.ueid,
    entryType: entry.entryType,
    title: entry.title,
    entryDate: entry.entryDate,
    notes: entry.notes,
    reminder: entry.reminder,
    location: entry.location,
    attachments: entry.attachments,
    payload: entry.payload,
    source: entry.source,
    status: entry.status,
  };
}

function entryToUpdateInput(entry: BusinessEntry): UpdateBusinessEntryInput {
  return {
    id: entry.id,
    title: entry.title,
    entryDate: entry.entryDate,
    notes: entry.notes,
    reminder: entry.reminder,
    location: entry.location,
    attachments: entry.attachments,
    payload: entry.payload,
    status: entry.status,
  };
}

/**
 * Legacy leftover cleanup. Newly managed provisionals, quota-blocked rows,
 * and non-local_ identities are never deleted by title/type/date similarity.
 */
async function purgeSupersededLocalPlaceholders(userId: string): Promise<void> {
  const pending = await localEntriesRepository.listUnsyncedRecords(userId);
  if (pending.length === 0) return;

  const { getLocalDatabase } = await import("@/localDb/database");
  const db = getLocalDatabase();
  const syncedRows = db.getAllSync<{ payload_json: string }>(
    `SELECT payload_json FROM entries_local
     WHERE user_id = ? AND sync_status = 'synced'`,
    [userId]
  );
  const synced: BusinessEntry[] = [];
  for (const row of syncedRows) {
    try {
      synced.push(JSON.parse(row.payload_json) as BusinessEntry);
    } catch {
      // skip corrupt row
    }
  }

  for (const local of pending) {
    if (shouldSkipHeuristicPurge(local.entry.id, local.meta)) continue;
    const twin = synced.find((s) => s.id === local.entry.id);
    if (twin) {
      await localEntriesRepository.removeById(userId, local.entry.id);
      await syncQueueRepository.removeForEntity(userId, "entry", local.entry.id);
    }
  }
}

function enqueueOpForRecord(record: LocalEntryRecord): Promise<string> | void {
  const op = resolveDiaryPendingOp(record.entry.id, record.meta);
  if (op === "update") {
    return syncQueueRepository.enqueue({
      userId: record.entry.userId,
      op: "update",
      entity: "entry",
      entityId: record.entry.id,
      payload: entryToUpdateInput(record.entry),
    }, { replacePayload: true });
  }
  if (op === "delete") return;
  // create, ambiguous legacy, or local_ — replay the same identity as CREATE.
  return syncQueueRepository.enqueue({
    userId: record.entry.userId,
    op: "create",
    entity: "entry",
    entityId: record.entry.id,
    payload: entryToCreateInput(record.entry),
  }, { replacePayload: true });
}

/** Re-queue pending local rows that were never enqueued (or lost from the queue). */
async function ensurePendingQueued(userId: string): Promise<void> {
  await purgeSupersededLocalPlaceholders(userId);
  const pending = await localEntriesRepository.listUnsyncedRecords(userId);
  if (pending.length === 0) return;

  const queue = await syncQueueRepository.listForUser(userId);
  const queuedIds = new Set(
    queue.filter((q) => q.entity === "entry").map((q) => q.entityId)
  );

  for (const record of pending) {
    if (!shouldAutoEnqueue(record.meta)) continue;
    if (queuedIds.has(record.entry.id)) continue;
    await enqueueOpForRecord(record);
    queuedIds.add(record.entry.id);
  }
}

async function applyCreateFailureToLocal(
  userId: string,
  entityId: string,
  error: unknown
): Promise<"auth" | "suspend" | "retry"> {
  if (isSyncAuthError(error)) {
    sessionSyncGate.lock("session_expired");
    return "auth";
  }
  const kind = classifyAtomicCreateError(error);
  if (kind === "network") return "retry";
  await localEntriesRepository.suspendAutoRetry(userId, entityId, kind);
  await syncQueueRepository.removeForEntity(userId, "entry", entityId, "create");
  return "suspend";
}

async function processQueue(userId: string): Promise<{ synced: number; failed: number }> {
  let synced = 0;
  let failed = 0;
  const queue = await syncQueueRepository.listForUser(userId);
  const repo = getDiaryRepository();

  for (const item of queue) {
    if (item.userId !== userId) continue;
    if (sessionSyncGate.isLocked()) break;
    const localRecord = item.entity === "entry"
      ? await localEntriesRepository.getRecord(userId, item.entityId)
      : null;
    if (localRecord && !localRecord.meta.autoRetry) {
      await syncQueueRepository.remove(item.id);
      continue;
    }
    try {
      if (item.entity === "entry" && item.op === "create") {
        const local = localRecord?.entry ?? null;
        const input = local
          ? entryToCreateInput(local)
          : {
              ...(item.payload as CreateBusinessEntryInput),
              clientRecordId:
                (item.payload as CreateBusinessEntryInput).clientRecordId ||
                (item.entityId.startsWith("local_") ? item.entityId : item.entityId),
            };
        input.clientRecordId = local?.id ?? item.entityId;
        const remote = await repo.create(userId, input);
        if (sessionSyncGate.isLocked() || item.userId !== userId) {
          failed += 1;
          break;
        }
        const latest = await localEntriesRepository.getById(userId, item.entityId);
        if (latest && detectEntryConflict(latest, remote) && localContentDiffers(latest, remote)) {
          persistRemoteAccepted(userId, remote, latest, entryToUpdateInput(latest));
        } else if (latest && localContentDiffers(latest, remote)) {
          persistRemoteAccepted(userId, remote, latest, entryToUpdateInput(latest));
        } else {
          persistRemoteAccepted(userId, remote, latest, null);
          if (item.entityId !== remote.id) {
            await localEntriesRepository.removeById(userId, item.entityId);
          }
        }
      } else if (item.entity === "entry" && item.op === "update") {
        const local = localRecord?.entry ?? null;
        const payload = local
          ? entryToUpdateInput(local)
          : (item.payload as UpdateBusinessEntryInput);
        const remote = await repo.update(userId, payload);
        if (sessionSyncGate.isLocked() || item.userId !== userId) {
          failed += 1;
          break;
        }
        await localEntriesRepository.markSynced(remote);
      } else if (item.entity === "entry" && item.op === "delete") {
        const payload = item.payload as { id: string };
        await repo.hardDelete(userId, payload.id);
        if (sessionSyncGate.isLocked() || item.userId !== userId) {
          failed += 1;
          break;
        }
        await localEntriesRepository.removeById(userId, payload.id);
      }
      await syncQueueRepository.remove(item.id);
      synced += 1;
    } catch (e) {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      await syncQueueRepository.markAttempt(item.id, msg);
      const action = await applyCreateFailureToLocal(userId, item.entityId, e);
      if (action === "auth") break;
      log.warn("queue item failed", { id: item.id, msg });
    }
  }

  return { synced, failed };
}

export const syncEngine = {
  async flush(userId: string): Promise<{ synced: number; failed: number }> {
    if (sessionSyncGate.isLocked()) return { synced: 0, failed: 0 };

    const { assertLiveMutationAllowed, recordConnectivity, recordSuccessfulOnlineValidation } =
      await import("@/auth/offlineCapabilityGuard");
    const NetInfo = (await import("@react-native-community/netinfo")).default;
    const net = await NetInfo.fetch();
    recordConnectivity(Boolean(net.isConnected));
    if (!net.isConnected) {
      assertLiveMutationAllowed("sync");
      return { synced: 0, failed: 0 };
    }
    assertLiveMutationAllowed("sync");
    recordSuccessfulOnlineValidation();

    if (flushChain) {
      if (flushChain.userId === userId) return flushChain.promise;
      try {
        await flushChain.promise;
      } catch {
        // Old user's flush must not become this user's result.
      }
      if (sessionSyncGate.isLocked()) return { synced: 0, failed: 0 };
    }

    const job: FlushJob = {
      userId,
      promise: Promise.resolve({ synced: 0, failed: 0 }),
    };
    job.promise = (async () => {
      try {
        if (sessionSyncGate.isLocked()) return { synced: 0, failed: 0 };
        await ensurePendingQueued(userId);
        return await processQueue(userId);
      } finally {
        if (flushChain === job) flushChain = null;
      }
    })();
    flushChain = job;
    return job.promise;
  },

  async retryUnsyncedEntry(userId: string, entryId: string): Promise<void> {
    await localEntriesRepository.enableAutoRetry(userId, entryId);
    const record = await localEntriesRepository.getRecord(userId, entryId);
    if (record) await enqueueOpForRecord(record);
    try {
      await this.flush(userId);
    } catch {
      // Network/capability guard is device-only; the durable retry intent is already armed.
    }
  },

  /**
   * Pull cloud entries into local cache after login on a new device.
   * Non-blocking — failures are logged, not thrown to UI.
   */
  async pullEntriesToLocalCache(userId: string): Promise<number> {
    if (sessionSyncGate.isLocked()) return 0;
    const NetInfo = (await import("@react-native-community/netinfo")).default;
    const net = await NetInfo.fetch();
    if (!net.isConnected) return 0;

    try {
      const remote = await getDiaryRepository().list(userId, { limit: 500 });
      for (const entry of remote) {
        const existing = await localEntriesRepository.getRecord(userId, entry.id);
        if (existing && !existing.meta.remoteConfirmed) continue;
        if (existing && detectEntryConflict(existing.entry, entry)) {
          await localEntriesRepository.upsert(existing.entry, "conflict");
        } else {
          await localEntriesRepository.markSynced(entry);
        }
      }
      return remote.length;
    } catch (e) {
      if (isSyncAuthError(e)) sessionSyncGate.lock("session_expired");
      log.warn("pull failed", e);
      return 0;
    }
  },

  async cacheEntry(entry: BusinessEntry): Promise<void> {
    const existing = await localEntriesRepository.getRecord(entry.userId, entry.id);
    if (existing && !existing.meta.remoteConfirmed) {
      await localEntriesRepository.upsertWithMeta(entry, {
        syncStatus: existing.meta.syncStatus,
        pendingOp: existing.meta.pendingOp,
        remoteConfirmed: false,
        syncErrorCode: existing.meta.syncErrorCode,
        autoRetry: existing.meta.autoRetry,
      });
      return;
    }
    await localEntriesRepository.markSynced(entry);
  },
};

export const __diarySyncTest = {
  ensurePendingQueued,
  purgeSupersededLocalPlaceholders,
  processQueue,
  resetFlushChain() {
    flushChain = null;
  },
};
