import { AppError } from "@/domain/errors";
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
import { mergeBusinessEntryUpdate } from "@/services/diary/mergeEntryUpdate";
import { entryToCreateInput, entryToUpdateInput } from "@/sync/diarySyncIntent";

export type DiaryLocalPersistResult = {
  queueId: string;
  entry: BusinessEntry;
  revision: number;
  dispatchGeneration: number;
  pendingOp: PendingOp;
  remoteConfirmed: boolean;
};

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

/**
 * Apply `patch` to the latest local row inside the same transaction that
 * advances revision and writes row+queue. Callers must not pre-merge.
 */
export function persistDiaryUpdateIntent(
  userId: string,
  patch: UpdateBusinessEntryInput,
  fallbackEntry?: BusinessEntry | null
): DiaryLocalPersistResult {
  let result: DiaryLocalPersistResult | null = null;
  withLocalTx(() => {
    const existing = readLocalEntryRecordSync(userId, patch.id);
    const base = existing?.entry ?? fallbackEntry ?? null;
    if (!base) throw new AppError("not_found", "Entry not found");
    const entry = mergeBusinessEntryUpdate(base, patch);
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
    const pendingOp: PendingOp = pendingCreate
      ? "create"
      : existing?.meta.remoteConfirmed
        ? "update"
        : (existing?.meta.pendingOp ?? "update");
    const remoteConfirmed = pendingCreate ? false : existing?.meta.remoteConfirmed ?? false;
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
            pendingOp,
            remoteConfirmed,
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
    const queueId = enqueueSync(
      pendingCreate
        ? {
            userId,
            op: "create",
            entity: "entry",
            entityId: patch.id,
            payload: entryToCreateInput(entry),
            revision: nextRevision,
          }
        : {
            userId,
            op: "update",
            entity: "entry",
            entityId: patch.id,
            payload: entryToUpdateInput(entry),
            revision: nextRevision,
          },
      { replacePayload: true }
    );
    result = {
      queueId,
      entry,
      revision: nextRevision,
      dispatchGeneration: nextDispatch,
      pendingOp,
      remoteConfirmed,
    };
  });
  if (!result) throw new AppError("unknown", "Failed to persist diary update");
  return result;
}
