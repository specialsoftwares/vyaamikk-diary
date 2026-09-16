import type { BusinessEntry } from "@/domain/businessEntry";
import { AppError } from "@/domain/errors";
import { getLocalDatabase } from "@/localDb/database";
import {
  readLocalEntryRecordSync,
  writeLocalEntryRowSync,
  type PendingOp,
} from "@/repositories/localEntriesRepository";
import {
  enqueueSync,
  readSyncQueueItemSync,
  removeSyncQueueIfRevision,
} from "@/repositories/syncQueueRepository";
import { classifyAtomicCreateError } from "@/billing/optionC/classifyCreateError";
import { isSyncAuthError, sessionSyncGate } from "@/sync/sessionSyncGate";
import {
  entryToUpdateInput,
  localContentDiffers,
} from "@/sync/diarySyncIntent";
import {
  syncSessionOwnership,
  type SyncSessionToken,
} from "@/sync/syncSessionOwnership";
import type { DiaryCreateOutcome } from "@/services/diary/types";

export type SentDiaryOp = {
  userId: string;
  recordId: string;
  op: PendingOp;
  revision: number;
  queueId: string | null;
  sentEntry: BusinessEntry;
  session: SyncSessionToken | null;
};

export function captureSentDiaryOp(args: {
  userId: string;
  recordId: string;
  op: PendingOp;
  queueId: string | null;
  entry: BusinessEntry;
}): SentDiaryOp {
  const record = readLocalEntryRecordSync(args.userId, args.recordId);
  let revision = record?.meta.localRevision ?? 0;
  if (args.queueId) {
    const queued = readSyncQueueItemSync(args.queueId);
    if (queued) revision = queued.revision;
  }
  return {
    userId: args.userId,
    recordId: args.recordId,
    op: args.op,
    revision,
    queueId: args.queueId,
    sentEntry: record?.entry ?? args.entry,
    session: syncSessionOwnership.capture(),
  };
}

function withLocalTx(fn: () => void): void {
  getLocalDatabase().withTransactionSync(fn);
}

function removeAckedQueue(sent: SentDiaryOp): void {
  if (sent.queueId) {
    removeSyncQueueIfRevision(sent.queueId, sent.revision);
  }
  const db = getLocalDatabase();
  db.runSync(
    `DELETE FROM sync_queue WHERE user_id = ? AND entity = ? AND entity_id = ? AND op = ? AND revision = ?`,
    [sent.userId, "entry", sent.recordId, sent.op, sent.revision]
  );
}

function convertCreateQueueToUpdate(
  userId: string,
  recordId: string,
  entry: BusinessEntry,
  revision: number,
  expectedUpdatedAt?: number
): void {
  const payload = entryToUpdateInput(entry, expectedUpdatedAt);
  const encoded = JSON.stringify(payload);
  const db = getLocalDatabase();
  db.runSync(
    `UPDATE sync_queue SET op = ?, payload_json = ?, revision = ?, last_error = NULL
      WHERE user_id = ? AND entity = ? AND entity_id = ? AND op = ?`,
    ["update", encoded, revision, userId, "entry", recordId, "create"]
  );
  enqueueSync(
    {
      userId,
      op: "update",
      entity: "entry",
      entityId: recordId,
      payload,
      revision,
    },
    { replacePayload: true }
  );
}

export type DiaryAckResult = {
  applied: boolean;
  latestSynced: boolean;
};

export function acknowledgeDiaryCreateSuccess(
  sent: SentDiaryOp,
  remote: BusinessEntry,
  outcome: DiaryCreateOutcome
): DiaryAckResult {
  let result: DiaryAckResult = { applied: true, latestSynced: false };
  withLocalTx(() => {
    const current = readLocalEntryRecordSync(sent.userId, sent.recordId);
    if (!current) {
      removeAckedQueue(sent);
      result = { applied: true, latestSynced: true };
      return;
    }
    const laterLocalEdits = current.meta.localRevision !== sent.revision;
    const sentVsRemote = localContentDiffers(sent.sentEntry, remote);
    const legacyAmbiguous = sent.revision === 0 && current.meta.pendingOp == null;

    if (!laterLocalEdits) {
      if (outcome === "existing" && sentVsRemote) {
        if (legacyAmbiguous) {
          writeLocalEntryRowSync(
            current.entry,
            {
              syncStatus: "conflict",
              pendingOp: current.meta.pendingOp,
              remoteConfirmed: true,
              syncErrorCode: null,
              autoRetry: false,
              localRevision: current.meta.localRevision,
              ackedRevision: sent.revision,
            },
            current
          );
          removeAckedQueue(sent);
          result = { applied: true, latestSynced: false };
          return;
        }
        writeLocalEntryRowSync(
          remote,
          {
            syncStatus: "synced",
            pendingOp: null,
            remoteConfirmed: true,
            syncErrorCode: null,
            autoRetry: true,
            localRevision: current.meta.localRevision,
            ackedRevision: current.meta.localRevision,
          },
          current
        );
        removeAckedQueue(sent);
        result = { applied: true, latestSynced: true };
        return;
      }
      writeLocalEntryRowSync(
        remote,
        {
          syncStatus: "synced",
          pendingOp: null,
          remoteConfirmed: true,
          syncErrorCode: null,
          autoRetry: true,
          localRevision: current.meta.localRevision,
          ackedRevision: current.meta.localRevision,
        },
        current
      );
      removeAckedQueue(sent);
      result = { applied: true, latestSynced: true };
      return;
    }

    if (outcome === "existing" && sentVsRemote) {
      writeLocalEntryRowSync(
        current.entry,
        {
          syncStatus: "conflict",
          pendingOp: current.meta.pendingOp === "delete" ? "delete" : current.meta.pendingOp,
          remoteConfirmed: true,
          syncErrorCode: null,
          autoRetry: false,
          localRevision: current.meta.localRevision,
          ackedRevision: sent.revision,
        },
        current
      );
      removeAckedQueue(sent);
      result = { applied: true, latestSynced: false };
      return;
    }

    const nextOp: PendingOp = current.meta.pendingOp === "delete" ? "delete" : "update";
    writeLocalEntryRowSync(
      current.entry,
      {
        syncStatus: "pending",
        pendingOp: nextOp,
        remoteConfirmed: true,
        syncErrorCode: null,
        autoRetry: true,
        localRevision: current.meta.localRevision,
        ackedRevision: sent.revision,
      },
      current
    );
    removeAckedQueue(sent);
    if (nextOp === "update") {
      convertCreateQueueToUpdate(
        sent.userId,
        sent.recordId,
        current.entry,
        current.meta.localRevision,
        remote.updatedAt
      );
    }
    result = { applied: true, latestSynced: false };
  });
  return result;
}

