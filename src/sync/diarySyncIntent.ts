import type { LocalEntrySyncMeta, PendingOp } from "@/repositories/localEntriesRepository";

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
  return !meta.remoteConfirmed;
}

export function shouldSkipHeuristicPurge(recordId: string, meta: LocalEntrySyncMeta): boolean {
  if (meta.pendingOp != null) return true;
  if (meta.syncErrorCode) return true;
  if (!meta.autoRetry) return true;
  if (!recordId.startsWith("local_")) return true;
  return false;
}

export function localContentDiffers(
  local: { title: string; notes: string | null; payload: unknown; entryDate: number; status?: string },
  remote: { title: string; notes: string | null; payload: unknown; entryDate: number; status?: string }
): boolean {
  return (
    local.title !== remote.title ||
    (local.notes ?? null) !== (remote.notes ?? null) ||
    local.entryDate !== remote.entryDate ||
    (local.status ?? "active") !== (remote.status ?? "active") ||
    JSON.stringify(local.payload) !== JSON.stringify(remote.payload)
  );
}
