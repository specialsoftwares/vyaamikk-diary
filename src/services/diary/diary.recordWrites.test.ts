import assert from "node:assert/strict";

import { AppError } from "@/domain/errors";
import type { BusinessEntry } from "@/domain/businessEntry";
import type { CreateBusinessEntryInput, DiaryRepository, UpdateBusinessEntryInput } from "@/services/diary/types";
import { setDiaryRepositoryForTests } from "@/services/diary";
import { createEntryLocalFirst, updateEntryLocalFirst } from "@/services/diary/localFirst";
import { localEntriesRepository } from "@/repositories/localEntriesRepository";
import { persistDiaryCreateIntent, persistDiaryUpdateIntent } from "@/repositories/diaryLocalIntent";
import { syncQueueRepository } from "@/repositories/syncQueueRepository";
import { installMemoryLocalDatabase, uninstallMemoryLocalDatabase } from "@/localDb/testHarness";
import { __diarySyncTest } from "@/sync/syncEngine";
import { sessionSyncGate } from "@/sync/sessionSyncGate";
import { syncSessionOwnership } from "@/sync/syncSessionOwnership";
import { resetDiaryRecordWritesForTests } from "@/sync/diaryRecordWrites";
import { mergeBusinessEntryUpdate } from "@/services/diary/mergeEntryUpdate";

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function noteInput(id: string, title = "Site note"): CreateBusinessEntryInput {
  return {
    clientRecordId: id,
    ueid: "VYD-2026-TEST01",
    entryType: "work_update_issue",
    title,
    entryDate: 1_700_000_000_000,
    payload: {
      workDone: "poured slab",
      issueProblem: null,
      sitePlace: null,
      quantityOutput: null,
      responsiblePerson: null,
      followUpRequired: false,
    },
  };
}

function asEntry(id: string, title = "Site note"): BusinessEntry {
  const input = noteInput(id, title);
  return {
    id,
    userId: "u1",
    ueid: input.ueid,
    entryType: input.entryType,
    title: input.title,
    entryDate: input.entryDate,
    notes: null,
    reminder: null,
    location: null,
    attachments: [],
    payload: input.payload,
    source: "composer",
    status: "active",
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    pdfUri: null,
    documentHistory: {
      firstGeneratedAt: null,
      lastGeneratedAt: null,
      lastEditedAt: null,
      versionNumber: 1,
      editHistory: [],
      pdfGenerationHistory: [],
    },
  };
}

function mockRepo(
  store: Map<string, BusinessEntry>,
  hooks?: {
    create?: (input: CreateBusinessEntryInput) => Promise<BusinessEntry>;
    update?: (input: UpdateBusinessEntryInput) => Promise<BusinessEntry>;
  }
): DiaryRepository {
  return {
    async create(userId, input) {
      return (await this.createWithOutcome(userId, input)).record;
    },
    async createWithOutcome(userId, input) {
      const id = input.clientRecordId!;
      const had = store.has(id);
      if (hooks?.create) {
        const record = await hooks.create(input);
        return { record, outcome: had ? "existing" : "created" };
      }
      const existing = store.get(id);
      if (existing) return { record: existing, outcome: "existing" };
      const entry = { ...asEntry(id, input.title), userId, title: input.title, updatedAt: Date.now() };
      store.set(id, entry);
      return { record: entry, outcome: "created" };
    },
    async update(userId, input) {
      if (hooks?.update) return hooks.update(input);
      const cur = store.get(input.id);
      if (!cur) throw new AppError("not_found", "missing");
      if (input.expectedUpdatedAt != null && cur.updatedAt !== input.expectedUpdatedAt) {
        throw new AppError("save_failed", "Entry changed remotely.", undefined, { remoteChanged: true });
      }
      const next = { ...cur, ...input, userId, updatedAt: Date.now() } as BusinessEntry;
      store.set(input.id, next);
      return next;
    },
    async hardDelete(_userId, id) {
      store.delete(id);
    },
    async softDelete(_userId, id) {
      store.delete(id);
    },
    async getById(_userId, id) {
      return store.get(id) ?? null;
    },
    async list() {
      return [...store.values()];
    },
  };
}

