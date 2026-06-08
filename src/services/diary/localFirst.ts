import type { BusinessEntry } from "@/domain/businessEntry";
import { toAppError } from "@/domain/errors";
import type { CreateBusinessEntryInput, UpdateBusinessEntryInput } from "./types";
import { notifySearchIndexChanged } from "@/services/search";
import { getDiaryRepository } from "./index";
import { localEntriesRepository } from "@/repositories/localEntriesRepository";
import { syncQueueRepository } from "@/repositories/syncQueueRepository";
import { syncEngine } from "@/sync/syncEngine";
import { isSyncAuthError, sessionSyncGate } from "@/sync/sessionSyncGate";
import { mergeBusinessEntryUpdate } from "@/services/diary/mergeEntryUpdate";
import { createLogger } from "@/utils/logger";
import { logSaveDiagnostic } from "@/services/records/saveDiagnostics";
import { shortId } from "@/utils/id";

const log = createLogger("diary/localFirst");

function isOfflineError(error: unknown): boolean {
  const err = toAppError(error);
  const msg = err.message ?? "";
  return (
    /network|offline|fetch|timeout|failed to get|unavailable/i.test(msg) ||
    err.code === "unknown"
  );
}

/**
 * Persist locally first, then attempt remote. Queue when offline; lock sync on auth errors only.
 */
export async function createEntryLocalFirst(
  userId: string,
  input: CreateBusinessEntryInput
): Promise<BusinessEntry> {
  const now = Date.now();
  const pendingId = input.clientRecordId ?? `local_${shortId("entry")}`;
  logSaveDiagnostic({
    phase: "local_write",
    recordKind: "business_entry",
    userId,
    clientRecordId: input.clientRecordId,
    localId: pendingId,
    source: "create",
  });
  const localEntry = await localEntriesRepository.createPending(userId, (id) => ({
    id,
    userId,
    ueid: input.ueid,
    entryType: input.entryType,
    title: input.title,
    entryDate: input.entryDate,
    notes: input.notes ?? null,
    reminder: input.reminder ?? null,
    location: input.location ?? null,
    attachments: input.attachments ?? [],
    payload: input.payload,
    source: input.source ?? "composer",
    status: input.status ?? "active",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    pdfUri: null,
    documentHistory: {
      firstGeneratedAt: null,
      lastGeneratedAt: null,
      lastEditedAt: null,
      versionNumber: 1,
      editHistory: [],
      pdfGenerationHistory: [],
    },
  }), pendingId);

  const createInput: CreateBusinessEntryInput = {
    ...input,
    clientRecordId: input.clientRecordId ?? pendingId,
  };

  try {
    const remote = await getDiaryRepository().create(userId, createInput);
    logSaveDiagnostic({
      phase: "remote_write",
      recordKind: "business_entry",
      userId,
      clientRecordId: createInput.clientRecordId,
      remoteId: remote.id,
      source: "create",
    });
    await localEntriesRepository.markSynced(remote);
    if (localEntry.id !== remote.id) {
      await localEntriesRepository.removeById(userId, localEntry.id);
    }
    notifySearchIndexChanged();
    return remote;
  } catch (e) {
    if (isSyncAuthError(e)) {
      sessionSyncGate.lock("session_expired");
      log.warn("create blocked by auth — kept local", { id: localEntry.id });
      return localEntry;
    }
    if (isOfflineError(e)) {
      await syncQueueRepository.enqueue({
        userId,
        op: "create",
        entity: "entry",
        entityId: localEntry.id,
        payload: createInput,
      });
      logSaveDiagnostic({
        phase: "sync_enqueue",
        recordKind: "business_entry",
        userId,
        localId: localEntry.id,
        source: "create",
      });
      void syncEngine.flush(userId);
      return localEntry;
    }
    throw e;
  }
}

export async function updateEntryLocalFirst(
  userId: string,
  input: UpdateBusinessEntryInput
): Promise<BusinessEntry> {
  const existing =
    (await localEntriesRepository.getById(userId, input.id)) ??
    (await getDiaryRepository().getById(userId, input.id));
  if (!existing) throw new Error("Entry not found");

  const merged = mergeBusinessEntryUpdate(existing, input);

  await localEntriesRepository.upsert(merged, "pending");

  try {
    const remote = await getDiaryRepository().update(userId, input);
    await localEntriesRepository.markSynced(remote);
    notifySearchIndexChanged();
    return remote;
  } catch (e) {
    if (isSyncAuthError(e)) {
      sessionSyncGate.lock("session_expired");
      return merged;
    }
    if (isOfflineError(e)) {
      await syncQueueRepository.enqueue({
        userId,
        op: "update",
        entity: "entry",
        entityId: input.id,
        payload: input,
      });
      void syncEngine.flush(userId);
      return merged;
    }
    throw e;
  }
}
