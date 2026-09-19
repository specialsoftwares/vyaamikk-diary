import assert from "node:assert/strict";

import { AppError } from "@/domain/errors";
import type { BusinessEntry } from "@/domain/businessEntry";
import type { CreateBusinessEntryInput, DiaryRepository, UpdateBusinessEntryInput } from "@/services/diary/types";
import { setDiaryRepositoryForTests } from "@/services/diary";
import { createEntryLocalFirst, updateEntryLocalFirst } from "@/services/diary/localFirst";
import { persistDiaryCreateIntent } from "@/repositories/diaryLocalIntent";
import { localEntriesRepository } from "@/repositories/localEntriesRepository";
import { syncQueueRepository } from "@/repositories/syncQueueRepository";
import { installMemoryLocalDatabase, uninstallMemoryLocalDatabase } from "@/localDb/testHarness";
import { __diarySyncTest } from "@/sync/syncEngine";
import { sessionSyncGate } from "@/sync/sessionSyncGate";
import { syncSessionOwnership } from "@/sync/syncSessionOwnership";
import { resetDiaryRecordWritesForTests } from "@/sync/diaryRecordWrites";

function noteInput(id: string, title = "original"): CreateBusinessEntryInput {
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

function asEntry(id: string, title = "original"): BusinessEntry {
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
    async update(_userId, input) {
      if (hooks?.update) return hooks.update(input);
      const cur = store.get(input.id);
      if (!cur) throw new AppError("not_found", "missing");
      const next = { ...cur, ...input, updatedAt: Date.now() } as BusinessEntry;
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

const reminder = { at: 1_800_000_000_000, note: "NEW REMINDER", notificationId: null as string | null };

async function assertBothFields(id: string, store: Map<string, BusinessEntry>, title: string, note: string) {
  const row = await localEntriesRepository.getRecord("u1", id);
  assert.equal(row?.entry.title, title);
  assert.equal(row?.entry.reminder?.note, note);
  assert.equal(store.get(id)?.title, title);
  assert.equal(store.get(id)?.reminder?.note, note);
  assert.equal(row?.entry.id, id);
}

async function main() {
  installMemoryLocalDatabase();
  sessionSyncGate.unlock();
  syncSessionOwnership.resetForTests();
  syncSessionOwnership.beginSession("u1");
  __diarySyncTest.resetFlushChain();
  resetDiaryRecordWritesForTests();

  try {
    // Boundary: mocked DiaryRepository + MemorySqlite. Not Firebase quota.
    persistDiaryCreateIntent(asEntry("en_patch_a", "original"), noteInput("en_patch_a", "original"));
    const aStore = new Map<string, BusinessEntry>();
    let aCreates = 0;
    setDiaryRepositoryForTests(
      mockRepo(aStore, {
        create: async (input) => {
          aCreates += 1;
          const entry = { ...asEntry(input.clientRecordId!, input.title), userId: "u1" };
          aStore.set(entry.id, entry);
          return entry;
        },
      })
    );
    await __diarySyncTest.processQueue("u1");
    assert.equal(aCreates, 1);

    const titlePromise = updateEntryLocalFirst("u1", { id: "en_patch_a", title: "NEW TITLE" });
    const reminderPromise = updateEntryLocalFirst("u1", { id: "en_patch_a", reminder });
    await Promise.all([titlePromise, reminderPromise]);
    await __diarySyncTest.processQueue("u1");
    await assertBothFields("en_patch_a", aStore, "NEW TITLE", "NEW REMINDER");
    const aRow = await localEntriesRepository.getRecord("u1", "en_patch_a");
    assert.equal(aRow?.meta.syncStatus, "synced");
    assert.equal(
      (await syncQueueRepository.listForUser("u1")).filter((q) => q.entityId === "en_patch_a").length,
      0
    );
    assert.equal(aCreates, 1);

    // B. Invocation order reversed.
    persistDiaryCreateIntent(asEntry("en_patch_b", "original"), noteInput("en_patch_b", "original"));
    const bStore = new Map<string, BusinessEntry>();
    let bCreates = 0;
    setDiaryRepositoryForTests(
      mockRepo(bStore, {
        create: async (input) => {
          bCreates += 1;
          const entry = { ...asEntry(input.clientRecordId!, input.title), userId: "u1" };
          bStore.set(entry.id, entry);
          return entry;
        },
      })
    );
    await __diarySyncTest.processQueue("u1");
    const bReminder = updateEntryLocalFirst("u1", { id: "en_patch_b", reminder });
    const bTitle = updateEntryLocalFirst("u1", { id: "en_patch_b", title: "NEW TITLE" });
    await Promise.all([bReminder, bTitle]);
    await __diarySyncTest.processQueue("u1");
    await assertBothFields("en_patch_b", bStore, "NEW TITLE", "NEW REMINDER");
    assert.equal(bCreates, 1);

    // C. notes + attachments.
    persistDiaryCreateIntent(asEntry("en_patch_c", "original"), noteInput("en_patch_c", "original"));
    const cStore = new Map<string, BusinessEntry>();
    let cCreates = 0;
    setDiaryRepositoryForTests(
      mockRepo(cStore, {
        create: async (input) => {
          cCreates += 1;
          const entry = { ...asEntry(input.clientRecordId!, input.title), userId: "u1" };
          cStore.set(entry.id, entry);
          return entry;
        },
      })
    );
    await __diarySyncTest.processQueue("u1");
    const notesP = updateEntryLocalFirst("u1", { id: "en_patch_c", notes: "site notes" });
    const attP = updateEntryLocalFirst("u1", {
      id: "en_patch_c",
      attachments: [{ id: "att_1", uri: "file://a.jpg", mimeType: "image/jpeg", name: "a.jpg" }],
    });
    await Promise.all([notesP, attP]);
    await __diarySyncTest.processQueue("u1");
    const cRow = await localEntriesRepository.getRecord("u1", "en_patch_c");
    assert.equal(cRow?.entry.notes, "site notes");
    assert.equal(cRow?.entry.attachments[0]?.id, "att_1");
    assert.equal(cStore.get("en_patch_c")?.notes, "site notes");
    assert.equal(cStore.get("en_patch_c")?.attachments[0]?.id, "att_1");
    assert.equal(cRow?.meta.syncStatus, "synced");
    assert.equal(cCreates, 1);

    // D. Simultaneous patches while CREATE is still provisional.
    const dStore = new Map<string, BusinessEntry>();
    let dCreates = 0;
    setDiaryRepositoryForTests(
      mockRepo(dStore, {
        create: async (input) => {
          dCreates += 1;
          const entry = { ...asEntry(input.clientRecordId!, input.title), userId: "u1", updatedAt: Date.now() };
          dStore.set(entry.id, entry);
          throw new AppError("network", "offline");
        },
      })
    );
    const created = await createEntryLocalFirst("u1", noteInput("en_patch_d", "original"));
    assert.equal(created.remoteAccepted, false);
    const dTitle = updateEntryLocalFirst("u1", { id: "en_patch_d", title: "NEW TITLE" });
    const dReminder = updateEntryLocalFirst("u1", { id: "en_patch_d", reminder });
    await Promise.all([dTitle, dReminder]);
    const dMid = await localEntriesRepository.getRecord("u1", "en_patch_d");
    assert.equal(dMid?.entry.title, "NEW TITLE");
    assert.equal(dMid?.entry.reminder?.note, "NEW REMINDER");
    assert.equal(dMid?.meta.pendingOp, "create");
    assert.notEqual(dMid?.meta.syncStatus, "synced");
    setDiaryRepositoryForTests(
      mockRepo(dStore, {
        create: async (input) => {
          dCreates += 1;
          const entry = {
            ...asEntry(input.clientRecordId!, input.title),
            userId: "u1",
            reminder: input.reminder ?? null,
            updatedAt: Date.now(),
          };
          dStore.set(entry.id, entry);
          return entry;
        },
      })
    );
    await __diarySyncTest.processQueue("u1");
    const dAfter = await localEntriesRepository.getRecord("u1", "en_patch_d");
    assert.equal(dAfter?.entry.title, "NEW TITLE");
    assert.equal(dAfter?.entry.reminder?.note, "NEW REMINDER");
    assert.equal(dStore.get("en_patch_d")?.title, "NEW TITLE");
    assert.equal(dStore.get("en_patch_d")?.reminder?.note, "NEW REMINDER");
    assert.equal(dAfter?.entry.id, "en_patch_d");
    assert.equal(dCreates, 2);
  } finally {
    setDiaryRepositoryForTests(null);
    sessionSyncGate.unlock();
    syncSessionOwnership.resetForTests();
    __diarySyncTest.resetFlushChain();
    uninstallMemoryLocalDatabase();
  }

  console.log("diary.atomicPatch.test.ts: ok (mocked DiaryRepository + MemorySqlite)");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
