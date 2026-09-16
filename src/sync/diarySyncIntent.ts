import type { BusinessEntry } from "@/domain/businessEntry";
import type { AttachmentRef, EntryLocation, EntryRecordStatus } from "@/domain/businessEntry";
import type { EntryReminder } from "@/domain/types";
import type { LocalEntrySyncMeta, PendingOp } from "@/repositories/localEntriesRepository";
import type { CreateBusinessEntryInput, UpdateBusinessEntryInput } from "@/services/diary/types";

export type ResolvedDiaryOp = PendingOp | "ambiguous";

/**
 * CREATE vs UPDATE must not be inferred from a `local_` prefix alone.
 * Explicit durable `pendingOp` wins. Legacy rows without it stay ambiguous.
 */
export function resolveDiaryPendingOp(
  recordId: string,
  meta: Pick<LocalEntrySyncMeta, "pendingOp" | "remoteConfirmed" | "syncStatus">
): ResolvedDiaryOp | null {
  if (meta.pendingOp) return meta.pendingOp;
  if (meta.remoteConfirmed && meta.syncStatus === "synced") return null;
  if (recordId.startsWith("local_")) return "create";
  if (meta.syncStatus === "pending" || meta.syncStatus === "error") return "ambiguous";
  return null;
}

export function shouldAutoEnqueue(meta: LocalEntrySyncMeta): boolean {
  if (!meta.autoRetry) return false;
  if (meta.pendingOp === "create" || meta.pendingOp === "update") return true;
  if (meta.localRevision > meta.ackedRevision) return true;
  return !meta.remoteConfirmed;
}

export function shouldSkipHeuristicPurge(recordId: string, meta: LocalEntrySyncMeta): boolean {
  if (meta.pendingOp != null) return true;
  if (meta.syncErrorCode) return true;
  if (!meta.autoRetry) return true;
  if (meta.localRevision > meta.ackedRevision) return true;
  if (!recordId.startsWith("local_")) return true;
  return false;
}

export function hasOutstandingLocalIntent(meta: LocalEntrySyncMeta): boolean {
  if (meta.pendingOp != null) return true;
  if (meta.syncStatus === "pending" || meta.syncStatus === "error" || meta.syncStatus === "conflict") {
    return true;
  }
  if (!meta.autoRetry) return true;
  if (meta.localRevision > meta.ackedRevision) return true;
  if (!meta.remoteConfirmed && meta.syncStatus !== "synced") return true;
  return false;
}

export function entryToCreateInput(entry: BusinessEntry): CreateBusinessEntryInput {
  return {
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
  };
}

export function entryToUpdateInput(
  entry: BusinessEntry,
  expectedUpdatedAt?: number
): UpdateBusinessEntryInput {
  return {
    id: entry.id,
    title: entry.title,
    entryDate: entry.entryDate,
    notes: entry.notes,
    reminder: entry.reminder,
    location: entry.location,
    attachments: entry.attachments,
    payload: entry.payload,
    status: entry.status,
    pdfUri: entry.pdfUri,
    expectedUpdatedAt,
  };
}

export type EditableEntrySlice = {
  title: string;
  notes?: string | null;
  payload?: unknown;
  entryDate: number;
  status?: EntryRecordStatus | string;
  reminder?: EntryReminder | null;
  location?: EntryLocation | null;
  attachments?: AttachmentRef[];
  pdfUri?: string | null;
};

function jsonEq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * User-editable content. Server-managed timestamps / documentHistory are
 * ignored so normalisation cannot loop updates, and reminder/attachment-only
 * edits are not treated as "nothing changed".
 */
export function localContentDiffers(local: EditableEntrySlice, remote: EditableEntrySlice): boolean {
  return (
    (local.title ?? "") !== (remote.title ?? "") ||
    (local.notes ?? null) !== (remote.notes ?? null) ||
    local.entryDate !== remote.entryDate ||
    (local.status ?? "active") !== (remote.status ?? "active") ||
    !jsonEq(local.payload ?? null, remote.payload ?? null) ||
    !jsonEq(local.reminder ?? null, remote.reminder ?? null) ||
    !jsonEq(local.location ?? null, remote.location ?? null) ||
    !jsonEq(local.attachments ?? [], remote.attachments ?? []) ||
    (local.pdfUri ?? null) !== (remote.pdfUri ?? null)
  );
}
