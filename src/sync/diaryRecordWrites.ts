import type { BusinessEntry } from "@/domain/businessEntry";
import { readLocalEntryRecordSync } from "@/repositories/localEntriesRepository";
import {
  mayIssueRemoteWork,
  syncSessionOwnership,
  type SyncSessionToken,
} from "@/sync/syncSessionOwnership";
import type { PendingOp } from "@/repositories/localEntriesRepository";

export type DiaryRecordWriteJob<T> = {
  userId: string;
  recordId: string;
  revision: number;
  op: PendingOp;
  session: SyncSessionToken | null;
  run: () => Promise<T>;
};

export type DiaryRecordWriteResult<T> =
  | { skipped: true; reason: "session" | "superseded" | "settled" }
  | { skipped: false; value: T };

const tails = new Map<string, Promise<void>>();
const lastRemoteUpdatedAt = new Map<string, number>();

function recordKey(userId: string, recordId: string): string {
  return `${userId}#${recordId}`;
}

export function rememberRemoteUpdatedAt(userId: string, recordId: string, updatedAt: number): void {
  lastRemoteUpdatedAt.set(recordKey(userId, recordId), updatedAt);
}

export function peekRemoteUpdatedAt(userId: string, recordId: string): number | undefined {
  const remembered = lastRemoteUpdatedAt.get(recordKey(userId, recordId));
  if (remembered != null) return remembered;
  const row = readLocalEntryRecordSync(userId, recordId);
  return row?.meta.remoteUpdatedAt ?? undefined;
}

function shouldSkipBeforeRemote(job: DiaryRecordWriteJob<unknown>): "session" | "superseded" | "settled" | null {
  if (!mayIssueRemoteWork(job.session, job.userId)) return "session";
  if (job.session && !syncSessionOwnership.isCurrent(job.session)) return "session";
  const current = readLocalEntryRecordSync(job.userId, job.recordId);
  if (!current) return null;
  if (
    current.meta.ackedRevision >= job.revision &&
    current.meta.pendingOp == null &&
    current.meta.syncStatus === "synced"
  ) {
    return "settled";
  }
  if (job.op === "create" && current.meta.remoteConfirmed) {
    return "settled";
  }
  if (job.op !== "create" && current.meta.localRevision > job.revision) {
    return "superseded";
  }
  return null;
}

/**
 * Single-flight per UID/record so an older dispatched payload cannot commit
 * after a newer mutation. CREATE is not skipped merely because a later local
 * revision exists — it must still establish the cloud record.
 */
export function enqueueDiaryRecordWrite<T>(
  job: DiaryRecordWriteJob<T>
): Promise<DiaryRecordWriteResult<T>> {
  const key = recordKey(job.userId, job.recordId);
  const prev = tails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  tails.set(
    key,
    prev.then(
      () => gate,
      () => gate
    )
  );

  return (async () => {
    try {
      await prev.catch(() => undefined);
      const skip = shouldSkipBeforeRemote(job);
      if (skip) return { skipped: true, reason: skip };
      const value = await job.run();
      return { skipped: false, value };
    } finally {
      release();
    }
  })();
}

export function resetDiaryRecordWritesForTests(): void {
  tails.clear();
  lastRemoteUpdatedAt.clear();
}
