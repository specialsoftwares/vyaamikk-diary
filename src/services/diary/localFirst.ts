import type { BusinessEntry } from "@/domain/businessEntry";
import { AppError } from "@/domain/errors";
import type { CreateBusinessEntryInput, UpdateBusinessEntryInput } from "./types";
import { getDiaryRepository } from "./index";
import { readLocalEntryRecordSync } from "@/repositories/localEntriesRepository";
import {
  persistDiaryCreateIntent,
  persistDiaryUpdateIntent,
} from "@/repositories/diaryLocalIntent";
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
import {
  captureAdmissionToken,
  mayIssueRemoteWork,
  type SyncSessionToken,
} from "@/sync/syncSessionOwnership";
import { entryToUpdateInput } from "@/sync/diarySyncIntent";
import { stableRecordId } from "@/services/records/stableRecordId";
import { createLogger } from "@/utils/logger";
import { logSaveDiagnostic } from "@/services/records/saveDiagnostics";
import { createInitialDocumentHistory } from "@/services/documentHistory";

const log = createLogger("diary/localFirst");

export interface LocalFirstWriteResult {
  entry: BusinessEntry;
  remoteAccepted: boolean;
  failureKind?: ReturnType<typeof classifyAtomicCreateError>;
}

export interface LocalFirstCreateResult extends LocalFirstWriteResult {
  reminderRemoteAccepted?: boolean;
  reminderFailureKind?: ReturnType<typeof classifyAtomicCreateError>;
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
  input: CreateBusinessEntryInput,
  options?: { session?: SyncSessionToken | null }
): Promise<LocalFirstCreateResult> {
  const session =
    options && "session" in options ? options.session ?? null : captureAdmissionToken();
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
          throw new AppError("session_expired", "Session is no longer active.", undefined, {
            remoteNotIssued: true,
          });
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
  input: UpdateBusinessEntryInput,
  options?: { session?: SyncSessionToken | null }
): Promise<LocalFirstWriteResult> {
  const session =
    options && "session" in options ? options.session ?? null : captureAdmissionToken();
  const localNow = readLocalEntryRecordSync(userId, input.id);
  let fallback: BusinessEntry | null = null;
  if (!localNow) {
    if (!mayIssueRemoteWork(session, userId)) {
      throw new AppError("session_expired", "Session is no longer active.", undefined, {
        remoteNotIssued: true,
      });
    }
    fallback = await getDiaryRepository().getById(userId, input.id);
  }

  const persisted = persistDiaryUpdateIntent(userId, input, fallback);
  const pendingCreate = persisted.pendingOp === "create" && !persisted.remoteConfirmed;
  if (pendingCreate) {
    return { entry: persisted.entry, remoteAccepted: false };
  }

  const sent = captureSentDiaryOp({
    userId,
    recordId: input.id,
    op: "update",
    queueId: persisted.queueId,
    entry: persisted.entry,
    session,
    revision: persisted.revision,
    dispatchGeneration: persisted.dispatchGeneration,
  });

  if (!mayIssueRemoteWork(session, userId)) {
    return { entry: persisted.entry, remoteAccepted: false };
  }

  const expectedUpdatedAt = input.expectedUpdatedAt ?? expectedUpdatedAtForRecord(userId, input.id);
  const payload = entryToUpdateInput(persisted.entry, expectedUpdatedAt);

  try {
    const dispatched = await enqueueDiaryRecordWrite({
      userId,
      recordId: input.id,
      revision: sent.revision,
      op: "update",
      session,
      run: async () => {
        if (!mayIssueRemoteWork(session, userId)) {
          throw new AppError("session_expired", "Session is no longer active.", undefined, {
            remoteNotIssued: true,
          });
        }
        const latestExpected = expectedUpdatedAtForRecord(userId, input.id) ?? expectedUpdatedAt;
        return getDiaryRepository().update(userId, { ...payload, expectedUpdatedAt: latestExpected });
      },
    });
    if (dispatched.skipped) {
      return { entry: currentLocal(userId, input.id, persisted.entry), remoteAccepted: false };
    }
    const remote = dispatched.value;
    rememberRemoteUpdatedAt(userId, input.id, remote.updatedAt);
    const ack = acknowledgeDiaryUpdateSuccess(sent, remote);
    await notifySearch();
    return {
      entry: currentLocal(userId, input.id, remote),
      remoteAccepted: ack.applied || ack.latestSynced,
    };
  } catch (e) {
    const fail = acknowledgeDiaryFailure(sent, e);
    if (fail.kind === "network" && mayIssueRemoteWork(session, userId)) {
      void syncEngine.flush(userId).catch(() => undefined);
    }
    return {
      entry: currentLocal(userId, input.id, persisted.entry),
      remoteAccepted: false,
      failureKind: fail.kind,
    };
  }
}
