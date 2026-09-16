import type { BusinessEntry } from "@/domain/businessEntry";
import { AppError } from "@/domain/errors";
import type { CreateBusinessEntryInput, UpdateBusinessEntryInput } from "./types";
import { getDiaryRepository } from "./index";
import {
  localEntriesRepository,
  readLocalEntryRecordSync,
} from "@/repositories/localEntriesRepository";
import { persistDiaryCreateIntent, persistDiaryUpdateIntent } from "@/repositories/diaryLocalIntent";
import { syncEngine } from "@/sync/syncEngine";
import { classifyAtomicCreateError } from "@/billing/optionC/classifyCreateError";
import { isSyncAuthError } from "@/sync/sessionSyncGate";
import {
  acknowledgeDiaryCreateSuccess,
  acknowledgeDiaryFailure,
  acknowledgeDiaryUpdateSuccess,
  captureSentDiaryOp,
  expectedUpdatedAtForRecord,
} from "@/sync/diaryAck";
import {
  enqueueDiaryRecordWrite,
  rememberRemoteUpdatedAt,
} from "@/sync/diaryRecordWrites";
import { captureAdmissionToken, mayIssueRemoteWork } from "@/sync/syncSessionOwnership";
import { entryToUpdateInput } from "@/sync/diarySyncIntent";
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

function currentLocal(userId: string, id: string, fallback: BusinessEntry): BusinessEntry {
  return readLocalEntryRecordSync(userId, id)?.entry ?? fallback;
}

async function notifySearch(): Promise<void> {
  try {
    const { notifySearchIndexChanged } = await import("@/services/search");
    notifySearchIndexChanged();
  } catch {
    // Search index is UI-side; tests may not load React Native.
  }
}

/**
 * Persist a stable create identity, then attempt the same production remote
 * create used by queue flush. Local rows are never marked synced until the
 * server accepts the record, and a success only acknowledges the sent revision.
 */
export async function createEntryLocalFirst(
  userId: string,
  input: CreateBusinessEntryInput
): Promise<LocalFirstCreateResult> {
  const session = captureAdmissionToken();
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

  const queueId = persistDiaryCreateIntent(localEntry, createInput);
  const sent = captureSentDiaryOp({
    userId,
    recordId,
    op: "create",
    queueId,
    entry: localEntry,
    session,
  });

  if (!mayIssueRemoteWork(session, userId)) {
    return {
      entry: currentLocal(userId, recordId, localEntry),
      remoteAccepted: false,
    };
  }

  try {
    const dispatched = await enqueueDiaryRecordWrite({
      userId,
      recordId,
      revision: sent.revision,
      op: "create",
      session,
      run: async () => {
        if (!mayIssueRemoteWork(session, userId)) {
          throw new AppError("session_expired", "Session is no longer active.");
        }
        return getDiaryRepository().createWithOutcome(userId, createInput);
      },
    });
    if (dispatched.skipped) {
      return {
        entry: currentLocal(userId, recordId, localEntry),
        remoteAccepted: false,
      };
    }
    const result = dispatched.value;
    logSaveDiagnostic({
      phase: "remote_write",
      recordKind: "business_entry",
      userId,
      clientRecordId: recordId,
      remoteId: result.record.id,
      source: "create",
    });
    rememberRemoteUpdatedAt(userId, recordId, result.record.updatedAt);
    const ack = acknowledgeDiaryCreateSuccess(sent, result.record, result.outcome);
    await notifySearch();
    return {
      entry: currentLocal(userId, recordId, result.record),
      remoteAccepted: ack.latestSynced,
    };
  } catch (e) {
    const fail = acknowledgeDiaryFailure(sent, e);
    const kind = fail.kind;
    if (kind === "unauthenticated" || isSyncAuthError(e)) {
      log.warn("create blocked by auth — kept local", { id: localEntry.id });
      return {
        entry: currentLocal(userId, recordId, localEntry),
        remoteAccepted: false,
        failureKind: "unauthenticated",
      };
    }
    if (kind === "network") {
      if (mayIssueRemoteWork(session, userId)) {
        void syncEngine.flush(userId).catch(() => undefined);
      }
      return {
        entry: currentLocal(userId, recordId, localEntry),
        remoteAccepted: false,
        failureKind: "network",
      };
    }
    return {
      entry: currentLocal(userId, recordId, localEntry),
      remoteAccepted: false,
      failureKind: kind,
    };
  }
}

export async function updateEntryLocalFirst(
  userId: string,
  input: UpdateBusinessEntryInput
): Promise<BusinessEntry> {
  const session = captureAdmissionToken();
  const existingRecord =
    (await localEntriesRepository.getRecord(userId, input.id)) ??
    (await getDiaryRepository().getById(userId, input.id).then((entry) =>
      entry ? { entry, meta: null } : null
    ));
  const existing = existingRecord && "entry" in existingRecord ? existingRecord.entry : null;
  if (!existing) throw new AppError("not_found", "Entry not found");

  const merged = mergeBusinessEntryUpdate(existing, input);
  const localRecord = readLocalEntryRecordSync(userId, input.id);
  const queueId = persistDiaryUpdateIntent(merged, input, localRecord);

  const pendingCreate = localRecord?.meta.pendingOp === "create" && !localRecord.meta.remoteConfirmed;
  if (pendingCreate) {
    return merged;
  }

  const sent = captureSentDiaryOp({
    userId,
    recordId: input.id,
    op: "update",
    queueId,
    entry: merged,
    session,
  });

  if (!mayIssueRemoteWork(session, userId)) {
    return currentLocal(userId, input.id, merged);
  }

  const expectedUpdatedAt = input.expectedUpdatedAt ?? expectedUpdatedAtForRecord(userId, input.id);
  const payload = entryToUpdateInput(merged, expectedUpdatedAt);

  try {
    const dispatched = await enqueueDiaryRecordWrite({
      userId,
      recordId: input.id,
      revision: sent.revision,
      op: "update",
      session,
      run: async () => {
        if (!mayIssueRemoteWork(session, userId)) {
          throw new AppError("session_expired", "Session is no longer active.");
        }
        const latestExpected = expectedUpdatedAtForRecord(userId, input.id) ?? expectedUpdatedAt;
        return getDiaryRepository().update(userId, { ...payload, expectedUpdatedAt: latestExpected });
      },
    });
    if (dispatched.skipped) {
      return currentLocal(userId, input.id, merged);
    }
    const remote = dispatched.value;
    rememberRemoteUpdatedAt(userId, input.id, remote.updatedAt);
    acknowledgeDiaryUpdateSuccess(sent, remote);
    await notifySearch();
    return currentLocal(userId, input.id, remote);
  } catch (e) {
    acknowledgeDiaryFailure(sent, e);
    const kind = classifyAtomicCreateError(e);
    if (kind === "network" && mayIssueRemoteWork(session, userId)) {
      void syncEngine.flush(userId).catch(() => undefined);
    }
    return currentLocal(userId, input.id, merged);
  }
}
