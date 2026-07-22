import NetInfo from "@react-native-community/netinfo";

import type { BusinessEntry } from "@/domain/businessEntry";
import type {
  CreateBusinessEntryInput,
  UpdateBusinessEntryInput,
} from "@/services/diary/types";
import { getDiaryRepository } from "@/services/diary";
import { localEntriesRepository } from "@/repositories/localEntriesRepository";
import { syncQueueRepository } from "@/repositories/syncQueueRepository";
import { detectEntryConflict } from "@/sync/conflict";
import { isSyncAuthError, sessionSyncGate } from "@/sync/sessionSyncGate";
import { createLogger } from "@/utils/logger";

const log = createLogger("sync");

export type SyncPhase = "idle" | "syncing" | "offline" | "error";

let flushChain: Promise<{ synced: number; failed: number }> | null = null;

function entryToCreateInput(entry: BusinessEntry): CreateBusinessEntryInput {
  return {
    clientRecordId: entry.id.startsWith("local_") ? undefined : entry.id,
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
    // PDF files are device-local — never sync file URIs to cloud.
  };
}

/**
 * Drop stale `local_*` placeholders left behind when an online create succeeded
 * but the temporary row was not removed (legacy bug). Prevents duplicate cloud
 * creates on the next sync flush.
 */
async function purgeSupersededLocalPlaceholders(userId: string): Promise<void> {
  const pending = await localEntriesRepository.listPending(userId);
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
    if (!local.id.startsWith("local_")) continue;
    const twin = synced.find(
      (s) =>
        s.id !== local.id &&
        s.entryType === local.entryType &&
        s.title === local.title &&
        s.entryDate === local.entryDate &&
        Math.abs(s.createdAt - local.createdAt) < 10 * 60 * 1000
    );
    if (twin) {
      await localEntriesRepository.removeById(userId, local.id);
      const queue = await syncQueueRepository.listForUser(userId);
      for (const item of queue) {
        if (item.entity === "entry" && item.entityId === local.id) {
          await syncQueueRepository.remove(item.id);
        }
      }
    }
  }
}

/** Re-queue pending local rows that were never enqueued (or lost from the queue). */
async function ensurePendingQueued(userId: string): Promise<void> {
  await purgeSupersededLocalPlaceholders(userId);
  const pending = await localEntriesRepository.listPending(userId);
  if (pending.length === 0) return;

  const queue = await syncQueueRepository.listForUser(userId);
  const queuedIds = new Set(
    queue.filter((q) => q.entity === "entry").map((q) => q.entityId)
  );

  for (const entry of pending) {
    if (queuedIds.has(entry.id)) continue;
    if (entry.id.startsWith("local_")) {
      await syncQueueRepository.enqueue({
        userId,
        op: "create",
        entity: "entry",
        entityId: entry.id,
        payload: entryToCreateInput(entry),
      });
    } else {
      await syncQueueRepository.enqueue({
        userId,
        op: "update",
        entity: "entry",
        entityId: entry.id,
        payload: entryToUpdateInput(entry),
      });
    }
    queuedIds.add(entry.id);
  }
}

async function processQueue(userId: string): Promise<{ synced: number; failed: number }> {
  let synced = 0;
  let failed = 0;
  const queue = await syncQueueRepository.listForUser(userId);
  const repo = getDiaryRepository();

  for (const item of queue) {
    if (sessionSyncGate.isLocked()) break;
    try {
      if (item.entity === "entry" && item.op === "create") {
        const input = item.payload as CreateBusinessEntryInput;
        const stableId =
          input.clientRecordId ??
          (item.entityId.startsWith("local_") ? undefined : item.entityId);
        const remote = await repo.create(userId, {
          ...input,
          clientRecordId: stableId,
        });
        const local = await localEntriesRepository.getById(userId, item.entityId);
        if (local && detectEntryConflict(local, remote)) {
          await localEntriesRepository.upsert(local, "conflict");
        } else {
          await localEntriesRepository.markSynced(remote);
          if (item.entityId !== remote.id) {
            await localEntriesRepository.removeById(userId, item.entityId);
          }
        }
      } else if (item.entity === "entry" && item.op === "update") {
        const payload = item.payload as { id: string } & Record<string, unknown>;
        const remote = await repo.update(userId, payload as Parameters<typeof repo.update>[1]);
        await localEntriesRepository.markSynced(remote);
      } else if (item.entity === "entry" && item.op === "delete") {
        const payload = item.payload as { id: string };
        await repo.hardDelete(userId, payload.id);
        await localEntriesRepository.removeById(userId, payload.id);
      }
      await syncQueueRepository.remove(item.id);
      synced += 1;
    } catch (e) {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      await syncQueueRepository.markAttempt(item.id, msg);
      if (isSyncAuthError(e)) {
        sessionSyncGate.lock("session_expired");
        break;
      }
      log.warn("queue item failed", { id: item.id, msg });
    }
  }

  return { synced, failed };
}

export const syncEngine = {
  async flush(userId: string): Promise<{ synced: number; failed: number }> {
    if (sessionSyncGate.isLocked()) return { synced: 0, failed: 0 };

    // Validate session/device capability before uploading mutations.
    const { assertLiveMutationAllowed, recordConnectivity, recordSuccessfulOnlineValidation } =
      await import("@/auth/offlineCapabilityGuard");
    const net = await NetInfo.fetch();
    recordConnectivity(Boolean(net.isConnected));
    if (!net.isConnected) {
      assertLiveMutationAllowed("sync"); // may throw OFFLINE_READ_ONLY after 24h
      return { synced: 0, failed: 0 };
    }
    // Online: require capability (revoked sessions still blocked).
    assertLiveMutationAllowed("sync");
    recordSuccessfulOnlineValidation();

    if (flushChain) return flushChain;

    flushChain = (async () => {
      try {
        await ensurePendingQueued(userId);
        return await processQueue(userId);
      } finally {
        flushChain = null;
      }
    })();

    return flushChain;
  },

  /**
   * Pull cloud entries into local cache after login on a new device.
   * Non-blocking — failures are logged, not thrown to UI.
   */
  async pullEntriesToLocalCache(userId: string): Promise<number> {
    if (sessionSyncGate.isLocked()) return 0;
    const net = await NetInfo.fetch();
    if (!net.isConnected) return 0;

    try {
      const remote = await getDiaryRepository().list(userId, { limit: 500 });
      for (const entry of remote) {
        const existing = await localEntriesRepository.getById(userId, entry.id);
        if (existing && detectEntryConflict(existing, entry)) {
          await localEntriesRepository.upsert(existing, "conflict");
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
    await localEntriesRepository.markSynced(entry);
  },
};
