import { getLocalDatabase } from "@/localDb/database";
import {
  readLocalEntryRecordSync,
  writeLocalEntryRowSync,
  type LocalEntryRecord,
} from "@/repositories/localEntriesRepository";
import { enqueueSync } from "@/repositories/syncQueueRepository";
import type { BusinessEntry } from "@/domain/businessEntry";
import type { CreateBusinessEntryInput, UpdateBusinessEntryInput } from "@/services/diary/types";

function withLocalTx(fn: () => void): void {
  getLocalDatabase().withTransactionSync(fn);
}

export function persistDiaryCreateIntent(
  entry: BusinessEntry,
  createInput: CreateBusinessEntryInput
): void {
  withLocalTx(() => {
    writeLocalEntryRowSync(
      entry,
      {
        syncStatus: "pending",
        pendingOp: "create",
        remoteConfirmed: false,
        syncErrorCode: null,
        autoRetry: true,
      },
      readLocalEntryRecordSync(entry.userId, entry.id)
    );
    enqueueSync(
      {
        userId: entry.userId,
        op: "create",
        entity: "entry",
        entityId: entry.id,
        payload: createInput,
      },
      { replacePayload: true }
    );
  });
}

export function persistDiaryUpdateIntent(
  entry: BusinessEntry,
  updateInput: UpdateBusinessEntryInput,
  existing: LocalEntryRecord | null
): void {
  const pendingCreate =
    existing?.meta.pendingOp === "create" && existing.meta.remoteConfirmed === false;
  withLocalTx(() => {
    writeLocalEntryRowSync(
      entry,
      pendingCreate
        ? {
            syncStatus: "pending",
            pendingOp: "create",
            remoteConfirmed: false,
            syncErrorCode: null,
            autoRetry: existing?.meta.autoRetry ?? true,
          }
        : {
            syncStatus: "pending",
            pendingOp: existing?.meta.remoteConfirmed ? "update" : (existing?.meta.pendingOp ?? "update"),
            remoteConfirmed: existing?.meta.remoteConfirmed ?? false,
            syncErrorCode: null,
            autoRetry: true,
            preserveUnspecifiedMeta: true,
          },
      existing
    );
    enqueueSync(
      pendingCreate
        ? {
            userId: entry.userId,
            op: "create",
            entity: "entry",
            entityId: entry.id,
            payload: {
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
            } satisfies CreateBusinessEntryInput,
          }
        : {
            userId: entry.userId,
            op: "update",
            entity: "entry",
            entityId: entry.id,
            payload: updateInput,
          },
      { replacePayload: true }
    );
  });
}

export function persistRemoteAccepted(
  userId: string,
  remote: BusinessEntry,
  keepLocal: BusinessEntry | null,
  followUpUpdate: UpdateBusinessEntryInput | null
): void {
  withLocalTx(() => {
    const existing = readLocalEntryRecordSync(userId, keepLocal?.id ?? remote.id);
    if (followUpUpdate && keepLocal) {
      writeLocalEntryRowSync(
        keepLocal,
        {
          syncStatus: "pending",
          pendingOp: "update",
          remoteConfirmed: true,
          syncErrorCode: null,
          autoRetry: true,
        },
        existing
      );
      enqueueSync(
        {
          userId,
          op: "update",
          entity: "entry",
          entityId: keepLocal.id,
          payload: followUpUpdate,
        },
        { replacePayload: true }
      );
    } else {
      writeLocalEntryRowSync(
        remote,
        {
          syncStatus: "synced",
          pendingOp: null,
          remoteConfirmed: true,
          syncErrorCode: null,
          autoRetry: true,
        },
        existing
      );
    }
    const db = getLocalDatabase();
    db.runSync(
      `DELETE FROM sync_queue WHERE user_id = ? AND entity = ? AND entity_id = ? AND op = ?`,
      [userId, "entry", keepLocal?.id ?? remote.id, "create"]
    );
    if (!followUpUpdate) {
      db.runSync(
        `DELETE FROM sync_queue WHERE user_id = ? AND entity = ? AND entity_id = ?`,
        [userId, "entry", keepLocal?.id ?? remote.id]
      );
    }
  });
}
