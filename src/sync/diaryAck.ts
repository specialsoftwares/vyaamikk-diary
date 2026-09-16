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
  rememberRemoteUpdatedAt,
  peekRemoteUpdatedAt,
} from "@/sync/diaryRecordWrites";
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
  originRevision: number;
  originEntry: BusinessEntry | null;
  originOp: PendingOp | null;
  dispatchGeneration: number;
  session: SyncSessionToken | null;
};

export function captureSentDiaryOp(args: {
  userId: string;
  recordId: string;
  op: PendingOp;
  queueId: string | null;
  entry: BusinessEntry;
  session: SyncSessionToken | null;
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
    originRevision: record?.meta.originRevision ?? 0,
    originEntry: record?.meta.originEntry ?? null,
    originOp: record?.meta.originOp ?? null,
    dispatchGeneration: record?.meta.dispatchGeneration ?? 0,
    session: args.session,
  };
}

function withLocalTx(fn: () => void): void {
  getLocalDatabase().withTransactionSync(fn);
}

function maxAcked(current: number, sent: number): number {
  return Math.max(current, sent);
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

function hasDurableOrigin(sent: SentDiaryOp): boolean {
  return sent.originRevision > 0 && sent.originEntry != null;
}

function followUpAfterOrigin(currentEntry: BusinessEntry, currentRevision: number, sent: SentDiaryOp): boolean {
  const originRevision = hasDurableOrigin(sent) ? sent.originRevision : sent.revision;
  if (currentRevision > originRevision) return true;
  const origin = sent.originEntry;
  if (origin && localContentDiffers(currentEntry, origin)) return true;
  return false;
}

function editsAfterThisSend(currentEntry: BusinessEntry, currentRevision: number, sent: SentDiaryOp): boolean {
  if (currentRevision > sent.revision) return true;
  return currentRevision === sent.revision && localContentDiffers(currentEntry, sent.sentEntry);
}

function revisionSettled(currentAcked: number, currentPending: PendingOp | null, sent: SentDiaryOp): boolean {
  if (currentAcked < sent.revision) return false;
  if (sent.op === "create" && currentPending === "update") return true;
  if (sent.op === "create" && currentPending == null) return true;
  if (currentPending && currentPending !== sent.op && currentAcked >= sent.revision) return true;
  return currentPending == null;
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
    rememberRemoteUpdatedAt(sent.userId, sent.recordId, remote.updatedAt);
    const acked = maxAcked(current.meta.ackedRevision, sent.revision);

    if (revisionSettled(current.meta.ackedRevision, current.meta.pendingOp, sent)) {
      removeAckedQueue(sent);
      writeLocalEntryRowSync(
        current.entry,
        {
          syncStatus: current.meta.pendingOp ? current.meta.syncStatus : current.meta.syncStatus,
          pendingOp: current.meta.pendingOp,
          remoteConfirmed: true,
          syncErrorCode: current.meta.syncErrorCode,
          autoRetry: current.meta.autoRetry,
          localRevision: current.meta.localRevision,
          ackedRevision: acked,
          remoteUpdatedAt: remote.updatedAt,
          preserveUnspecifiedMeta: true,
        },
        current
      );
      result = {
        applied: false,
        latestSynced: current.meta.syncStatus === "synced" && current.meta.pendingOp == null,
      };
      return;
    }

    if (outcome === "created" && editsAfterThisSend(current.entry, current.meta.localRevision, sent)) {
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
          ackedRevision: acked,
          originRevision: current.meta.localRevision,
          originOp: nextOp,
          originEntry: current.entry,
          remoteUpdatedAt: remote.updatedAt,
          preserveUnspecifiedMeta: true,
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
      return;
    }

    const laterThanOrigin = followUpAfterOrigin(current.entry, current.meta.localRevision, sent);
    const originEntry = sent.originEntry ?? sent.sentEntry;
    const originVsRemote = localContentDiffers(originEntry, remote);
    const legacyAmbiguous = !hasDurableOrigin(sent);

    if (outcome === "existing" && laterThanOrigin) {
      if (legacyAmbiguous || originVsRemote) {
        writeLocalEntryRowSync(
          current.entry,
          {
            syncStatus: "conflict",
            pendingOp: current.meta.pendingOp === "delete" ? "delete" : current.meta.pendingOp,
            remoteConfirmed: true,
            syncErrorCode: null,
            autoRetry: false,
            localRevision: current.meta.localRevision,
            ackedRevision: acked,
            remoteUpdatedAt: remote.updatedAt,
            preserveUnspecifiedMeta: true,
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
          ackedRevision: acked,
          originRevision: current.meta.localRevision,
          originOp: nextOp,
          originEntry: current.entry,
          remoteUpdatedAt: remote.updatedAt,
          preserveUnspecifiedMeta: true,
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
      return;
    }

    if (outcome === "existing" && originVsRemote) {
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
            ackedRevision: acked,
            remoteUpdatedAt: remote.updatedAt,
            preserveUnspecifiedMeta: true,
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
          originRevision: current.meta.localRevision,
          originOp: null,
          originEntry: remote,
          remoteUpdatedAt: remote.updatedAt,
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
        originRevision: current.meta.localRevision,
        originOp: null,
        originEntry: remote,
        remoteUpdatedAt: remote.updatedAt,
      },
      current
    );
    removeAckedQueue(sent);
    result = { applied: true, latestSynced: true };
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
    rememberRemoteUpdatedAt(sent.userId, sent.recordId, remote.updatedAt);
    const acked = maxAcked(current.meta.ackedRevision, sent.revision);

    if (current.meta.ackedRevision >= sent.revision && current.meta.pendingOp !== "update") {
      removeAckedQueue(sent);
      writeLocalEntryRowSync(
        current.entry,
        {
          syncStatus: current.meta.syncStatus,
          pendingOp: current.meta.pendingOp,
          remoteConfirmed: true,
          syncErrorCode: current.meta.syncErrorCode,
          autoRetry: current.meta.autoRetry,
          localRevision: current.meta.localRevision,
          ackedRevision: acked,
          remoteUpdatedAt: remote.updatedAt,
          preserveUnspecifiedMeta: true,
        },
        current
      );
      result = {
        applied: false,
        latestSynced: current.meta.syncStatus === "synced" && current.meta.pendingOp == null,
      };
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
          ackedRevision: acked,
          remoteUpdatedAt: remote.updatedAt,
          preserveUnspecifiedMeta: true,
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
        originRevision: current.meta.localRevision,
        originOp: null,
        originEntry: remote,
        remoteUpdatedAt: remote.updatedAt,
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
    if (current && (current.meta.localRevision !== sent.revision || current.meta.ackedRevision >= sent.revision)) {
      removeAckedQueue(sent);
      return;
    }
    const db = getLocalDatabase();
    db.runSync("DELETE FROM entries_local WHERE user_id = ? AND id = ?", [sent.userId, sent.recordId]);
    removeAckedQueue(sent);
  });
}

function staleFailureApplies(sent: SentDiaryOp): boolean {
  const current = readLocalEntryRecordSync(sent.userId, sent.recordId);
  const queue = sent.queueId ? readSyncQueueItemSync(sent.queueId) : null;
  if (!current) return false;
  if (current.meta.ackedRevision >= sent.revision) return false;
  if (current.meta.dispatchGeneration !== sent.dispatchGeneration) return false;
  if (current.meta.localRevision !== sent.revision) return false;
  if (sent.op === "create" && current.meta.pendingOp && current.meta.pendingOp !== "create") return false;
  if (sent.op === "create" && current.meta.remoteConfirmed) return false;
  if (queue && queue.revision !== sent.revision) return false;
  return true;
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
    if (!staleFailureApplies(sent)) {
      return;
    }
    const current = readLocalEntryRecordSync(sent.userId, sent.recordId);
    if (!current) return;
    const queue = sent.queueId ? readSyncQueueItemSync(sent.queueId) : null;
    const queueMatches = queue != null && queue.revision === sent.revision;

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
          preserveUnspecifiedMeta: true,
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
        preserveUnspecifiedMeta: true,
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

export function expectedUpdatedAtForRecord(userId: string, recordId: string): number | undefined {
  return peekRemoteUpdatedAt(userId, recordId);
}
