import type { BusinessEntry } from "@/domain/businessEntry";
import { AppError } from "@/domain/errors";
import type {
  CreateBusinessEntryInput,
  UpdateBusinessEntryInput,
} from "@/services/diary/types";
import { getDiaryRepository } from "@/services/diary";
import {
  localEntriesRepository,
  readLocalEntryRecordSync,
  writeLocalEntryRowSync,
  type LocalEntryRecord,
} from "@/repositories/localEntriesRepository";
import { syncQueueRepository } from "@/repositories/syncQueueRepository";
import { detectEntryConflict } from "@/sync/conflict";
import { isSyncAuthError, sessionSyncGate } from "@/sync/sessionSyncGate";
import {
  entryToCreateInput,
  entryToUpdateInput,
  hasOutstandingLocalIntent,
  localContentDiffers,
  resolveDiaryPendingOp,
  shouldAutoEnqueue,
  shouldSkipHeuristicPurge,
} from "@/sync/diarySyncIntent";
import {
  acknowledgeDiaryCreateSuccess,
  acknowledgeDiaryDeleteSuccess,
  acknowledgeDiaryFailure,
  acknowledgeDiaryUpdateSuccess,
  captureSentDiaryOp,
  expectedUpdatedAtForRecord,
} from "@/sync/diaryAck";
import {
  enqueueDiaryRecordWrite,
  rememberRemoteUpdatedAt,
  resetDiaryRecordWritesForTests,
} from "@/sync/diaryRecordWrites";
import {
  captureAdmissionToken,
  mayIssueRemoteWork,
  sessionFlushKey,
  type SyncSessionToken,
} from "@/sync/syncSessionOwnership";
import { createLogger } from "@/utils/logger";

const log = createLogger("sync");

let queueAdmissionHook: (() => Promise<void>) | null = null;

/** Test-only: await between queue listing and remote dispatch. */
export function setDiaryQueueAdmissionHookForTests(hook: (() => Promise<void>) | null): void {
  queueAdmissionHook = hook;
}

export type SyncPhase = "idle" | "syncing" | "offline" | "error";

type FlushJob = {
  key: string;
  promise: Promise<{ synced: number; failed: number }>;
};

