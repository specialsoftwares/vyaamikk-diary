import { getLocalDatabase } from "@/localDb/database";
import {
  readLocalEntryRecordSync,
  writeLocalEntryRowSync,
  type LocalEntryRecord,
  type PendingOp,
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

function keepCreateOrigin(existing: LocalEntryRecord | null): boolean {
  return (
    existing != null &&
    existing.meta.originRevision > 0 &&
    existing.meta.originEntry != null &&
    (existing.meta.originOp === "create" ||
      (existing.meta.pendingOp === "create" && existing.meta.remoteConfirmed === false))
  );
}

export function persistDiaryCreateIntent(
  entry: BusinessEntry,
  createInput: CreateBusinessEntryInput
): string {
  let queueId = "";
  withLocalTx(() => {
    const existing = readLocalEntryRecordSync(entry.userId, entry.id);
    const nextRevision = (existing?.meta.localRevision ?? 0) + 1;
    const nextDispatch = (existing?.meta.dispatchGeneration ?? 0) + 1;
    const reuseOrigin = keepCreateOrigin(existing);
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
        originRevision: reuseOrigin ? existing!.meta.originRevision : nextRevision,
        originOp: "create",
        originEntry: reuseOrigin ? existing!.meta.originEntry : entry,
        dispatchGeneration: nextDispatch,
        remoteUpdatedAt: existing?.meta.remoteUpdatedAt ?? null,
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
    const nextDispatch = (existing?.meta.dispatchGeneration ?? 0) + 1;
    const pendingCreate =
      existing?.meta.pendingOp === "create" && existing.meta.remoteConfirmed === false;
    const reuseCreateOrigin = pendingCreate && keepCreateOrigin(existing);
    const originRevision = reuseCreateOrigin
      ? existing!.meta.originRevision
      : pendingCreate && existing && existing.meta.localRevision > 0
        ? existing.meta.localRevision
        : nextRevision;
    const originEntry = reuseCreateOrigin
      ? existing!.meta.originEntry
      : pendingCreate && existing
        ? existing.entry
        : entry;
    const originOp: PendingOp = pendingCreate ? "create" : "update";
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
            originRevision,
            originOp,
            originEntry,
            dispatchGeneration: nextDispatch,
            remoteUpdatedAt: existing?.meta.remoteUpdatedAt ?? null,
          }
        : {
            syncStatus: "pending",
            pendingOp: existing?.meta.remoteConfirmed ? "update" : (existing?.meta.pendingOp ?? "update"),
            remoteConfirmed: existing?.meta.remoteConfirmed ?? false,
            syncErrorCode: null,
            autoRetry: true,
            localRevision: nextRevision,
            ackedRevision: existing?.meta.ackedRevision ?? 0,
            originRevision,
            originOp,
            originEntry,
            dispatchGeneration: nextDispatch,
            remoteUpdatedAt: existing?.meta.remoteUpdatedAt ?? null,
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
