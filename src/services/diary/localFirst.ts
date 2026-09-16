import type { BusinessEntry } from "@/domain/businessEntry";
import { AppError } from "@/domain/errors";
import type { CreateBusinessEntryInput, UpdateBusinessEntryInput } from "./types";
import { getDiaryRepository } from "./index";
import {
  localEntriesRepository,
  readLocalEntryRecordSync,
} from "@/repositories/localEntriesRepository";
import { persistDiaryCreateIntent, persistDiaryUpdateIntent, persistRemoteAccepted } from "@/repositories/diaryLocalIntent";
import { syncQueueRepository } from "@/repositories/syncQueueRepository";
import { syncEngine } from "@/sync/syncEngine";
import { classifyAtomicCreateError } from "@/billing/optionC/classifyCreateError";
import { isSyncAuthError, sessionSyncGate } from "@/sync/sessionSyncGate";
import { mergeBusinessEntryUpdate } from "@/services/diary/mergeEntryUpdate";
import { stableRecordId } from "@/services/records/stableRecordId";
import { createLogger } from "@/utils/logger";
import { logSaveDiagnostic } from "@/services/records/saveDiagnostics";
import { createInitialDocumentHistory } from "@/services/documentHistory";

const log = createLogger("diary/localFirst");

export interface LocalFirstCreateResult {
  entry: BusinessEntry;
  remoteAccepted: boolean;
  failureKind?: ReturnType<typeof classifyAtomicCreateError>;
}

async function applyCreateFailure(userId: string, entry: BusinessEntry, error: unknown): Promise<LocalFirstCreateResult> {
  const kind = classifyAtomicCreateError(error);
  if (kind === "unauthenticated" || isSyncAuthError(error)) {
    sessionSyncGate.lock("session_expired");
    log.warn("create blocked by auth — kept local", { id: entry.id });
    return { entry, remoteAccepted: false, failureKind: "unauthenticated" };
  }
  if (kind === "network") {
    void syncEngine.flush(userId).catch(() => undefined);
    return { entry, remoteAccepted: false, failureKind: "network" };
  }
  await localEntriesRepository.suspendAutoRetry(userId, entry.id, kind);
  await syncQueueRepository.removeForEntity(userId, "entry", entry.id, "create");
  return { entry, remoteAccepted: false, failureKind: kind };
}

/**
 * Persist a stable create identity, then attempt the same production remote
 * create used by queue flush. Local rows are never marked synced until the
 * server accepts the record.
 */
export async function createEntryLocalFirst(
  userId: string,
  input: CreateBusinessEntryInput
): Promise<LocalFirstCreateResult> {
  const now = Date.now();
  const recordId = stableRecordId(input.clientRecordId, "en");
  const createInput: CreateBusinessEntryInput = { ...input, clientRecordId: recordId };
  const localEntry: BusinessEntry = {
    id: recordId,
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
    documentHistory: createInitialDocumentHistory(),
  };

  logSaveDiagnostic({
    phase: "local_write",
    recordKind: "business_entry",
    userId,
    clientRecordId: recordId,
    localId: recordId,
    source: "create",
  });

  persistDiaryCreateIntent(localEntry, createInput);

  try {
    const remote = await getDiaryRepository().create(userId, createInput);
    logSaveDiagnostic({
      phase: "remote_write",
      recordKind: "business_entry",
      userId,
      clientRecordId: recordId,
      remoteId: remote.id,
      source: "create",
    });
    persistRemoteAccepted(userId, remote, localEntry, null);
    try {
      const { notifySearchIndexChanged } = await import("@/services/search");
      notifySearchIndexChanged();
    } catch {
      // Search index is UI-side; tests may not load React Native.
    }
    return { entry: remote, remoteAccepted: true };
  } catch (e) {
    return await applyCreateFailure(userId, localEntry, e);
  }
}

export async function updateEntryLocalFirst(
  userId: string,
  input: UpdateBusinessEntryInput
): Promise<BusinessEntry> {
  const existingRecord =
    (await localEntriesRepository.getRecord(userId, input.id)) ??
    (await getDiaryRepository().getById(userId, input.id).then((entry) =>
      entry ? { entry, meta: null } : null
    ));
  const existing = existingRecord && "entry" in existingRecord ? existingRecord.entry : null;
  if (!existing) throw new AppError("not_found", "Entry not found");

  const merged = mergeBusinessEntryUpdate(existing, input);
  const localRecord = readLocalEntryRecordSync(userId, input.id);
  persistDiaryUpdateIntent(merged, input, localRecord);

  const pendingCreate = localRecord?.meta.pendingOp === "create" && !localRecord.meta.remoteConfirmed;
  if (pendingCreate) {
    return merged;
  }

  try {
    const remote = await getDiaryRepository().update(userId, input);
    await localEntriesRepository.markSynced(remote);
    try {
      const { notifySearchIndexChanged } = await import("@/services/search");
      notifySearchIndexChanged();
    } catch {
      // Search index is UI-side.
    }
    return remote;
  } catch (e) {
    if (isSyncAuthError(e)) {
      sessionSyncGate.lock("session_expired");
      return merged;
    }
    const kind = classifyAtomicCreateError(e);
    if (kind === "network") {
      void syncEngine.flush(userId).catch(() => undefined);
      return merged;
    }
    await localEntriesRepository.suspendAutoRetry(userId, input.id, kind);
    return merged;
  }
}