const flushChainByKey = new Map<string, FlushJob>();

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
  const revision = record.meta.localRevision;
  if (op === "update") {
    return syncQueueRepository.enqueue({
      userId: record.entry.userId,
      op: "update",
      entity: "entry",
      entityId: record.entry.id,
      payload: entryToUpdateInput(record.entry),
      revision,
    }, { replacePayload: true });
  }
  if (op === "delete") return;
  return syncQueueRepository.enqueue({
    userId: record.entry.userId,
    op: "create",
    entity: "entry",
    entityId: record.entry.id,
    payload: entryToCreateInput(record.entry),
    revision,
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

function stillOwnsFlush(token: SyncSessionToken | null, userId: string): boolean {
  return mayIssueRemoteWork(token, userId);
}

async function processQueue(
  userId: string,
  token?: SyncSessionToken | null
): Promise<{ synced: number; failed: number }> {
  const owner = token === undefined ? captureAdmissionToken() : token;
  if (!stillOwnsFlush(owner, userId)) return { synced: 0, failed: 0 };
  let synced = 0;
  let failed = 0;
  const queue = await syncQueueRepository.listForUser(userId);
  if (queueAdmissionHook) await queueAdmissionHook();
  if (!stillOwnsFlush(owner, userId)) return { synced: 0, failed: 0 };
  const repo = getDiaryRepository();

  for (const listed of queue) {
    if (!stillOwnsFlush(owner, userId)) break;
    if (sessionSyncGate.isLocked() && stillOwnsFlush(owner, userId)) break;
    const item = (await syncQueueRepository.getById(listed.id)) ?? listed;
    if (!stillOwnsFlush(owner, userId)) break;
    if (item.userId !== userId) continue;
    const localRecord = item.entity === "entry"
      ? await localEntriesRepository.getRecord(userId, item.entityId)
      : null;
    if (localRecord && !localRecord.meta.autoRetry) {
      continue;
    }
    const fallbackEntry = (localRecord?.entry ?? (item.payload as BusinessEntry)) as BusinessEntry;
    const sent = captureSentDiaryOp({
      userId,
      recordId: item.entityId,
      op: item.op as "create" | "update" | "delete",
      queueId: item.id,
      entry: fallbackEntry,
      session: owner,
    });
    try {
      const dispatched = await enqueueDiaryRecordWrite({
        userId,
        recordId: item.entityId,
        revision: sent.revision,
        op: sent.op,
        session: owner,
        run: async () => {
          if (!stillOwnsFlush(owner, userId)) {
            throw new AppError("session_expired", "Session is no longer active.");
          }
          const liveItem = (await syncQueueRepository.getById(item.id)) ?? item;
          const liveLocal = liveItem.entity === "entry"
            ? await localEntriesRepository.getRecord(userId, liveItem.entityId)
            : null;
          if (liveLocal && !liveLocal.meta.autoRetry) {
            return { kind: "noop" as const };
          }
          if (liveItem.entity === "entry" && liveItem.op === "create" && liveLocal?.meta.remoteConfirmed) {
            if (liveLocal.meta.pendingOp === "update") {
              const expected =
                (liveItem.payload as UpdateBusinessEntryInput | null)?.expectedUpdatedAt ??
                expectedUpdatedAtForRecord(userId, liveItem.entityId);
              const payload = entryToUpdateInput(liveLocal.entry, expected);
              const remote = await repo.update(userId, payload);
              rememberRemoteUpdatedAt(userId, liveItem.entityId, remote.updatedAt);
              const updateSent = captureSentDiaryOp({
                userId,
                recordId: liveItem.entityId,
                op: "update",
                queueId: liveItem.id,
                entry: liveLocal.entry,
                session: owner,
              });
              const ack = acknowledgeDiaryUpdateSuccess(updateSent, remote);
              return { kind: "update" as const, ack };
            }
            return { kind: "noop" as const };
          }
          if (liveItem.entity === "entry" && liveItem.op === "create") {
            const input: CreateBusinessEntryInput = liveLocal?.entry
              ? entryToCreateInput(liveLocal.entry)
              : {
                  ...(liveItem.payload as CreateBusinessEntryInput),
                  clientRecordId:
                    (liveItem.payload as CreateBusinessEntryInput).clientRecordId || liveItem.entityId,
                };
            input.clientRecordId = liveLocal?.entry.id ?? liveItem.entityId;
            const result = await repo.createWithOutcome(userId, input);
            rememberRemoteUpdatedAt(userId, liveItem.entityId, result.record.updatedAt);
            const ack = acknowledgeDiaryCreateSuccess(sent, result.record, result.outcome);
            return { kind: "create" as const, ack };
          }
          if (liveItem.entity === "entry" && liveItem.op === "update") {
            const expected =
              (liveItem.payload as UpdateBusinessEntryInput | null)?.expectedUpdatedAt ??
              expectedUpdatedAtForRecord(userId, liveItem.entityId);
            const payload: UpdateBusinessEntryInput = liveLocal?.entry
              ? entryToUpdateInput(liveLocal.entry, expected)
              : { ...(liveItem.payload as UpdateBusinessEntryInput), expectedUpdatedAt: expected };
            const remote = await repo.update(userId, payload);
            rememberRemoteUpdatedAt(userId, liveItem.entityId, remote.updatedAt);
            const ack = acknowledgeDiaryUpdateSuccess(sent, remote);
            return { kind: "update" as const, ack };
          }
          if (liveItem.entity === "entry" && liveItem.op === "delete") {
            const payload = liveItem.payload as { id: string };
            await repo.hardDelete(userId, payload.id);
            acknowledgeDiaryDeleteSuccess(sent);
            return { kind: "delete" as const };
          }
          return { kind: "noop" as const };
        },
      });
      if (dispatched.skipped) {
        continue;
      }
      const value = dispatched.value;
      if (value.kind === "create" || value.kind === "update") {
        if (value.ack.latestSynced) synced += 1;
      } else if (value.kind === "delete") {
        synced += 1;
      }
    } catch (e) {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      const currentQueue = await syncQueueRepository.getById(item.id);
      if (currentQueue && currentQueue.revision === sent.revision) {
        await syncQueueRepository.markAttempt(item.id, msg);
      }
      const action = acknowledgeDiaryFailure(sent, e);
      if (action.kind === "unauthenticated" || isSyncAuthError(e)) {
        break;
      }
      log.warn("queue item failed", { id: item.id, msg, kind: action.kind });
    }
  }

  return { synced, failed };
}

function cacheRemoteWithoutClobberingIntent(userId: string, remote: BusinessEntry): void {
  const existing = readLocalEntryRecordSync(userId, remote.id);
  if (existing && hasOutstandingLocalIntent(existing.meta)) {
    if (localContentDiffers(existing.entry, remote)) {
      writeLocalEntryRowSync(
        existing.entry,
        {
          syncStatus: "conflict",
          pendingOp: existing.meta.pendingOp,
          remoteConfirmed: existing.meta.remoteConfirmed,
          syncErrorCode: existing.meta.syncErrorCode,
          autoRetry: false,
          localRevision: existing.meta.localRevision,
          ackedRevision: existing.meta.ackedRevision,
          preserveUnspecifiedMeta: true,
        },
        existing
      );
    }
    return;
  }
  void localEntriesRepository.markSynced(remote);
}

export const syncEngine = {
  async flush(userId: string): Promise<{ synced: number; failed: number }> {
    const token = captureAdmissionToken();
    if (!mayIssueRemoteWork(token, userId)) return { synced: 0, failed: 0 };
    if (sessionSyncGate.isLocked()) return { synced: 0, failed: 0 };

    const { assertLiveMutationAllowed, recordConnectivity, recordSuccessfulOnlineValidation } =
      await import("@/auth/offlineCapabilityGuard");
    if (!mayIssueRemoteWork(token, userId)) return { synced: 0, failed: 0 };
    if (sessionSyncGate.isLocked()) return { synced: 0, failed: 0 };

    const NetInfo = (await import("@react-native-community/netinfo")).default;
    const net = await NetInfo.fetch();
    recordConnectivity(Boolean(net.isConnected));
    if (!mayIssueRemoteWork(token, userId)) return { synced: 0, failed: 0 };
    if (!net.isConnected) {
      assertLiveMutationAllowed("sync");
      return { synced: 0, failed: 0 };
    }
    assertLiveMutationAllowed("sync");
    recordSuccessfulOnlineValidation();
    if (!mayIssueRemoteWork(token, userId)) return { synced: 0, failed: 0 };
    if (sessionSyncGate.isLocked()) return { synced: 0, failed: 0 };

    const key = sessionFlushKey(userId, token);
    const prev = flushChainByKey.get(key);
    if (prev) return prev.promise;

    const job: FlushJob = {
      key,
      promise: Promise.resolve({ synced: 0, failed: 0 }),
    };
    job.promise = (async () => {
      try {
        if (!mayIssueRemoteWork(token, userId)) return { synced: 0, failed: 0 };
        if (sessionSyncGate.isLocked()) return { synced: 0, failed: 0 };
        await ensurePendingQueued(userId);
        if (!mayIssueRemoteWork(token, userId)) return { synced: 0, failed: 0 };
        return await processQueue(userId, token);
      } finally {
        if (flushChainByKey.get(key) === job) flushChainByKey.delete(key);
      }
    })();
    flushChainByKey.set(key, job);
    return job.promise;
  },

  async retryUnsyncedEntry(userId: string, entryId: string): Promise<void> {
    const token = captureAdmissionToken();
    await localEntriesRepository.enableAutoRetry(userId, entryId);
    if (!mayIssueRemoteWork(token, userId)) return;
    const record = await localEntriesRepository.getRecord(userId, entryId);
    if (!mayIssueRemoteWork(token, userId)) return;
    if (record) await enqueueOpForRecord(record);
    if (!mayIssueRemoteWork(token, userId)) return;
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
    const token = captureAdmissionToken();
    if (!mayIssueRemoteWork(token, userId)) return 0;
    if (sessionSyncGate.isLocked()) return 0;
    const NetInfo = (await import("@react-native-community/netinfo")).default;
    const net = await NetInfo.fetch();
    if (!mayIssueRemoteWork(token, userId)) return 0;
    if (!net.isConnected) return 0;

    try {
      const remote = await getDiaryRepository().list(userId, { limit: 500 });
      if (!mayIssueRemoteWork(token, userId)) return 0;
      for (const entry of remote) {
        if (!mayIssueRemoteWork(token, userId)) return 0;
        const existing = await localEntriesRepository.getRecord(userId, entry.id);
        if (existing && hasOutstandingLocalIntent(existing.meta)) {
          cacheRemoteWithoutClobberingIntent(userId, entry);
          continue;
        }
        if (existing && detectEntryConflict(existing.entry, entry)) {
          await localEntriesRepository.upsert(existing.entry, "conflict");
        } else {
          await localEntriesRepository.markSynced(entry);
        }
      }
      return remote.length;
    } catch (e) {
      if (isSyncAuthError(e) && mayIssueRemoteWork(token, userId)) {
        sessionSyncGate.lock("session_expired");
      }
      log.warn("pull failed", e);
      return 0;
    }
  },

  async cacheEntry(entry: BusinessEntry): Promise<void> {
    const token = captureAdmissionToken();
    if (token && !mayIssueRemoteWork(token, entry.userId)) return;
    cacheRemoteWithoutClobberingIntent(entry.userId, entry);
  },
};

export const __diarySyncTest = {
  ensurePendingQueued,
  purgeSupersededLocalPlaceholders,
  processQueue,
  resetFlushChain() {
    flushChainByKey.clear();
    resetDiaryRecordWritesForTests();
    queueAdmissionHook = null;
  },
};