async function main() {
  installMemoryLocalDatabase();
  sessionSyncGate.unlock();
  syncSessionOwnership.resetForTests();
  syncSessionOwnership.beginSession("u1");
  __diarySyncTest.resetFlushChain();
  resetDiaryRecordWritesForTests();

  try {
    // Boundary: mocked DiaryRepository. Not the Firebase write path.
    persistDiaryCreateIntent(asEntry("en_ord_a", "base"), noteInput("en_ord_a", "base"));
    const aStore = new Map<string, BusinessEntry>();
    setDiaryRepositoryForTests(mockRepo(aStore));
    await __diarySyncTest.processQueue("u1");

    const aGates = [deferred(), deferred()];
    const aEntered = [deferred(), deferred()];
    let aN = 0;
    let aCreates = 0;
    setDiaryRepositoryForTests(
      mockRepo(aStore, {
        create: async (input) => {
          aCreates += 1;
          const entry = { ...asEntry(input.clientRecordId!, input.title), userId: "u1" };
          aStore.set(entry.id, entry);
          return entry;
        },
        update: async (input) => {
          const i = aN++;
          aEntered[i]!.resolve();
          await aGates[i]!.promise;
          const cur = aStore.get(input.id)!;
          if (input.expectedUpdatedAt != null && cur.updatedAt !== input.expectedUpdatedAt) {
            throw new AppError("save_failed", "Entry changed remotely.", undefined, { remoteChanged: true });
          }
          const next = { ...cur, ...input, updatedAt: Date.now() } as BusinessEntry;
          aStore.set(input.id, next);
          return next;
        },
      })
    );
    const aP1 = updateEntryLocalFirst("u1", { id: "en_ord_a", title: "N" });
    await aEntered[0]!.promise;
    const aP2 = updateEntryLocalFirst("u1", { id: "en_ord_a", title: "N+1" });
    aGates[0]!.resolve();
    await aP1;
    await aEntered[1]!.promise;
    aGates[1]!.resolve();
    await aP2;
    assert.equal(aStore.get("en_ord_a")?.title, "N+1");
    const aRow = await localEntriesRepository.getRecord("u1", "en_ord_a");
    assert.equal(aRow?.entry.title, "N+1");
    assert.equal(aRow?.meta.syncStatus, "synced");
    assert.equal((await syncQueueRepository.listForUser("u1")).filter((q) => q.entityId === "en_ord_a").length, 0);
    assert.equal(aCreates, 0);

    // B. Queued UPDATE N plus direct edit N+1.
    persistDiaryCreateIntent(asEntry("en_ord_b", "base"), noteInput("en_ord_b", "base"));
    const bStore = new Map<string, BusinessEntry>();
    setDiaryRepositoryForTests(mockRepo(bStore));
    await __diarySyncTest.processQueue("u1");
    const bSynced = await localEntriesRepository.getRecord("u1", "en_ord_b");
    const bN = mergeBusinessEntryUpdate(bSynced!.entry, { id: "en_ord_b", title: "N" });
    persistDiaryUpdateIntent(bN, { id: "en_ord_b", title: "N" }, bSynced);
    const bEntered = deferred();
    const bGate = deferred();
    let bCreates = 0;
    setDiaryRepositoryForTests(
      mockRepo(bStore, {
        create: async (input) => {
          bCreates += 1;
          return { ...asEntry(input.clientRecordId!, input.title), userId: "u1" };
        },
        update: async (input) => {
          bEntered.resolve();
          await bGate.promise;
          const cur = bStore.get(input.id)!;
          const next = { ...cur, ...input, updatedAt: Date.now() } as BusinessEntry;
          bStore.set(input.id, next);
          return next;
        },
      })
    );
    const bFlush = __diarySyncTest.processQueue("u1");
    await bEntered.promise;
    const bDirect = updateEntryLocalFirst("u1", { id: "en_ord_b", title: "N+1" });
    bGate.resolve();
    await bFlush;
    await bDirect;
    await __diarySyncTest.processQueue("u1");
    assert.equal(bStore.get("en_ord_b")?.title, "N+1");
    assert.equal((await localEntriesRepository.getRecord("u1", "en_ord_b"))?.entry.title, "N+1");
    assert.equal((await localEntriesRepository.getRecord("u1", "en_ord_b"))?.meta.syncStatus, "synced");
    assert.equal(bCreates, 0);

    // C. Direct CREATE overlapping a background queue flush.
    const cStore = new Map<string, BusinessEntry>();
    const cEntered = deferred();
    const cGate = deferred();
    let cCreates = 0;
    setDiaryRepositoryForTests(
      mockRepo(cStore, {
        create: async (input) => {
          cCreates += 1;
          cEntered.resolve();
          await cGate.promise;
          const entry = { ...asEntry(input.clientRecordId!, input.title), userId: "u1", updatedAt: Date.now() };
          cStore.set(entry.id, entry);
          return entry;
        },
      })
    );
    persistDiaryCreateIntent(asEntry("en_ord_c", "queued"), noteInput("en_ord_c", "queued"));
    const cFlush = __diarySyncTest.processQueue("u1");
    await cEntered.promise;
    const cDirect = createEntryLocalFirst("u1", noteInput("en_ord_c", "direct"));
    cGate.resolve();
    await cFlush;
    const cDirectResult = await cDirect;
    assert.equal(cCreates, 1);
    assert.equal(cStore.get("en_ord_c")?.title, "queued");
    assert.equal(cDirectResult.entry.title, "direct");
    await __diarySyncTest.processQueue("u1");
    assert.equal(cCreates, 1);
    assert.equal(cStore.get("en_ord_c")?.title, "direct");

    // D. Different-field edits (title then reminder) — final server/local match.
    persistDiaryCreateIntent(asEntry("en_ord_d", "base"), noteInput("en_ord_d", "base"));
    const dStore = new Map<string, BusinessEntry>();
    setDiaryRepositoryForTests(mockRepo(dStore));
    await __diarySyncTest.processQueue("u1");
    const dGates = [deferred(), deferred()];
    const dEntered = [deferred(), deferred()];
    let dN = 0;
    setDiaryRepositoryForTests(
      mockRepo(dStore, {
        update: async (input) => {
          const i = dN++;
          dEntered[i]!.resolve();
          await dGates[i]!.promise;
          const cur = dStore.get(input.id)!;
          const next = { ...cur, ...input, updatedAt: Date.now() } as BusinessEntry;
          dStore.set(input.id, next);
          return next;
        },
      })
    );
    const dP1 = updateEntryLocalFirst("u1", { id: "en_ord_d", title: "titled" });
    await dEntered[0]!.promise;
    const dP2 = updateEntryLocalFirst("u1", {
      id: "en_ord_d",
      reminder: { at: 1_800_000_000_000, note: "call", notificationId: null },
    });
    dGates[0]!.resolve();
    await dP1;
    await dEntered[1]!.promise;
    dGates[1]!.resolve();
    await dP2;
    assert.equal(dStore.get("en_ord_d")?.title, "titled");
    assert.equal(dStore.get("en_ord_d")?.reminder?.note, "call");
    const dRow = await localEntriesRepository.getRecord("u1", "en_ord_d");
    assert.equal(dRow?.entry.title, "titled");
    assert.equal(dRow?.entry.reminder?.note, "call");
    assert.equal(dRow?.meta.syncStatus, "synced");
  } finally {
    setDiaryRepositoryForTests(null);
    sessionSyncGate.unlock();
    syncSessionOwnership.resetForTests();
    __diarySyncTest.resetFlushChain();
    uninstallMemoryLocalDatabase();
  }

  console.log("diary.recordWrites.test.ts: ok (mocked DiaryRepository boundary)");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
