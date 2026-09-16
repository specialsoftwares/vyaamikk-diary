import type { BusinessEntry } from "@/domain/businessEntry";
import type { LocalEntryRecord } from "@/repositories/localEntriesRepository";

export type DiarySyncBadge = "pending" | "quota" | "permission" | "error" | "synced";

function dedupeById(entries: BusinessEntry[]): BusinessEntry[] {
  const seen = new Set<string>();
  const out: BusinessEntry[] = [];
  for (const e of entries) {
    const id = e.id?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(e);
  }
  return out.filter((e) => !e.deletedAt);
}

export function badgeForLocalRecord(record: LocalEntryRecord): DiarySyncBadge {
  const code = record.meta.syncErrorCode;
  if (code === "quota_exhausted") return "quota";
  if (code === "permission_denied") return "permission";
  if (record.meta.syncStatus === "error" || code) return "error";
  if (!record.meta.remoteConfirmed || record.meta.syncStatus === "pending") return "pending";
  return "synced";
}

export function mergeRemoteWithLocalUnsynced(
  remote: BusinessEntry[],
  localUnsynced: LocalEntryRecord[]
): { entries: BusinessEntry[]; badgeById: Record<string, DiarySyncBadge> } {
  const badgeById: Record<string, DiarySyncBadge> = {};
  const byId = new Map<string, BusinessEntry>();
  for (const entry of remote) {
    byId.set(entry.id, entry);
    badgeById[entry.id] = "synced";
  }
  for (const record of localUnsynced) {
    byId.set(record.entry.id, record.entry);
    badgeById[record.entry.id] = badgeForLocalRecord(record);
  }
  const entries = dedupeById([...byId.values()]).sort(
    (a, b) => b.entryDate - a.entryDate || b.createdAt - a.createdAt
  );
  return { entries, badgeById };
}
