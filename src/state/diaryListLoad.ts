import type { BusinessEntry, BusinessEntryType } from "@/domain/businessEntry";
import type { LocalEntryRecord } from "@/repositories/localEntriesRepository";
import { mergeRemoteWithLocalUnsynced, type DiarySyncBadge } from "@/services/diary/mergeLocalUnsynced";
import { entrySearchBlob } from "@/utils/businessEntry/display";
import { syncSessionOwnership } from "@/sync/syncSessionOwnership";

export interface DiaryListQuery {
  search?: string;
  entryType?: BusinessEntryType | null;
  upcomingOnly?: boolean;
  limit?: number;
  nowMs?: number;
}

export function diaryQueryKey(query: DiaryListQuery): string {
  return JSON.stringify({
    search: query.search?.trim() ?? "",
    entryType: query.entryType ?? null,
    upcomingOnly: Boolean(query.upcomingOnly),
    limit: query.limit ?? null,
  });
}

export function sessionStillOwns(ownerUid: string, generation: number | null): boolean {
  const live = syncSessionOwnership.capture();
  if (!live) return generation == null;
  return live.uid === ownerUid && live.generation === generation;
}

export function projectDiaryEntries(
  remote: BusinessEntry[],
  localUnsynced: LocalEntryRecord[],
  removedIds: ReadonlySet<string>,
  query: DiaryListQuery
): { entries: BusinessEntry[]; badgeById: Record<string, DiarySyncBadge> } {
  const merged = mergeRemoteWithLocalUnsynced(
    remote.filter((entry) => !removedIds.has(entry.id)),
    localUnsynced.filter((record) => !removedIds.has(record.entry.id))
  );
  let entries = merged.entries.filter((entry) => !entry.deletedAt && !removedIds.has(entry.id));
  if (query.entryType) entries = entries.filter((entry) => entry.entryType === query.entryType);
  if (query.upcomingOnly) {
    const now = query.nowMs ?? Date.now();
    entries = entries.filter((entry) => entry.reminder && entry.reminder.at > now);
  }
  if (query.search) {
    const needle = query.search.trim().toLowerCase();
    if (needle) entries = entries.filter((entry) => entrySearchBlob(entry).includes(needle));
  }
  if (query.limit) entries = entries.slice(0, query.limit);
  return { entries, badgeById: merged.badgeById };
}

export async function refreshDiaryList(input: {
  userId: string;
  query: DiaryListQuery;
  generation: number | null;
  removedIds: Set<string>;
  previousRemote: BusinessEntry[];
  includeRemote: boolean;
  readLocal: (userId: string) => Promise<LocalEntryRecord[]>;
  readRemote: (userId: string) => Promise<BusinessEntry[]>;
  stillCurrent: () => boolean;
  onPublish: (published: { entries: BusinessEntry[]; badgeById: Record<string, DiarySyncBadge> }) => void;
}): Promise<{ remote: BusinessEntry[]; stale: boolean }> {
  const local = await input.readLocal(input.userId);
  if (!input.stillCurrent() || !sessionStillOwns(input.userId, input.generation)) {
    return { remote: input.previousRemote, stale: true };
  }
  input.onPublish(
    projectDiaryEntries(input.previousRemote, local, input.removedIds, input.query)
  );
  if (!input.includeRemote) return { remote: input.previousRemote, stale: false };

  let remote = input.previousRemote;
  try {
    remote = await input.readRemote(input.userId);
  } catch (error) {
    if (!input.stillCurrent() || !sessionStillOwns(input.userId, input.generation)) {
      return { remote: input.previousRemote, stale: true };
    }
    throw error;
  }
  if (!input.stillCurrent() || !sessionStillOwns(input.userId, input.generation)) {
    return { remote: input.previousRemote, stale: true };
  }
  for (const id of [...input.removedIds]) {
    if (!remote.some((entry) => entry.id === id)) input.removedIds.delete(id);
  }
  const localAfter = await input.readLocal(input.userId);
  if (!input.stillCurrent() || !sessionStillOwns(input.userId, input.generation)) {
    return { remote, stale: true };
  }
  input.onPublish(projectDiaryEntries(remote, localAfter, input.removedIds, input.query));
  return { remote, stale: false };
}
