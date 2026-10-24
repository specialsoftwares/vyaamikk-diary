import assert from "node:assert/strict";

import type { BusinessEntry } from "@/domain/businessEntry";
import type { LocalEntryRecord } from "@/repositories/localEntriesRepository";
import { syncSessionOwnership } from "@/sync/syncSessionOwnership";

import { projectDiaryEntries, refreshDiaryList, sessionStillOwns } from "./diaryListLoad";

function entry(id: string, title: string): BusinessEntry {
  return {
    id,
    title,
    entryType: "work_update_issue",
    entryDate: new Date(2026, 9, 17, 12).getTime(),
    createdAt: 1,
    updatedAt: 1,
    source: "composer",
    payload: {},
    deletedAt: null,
  } as unknown as BusinessEntry;
}

function local(row: BusinessEntry): LocalEntryRecord {
  return {
    entry: row,
    meta: { syncStatus: "pending", remoteConfirmed: false },
  } as unknown as LocalEntryRecord;
}

async function main(): Promise<void> {
  syncSessionOwnership.resetForTests();
  const session = syncSessionOwnership.beginSession("owner-a");
  const published: string[][] = [];
  let releaseRemote: (rows: BusinessEntry[]) => void = () => undefined;
  const remoteGate = new Promise<BusinessEntry[]>((resolve) => {
    releaseRemote = resolve;
  });

  const refresh = refreshDiaryList({
    userId: "owner-a",
    query: {},
    generation: session.generation,
    removedIds: new Set(),
    previousRemote: [entry("remote-old", "Remote")],
    includeRemote: true,
    readLocal: async () => [local(entry("local-new", "Saved offline"))],
    readRemote: () => remoteGate,
    stillCurrent: () => sessionStillOwns("owner-a", session.generation),
    onPublish: (next) => published.push(next.entries.map((row) => row.id)),
  });

  await Promise.resolve();
  assert.deepEqual(published[0], ["remote-old", "local-new"]);
  releaseRemote([entry("remote-old", "Remote")]);
  const finished = await refresh;
  assert.equal(finished.stale, false);
  assert.deepEqual(published.at(-1), ["remote-old", "local-new"]);

  const removed = new Set<string>(["remote-old"]);
  const afterDelete = projectDiaryEntries(
    [entry("remote-old", "Remote"), entry("kept", "Kept")],
    [],
    removed,
    {}
  );
  assert.deepEqual(afterDelete.entries.map((row) => row.id), ["kept"]);

  removed.delete("remote-old");
  const restored = projectDiaryEntries([entry("remote-old", "Remote")], [], removed, {});
  assert.deepEqual(restored.entries.map((row) => row.id), ["remote-old"]);

  const edited = projectDiaryEntries(
    [entry("kept", "Old title")],
    [local({ ...entry("kept", "Edited"), updatedAt: 2 } as BusinessEntry)],
    new Set(),
    {}
  );
  assert.equal(edited.entries[0]?.title, "Edited");

  const ownerB = syncSessionOwnership.beginSession("owner-b");
  let stalePublished = false;
  const stale = await refreshDiaryList({
    userId: "owner-a",
    query: { search: "old" },
    generation: session.generation,
    removedIds: new Set(),
    previousRemote: [entry("remote-old", "Remote")],
    includeRemote: true,
    readLocal: async () => [],
    readRemote: async () => [entry("remote-old", "Remote")],
    stillCurrent: () => false,
    onPublish: () => {
      stalePublished = true;
    },
  });
  assert.equal(stale.stale, true);
  assert.equal(stalePublished, false);
  assert.equal(sessionStillOwns("owner-a", session.generation), false);
  assert.equal(sessionStillOwns("owner-b", ownerB.generation), true);

  syncSessionOwnership.endSession();
  assert.equal(sessionStillOwns("owner-a", session.generation), false);
  const ownerAAgain = syncSessionOwnership.beginSession("owner-a");
  assert.notEqual(ownerAAgain.generation, session.generation);
  assert.equal(sessionStillOwns("owner-a", session.generation), false);
  assert.equal(sessionStillOwns("owner-a", ownerAAgain.generation), true);

  syncSessionOwnership.resetForTests();
  console.log("diaryListLoad.correction.test.ts: ok");
}

void main();
