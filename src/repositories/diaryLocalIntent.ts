import { getLocalDatabase } from "@/localDb/database";
import {
  readLocalEntryRecordSync,
  writeLocalEntryRowSync,
  type LocalEntryRecord,
} from "@/repositories/localEntriesRepository";
import { enqueueSync } from "@/repositories/syncQueueRepository";
import type { BusinessEntry } from "@/domain/businessEntry";
import type { CreateBusinessEntryInput, UpdateBusinessEntryInput } from "@/services/diary/types";
import { entryToCreateInput } from "@/sync/diarySyncIntent";

function withLocalTx(fn: () => void): void {
  getLocalDatabase().withTransactionSync(fn);
}

let crashHook: ((phase: "after_row") => void) | null = null;

/** Test-only: throw inside the production transaction between row and queue writes. */
export function setDiaryIntentCrashHook(hook: ((phase: "after_row") => void) | null): void {
  crashHook = hook;
}

export function persistDiaryCreateIntent(
  entry: BusinessEntry,
  createInput: CreateBusinessEntryInput
): string {
  let queueId = "";
  withLocalTx(() => {
    const existing = readLocalEntryRecordSync(entry.userId, entry.id);
    const nextRevision = (existing?.meta.localRevision ?? 0) + 1;
    writeLocalEntryRowSync(
      entry,
      {
        syncStatus: "pending",
        pendingOp: "create",
        remoteConfirmed: false,
        syncErrorCode: null,
        autoRetry: true,
        localRevision: nextRevision,
        ackedRevision: existing?.meta.ackedRevision ?? 0,
      },
      existing
    );
    crashHook?.("after_row");
    queueId = enqueueSync(
      {
        userId: entry.userId,
        op: "create",
        entity: "entry",
        entityId: entry.id,
        payload: { ...createInput, clientRecordId: entry.id },
        revision: nextRevision,
      },
      { replacePayload: true }
    );
  });
  return queueId;
}

export function persistDiaryUpdateIntent(
  entry: BusinessEntry,
  updateInput: UpdateBusinessEntryInput,
  _existing: LocalEntryRecord | null
): string {
  let queueId = "";
  withLocalTx(() => {
    const existing = readLocalEntryRecordSync(entry.userId, entry.id) ?? _existing;
    const nextRevision = (existing?.meta.localRevision ?? 0) + 1;
    const pendingCreate =
      existing?.meta.pendingOp === "create" && existing.meta.remoteConfirmed === false;
    writeLocalEntryRowSync(
      entry,
      pendingCreate
        ? {
            syncStatus: "pending",
            pendingOp: "create",
            remoteConfirmed: false,
            syncErrorCode: null,
            autoRetry: existing?.meta.autoRetry ?? true,
            localRevision: nextRevision,
            ackedRevision: existing?.meta.ackedRevision ?? 0,
          }
        : {
            syncStatus: "pending",
            pendingOp: existing?.meta.remoteConfirmed ? "update" : (existing?.meta.pendingOp ?? "update"),
            remoteConfirmed: existing?.meta.remoteConfirmed ?? false,
            syncErrorCode: null,
            autoRetry: true,
            localRevision: nextRevision,
            ackedRevision: existing?.meta.ackedRevision ?? 0,
            preserveUnspecifiedMeta: true,
          },
      existing
    );
    crashHook?.("after_row");
    queueId = enqueueSync(
      pendingCreate
        ? {
            userId: entry.userId,
            op: "create",
            entity: "entry",
            entityId: entry.id,
            payload: entryToCreateInput(entry),
            revision: nextRevision,
          }
        : {
            userId: entry.userId,
            op: "update",
            entity: "entry",
            entityId: entry.id,
            payload: updateInput,
            revision: nextRevision,
          },
      { replacePayload: true }
    );
  });
  return queueId;
}