export function acknowledgeDiaryUpdateSuccess(sent: SentDiaryOp, remote: BusinessEntry): DiaryAckResult {
  let result: DiaryAckResult = { applied: true, latestSynced: false };
  withLocalTx(() => {
    const current = readLocalEntryRecordSync(sent.userId, sent.recordId);
    if (!current) {
      removeAckedQueue(sent);
      result = { applied: true, latestSynced: true };
      return;
    }
    if (current.meta.localRevision !== sent.revision) {
      writeLocalEntryRowSync(
        current.entry,
        {
          syncStatus: current.meta.pendingOp ? "pending" : current.meta.syncStatus,
          pendingOp: current.meta.pendingOp,
          remoteConfirmed: true,
          syncErrorCode: current.meta.syncErrorCode,
          autoRetry: current.meta.autoRetry,
          localRevision: current.meta.localRevision,
          ackedRevision: Math.max(current.meta.ackedRevision, sent.revision),
        },
        current
      );
      removeAckedQueue(sent);
      result = { applied: true, latestSynced: false };
      return;
    }
    writeLocalEntryRowSync(
      remote,
      {
        syncStatus: "synced",
        pendingOp: null,
        remoteConfirmed: true,
        syncErrorCode: null,
        autoRetry: true,
        localRevision: current.meta.localRevision,
        ackedRevision: current.meta.localRevision,
      },
      current
    );
    removeAckedQueue(sent);
    result = { applied: true, latestSynced: true };
  });
  return result;
}

export function acknowledgeDiaryDeleteSuccess(sent: SentDiaryOp): void {
  withLocalTx(() => {
    const current = readLocalEntryRecordSync(sent.userId, sent.recordId);
    if (current && current.meta.localRevision !== sent.revision) {
      removeAckedQueue(sent);
      return;
    }
    const db = getLocalDatabase();
    db.runSync("DELETE FROM entries_local WHERE user_id = ? AND id = ?", [sent.userId, sent.recordId]);
    removeAckedQueue(sent);
  });
}

export function acknowledgeDiaryFailure(
  sent: SentDiaryOp,
  error: unknown
): { kind: ReturnType<typeof classifyAtomicCreateError>; applied: boolean } {
  const kind = classifyAtomicCreateError(error);
  if ((kind === "unauthenticated" || isSyncAuthError(error)) && syncSessionOwnership.isActiveOwner(sent.session)) {
    sessionSyncGate.lock("session_expired");
  }

  let applied = false;
  withLocalTx(() => {
    const current = readLocalEntryRecordSync(sent.userId, sent.recordId);
    const queue = sent.queueId ? readSyncQueueItemSync(sent.queueId) : null;
    const revisionMatches = current != null && current.meta.localRevision === sent.revision;
    const queueMatches = queue != null && queue.revision === sent.revision;

    if (!revisionMatches) {
      return;
    }

    applied = true;
    if (
      error instanceof AppError &&
      (error.details?.remoteChanged === true || error.message === "Entry changed remotely.")
    ) {
      writeLocalEntryRowSync(
        current.entry,
        {
          syncStatus: "conflict",
          pendingOp: current.meta.pendingOp,
          remoteConfirmed: current.meta.remoteConfirmed || sent.op !== "create",
          syncErrorCode: "conflict",
          autoRetry: false,
          localRevision: current.meta.localRevision,
          ackedRevision: current.meta.ackedRevision,
        },
        current
      );
      return;
    }

    if (kind === "network") {
      return;
    }

    writeLocalEntryRowSync(
      current.entry,
      {
        syncStatus: "error",
        pendingOp: current.meta.pendingOp,
        remoteConfirmed: sent.op === "create" ? current.meta.remoteConfirmed : true,
        syncErrorCode: kind,
        autoRetry: false,
        localRevision: current.meta.localRevision,
        ackedRevision: current.meta.ackedRevision,
      },
      current
    );
    if (sent.op === "create" && kind !== "unauthenticated") {
      if (queueMatches && sent.queueId) {
        removeSyncQueueIfRevision(sent.queueId, sent.revision);
      } else {
        const db = getLocalDatabase();
        db.runSync(
          `DELETE FROM sync_queue WHERE user_id = ? AND entity = ? AND entity_id = ? AND op = ? AND revision = ?`,
          [sent.userId, "entry", sent.recordId, "create", sent.revision]
        );
      }
    }
  });

  return { kind, applied };
}
