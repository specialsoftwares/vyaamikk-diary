import assert from "node:assert/strict";

import { AppError } from "@/domain/errors";
import type { BusinessEntry } from "@/domain/businessEntry";
import type { CreateBusinessEntryInput, DiaryRepository, UpdateBusinessEntryInput } from "@/services/diary/types";
import { setDiaryRepositoryForTests } from "@/services/diary";
import { createEntryLocalFirst, updateEntryLocalFirst } from "@/services/diary/localFirst";
import { localEntriesRepository } from "@/repositories/localEntriesRepository";
import { syncQueueRepository } from "@/repositories/syncQueueRepository";
import { persistDiaryCreateIntent, persistDiaryUpdateIntent } from "@/repositories/diaryLocalIntent";
import { installMemoryLocalDatabase, reopenMemoryLocalDatabaseFrom, uninstallMemoryLocalDatabase } from "@/localDb/testHarness";
import { __diarySyncTest, syncEngine } from "@/sync/syncEngine";
import { sessionSyncGate } from "@/sync/sessionSyncGate";
import { syncSessionOwnership } from "@/sync/syncSessionOwnership";
import { resetDiaryRecordWritesForTests } from "@/sync/diaryRecordWrites";
import {
  acknowledgeDiaryCreateSuccess,
  acknowledgeDiaryFailure,
  captureSentDiaryOp,
} from "@/sync/diaryAck";

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
      const entry = { ...asEntry(id, input.title), userId, title: input.title };
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
    // A. Direct CREATE delayed; local edit arrives; old success preserves edit and queues UPDATE.
    const aStore = new Map<string, BusinessEntry>();
    const aEntered = deferred();
    const aGate = deferred();
    let aCreates = 0;
    let aUpdates = 0;
    setDiaryRepositoryForTests(
      mockRepo(aStore, {
        create: async (input) => {
          aCreates += 1;
          aEntered.resolve();
          await aGate.promise;
          const entry = { ...asEntry(input.clientRecordId!, input.title), userId: "u1" };
          aStore.set(entry.id, entry);
          return entry;
        },
        update: async (input) => {
          aUpdates += 1;
          const cur = aStore.get(input.id)!;
          const next = { ...cur, ...input, updatedAt: Date.now() } as BusinessEntry;
          aStore.set(input.id, next);
          return next;
        },
      })
    );
    const aPending = createEntryLocalFirst("u1", noteInput("en_ack_a", "original"));
    await aEntered.promise;
    await updateEntryLocalFirst("u1", { id: "en_ack_a", title: "new local edit" });
    const aMid = await localEntriesRepository.getRecord("u1", "en_ack_a");
    assert.equal(aMid?.entry.title, "new local edit");
    assert.ok(aMid?.meta.pendingOp === "create" || aMid?.meta.pendingOp === "update");
    aGate.resolve();
    const aResult = await aPending;
    const aAfter = await localEntriesRepository.getRecord("u1", "en_ack_a");
    assert.equal(aAfter?.entry.title, "new local edit");
    assert.equal(aAfter?.meta.remoteConfirmed, true);
    assert.notEqual(aAfter?.meta.syncStatus, "synced");
    assert.equal(aAfter?.meta.pendingOp, "update");
    const aQueue = (await syncQueueRepository.listForUser("u1")).filter((q) => q.entityId === "en_ack_a");
    assert.equal(aQueue.length, 1);
    assert.equal(aQueue[0]?.op, "update");
    assert.equal(aResult.remoteAccepted, false);
    assert.equal(aCreates, 1);
    const aFlush = await __diarySyncTest.processQueue("u1");
    assert.equal(aFlush.synced, 1);
    assert.equal(aCreates, 1);
    assert.equal(aUpdates, 1);
    assert.equal(aStore.get("en_ack_a")?.title, "new local edit");
    const aFinal = await localEntriesRepository.getRecord("u1", "en_ack_a");
    assert.equal(aFinal?.meta.syncStatus, "synced");
    assert.equal(aFinal?.entry.title, "new local edit");

    // B. Queued UPDATE delayed; newer edit replaces queue payload; old success preserves N+1.
    const bStore = new Map<string, BusinessEntry>();
    setDiaryRepositoryForTests(mockRepo(bStore));
    persistDiaryCreateIntent(asEntry("en_ack_b", "base"), noteInput("en_ack_b", "base"));
    await __diarySyncTest.processQueue("u1");
    assert.equal((await localEntriesRepository.getRecord("u1", "en_ack_b"))?.meta.syncStatus, "synced");

    const bEntered = deferred();
    const bGate = deferred();
    let bCaptured = "";
    let bUpdates = 0;
    let bCreates = 0;
    setDiaryRepositoryForTests(
      mockRepo(bStore, {
        create: async (input) => {
          bCreates += 1;
          const entry = { ...asEntry(input.clientRecordId!, input.title), userId: "u1" };
          bStore.set(entry.id, entry);
          return entry;
        },
        update: async (input) => {
          bUpdates += 1;
          bCaptured = input.title ?? "";
          bEntered.resolve();
          await bGate.promise;
          const cur = bStore.get(input.id)!;
          const next = { ...cur, ...input, updatedAt: Date.now() } as BusinessEntry;
          bStore.set(input.id, next);
          return next;
        },
      })
    );
    persistDiaryUpdateIntent("u1", { id: "en_ack_b", title: "N" });
    const bFlush = __diarySyncTest.processQueue("u1");
    await bEntered.promise;
    persistDiaryUpdateIntent("u1", { id: "en_ack_b", title: "N+1" });
    bGate.resolve();
    await bFlush;
    const bAfter = await localEntriesRepository.getRecord("u1", "en_ack_b");
    assert.equal(bCaptured, "N");
    assert.equal(bAfter?.entry.title, "N+1");
    assert.notEqual(bAfter?.meta.syncStatus, "synced");
    assert.equal(bAfter?.meta.pendingOp, "update");
    const bQueue = (await syncQueueRepository.listForUser("u1")).filter((q) => q.entityId === "en_ack_b");
    assert.equal(bQueue.length, 1);
    assert.equal(bQueue[0]?.op, "update");
    await __diarySyncTest.processQueue("u1");
    assert.equal(bCreates, 0);
    assert.equal(bStore.get("en_ack_b")?.title, "N+1");
    assert.equal((await localEntriesRepository.getRecord("u1", "en_ack_b"))?.meta.syncStatus, "synced");

    // C. Direct UPDATE completions in reverse order cannot regress the latest local intent.
    const cStore = new Map<string, BusinessEntry>();
    persistDiaryCreateIntent(asEntry("en_ack_c", "base"), noteInput("en_ack_c", "base"));
    setDiaryRepositoryForTests(mockRepo(cStore));
    await __diarySyncTest.processQueue("u1");
    const cGates = [deferred(), deferred()];
    const cEntered = [deferred(), deferred()];
    let cN = 0;
    setDiaryRepositoryForTests(
      mockRepo(cStore, {
        update: async (input) => {
          const i = cN++;
          cEntered[i]!.resolve();
          await cGates[i]!.promise;
          const cur = cStore.get(input.id)!;
          const next = { ...cur, ...input, updatedAt: Date.now() } as BusinessEntry;
          cStore.set(input.id, next);
          return next;
        },
      })
    );
    const cP1 = updateEntryLocalFirst("u1", { id: "en_ack_c", title: "A" });
    await cEntered[0]!.promise;
    const cP2 = updateEntryLocalFirst("u1", { id: "en_ack_c", title: "B" });
    cGates[0]!.resolve();
    await cP1;
    await cEntered[1]!.promise;
    cGates[1]!.resolve();
    await cP2;
    const cFinal = await localEntriesRepository.getRecord("u1", "en_ack_c");
    assert.equal(cFinal?.entry.title, "B");
    assert.notEqual(cFinal?.entry.title, "A");
    assert.equal(cStore.get("en_ack_c")?.title, "B");
    assert.equal(cFinal?.meta.syncStatus, "synced");
    assert.equal(
      (await syncQueueRepository.listForUser("u1")).filter((q) => q.entityId === "en_ack_c").length,
      0
    );

    // D. Old failure after a newer accepted/rearmed operation cannot suspend or remove that newer operation.
    const dStore = new Map<string, BusinessEntry>();
    persistDiaryCreateIntent(asEntry("en_ack_d", "base"), noteInput("en_ack_d", "base"));
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
          if (i === 0) throw new AppError("permission_denied", "stale");
          const cur = dStore.get(input.id)!;
          const next = { ...cur, ...input, updatedAt: Date.now() } as BusinessEntry;
          dStore.set(input.id, next);
          return next;
        },
      })
    );
    const dP1 = updateEntryLocalFirst("u1", { id: "en_ack_d", title: "old" });
    await dEntered[0]!.promise;
    const dP2 = updateEntryLocalFirst("u1", { id: "en_ack_d", title: "newer" });
    dGates[0]!.resolve();
    await dP1;
    await dEntered[1]!.promise;
    dGates[1]!.resolve();
    await dP2;
    const dFinal = await localEntriesRepository.getRecord("u1", "en_ack_d");
    assert.equal(dFinal?.entry.title, "newer");
    assert.notEqual(dFinal?.meta.syncErrorCode, "permission_denied");
    assert.equal(dFinal?.meta.autoRetry, true);
    assert.equal(dStore.get("en_ack_d")?.title, "newer");

    // E. Same-ID CREATE replay against newer server content does not overwrite it on a subsequent flush.
    const eRemote = { ...asEntry("en_ack_e", "server newer"), updatedAt: 99, documentHistory: {
      firstGeneratedAt: null,
      lastGeneratedAt: null,
      lastEditedAt: 99,
      versionNumber: 4,
      editHistory: [],
      pdfGenerationHistory: [],
    } };
    const eStore = new Map<string, BusinessEntry>([["en_ack_e", eRemote]]);
    let eCreates = 0;
    let eUpdates = 0;
    setDiaryRepositoryForTests(
      mockRepo(eStore, {
        create: async (input) => {
          eCreates += 1;
          return eStore.get(input.clientRecordId!)!;
        },
        update: async (input) => {
          eUpdates += 1;
          const cur = eStore.get(input.id)!;
          const next = { ...cur, ...input } as BusinessEntry;
          eStore.set(input.id, next);
          return next;
        },
      })
    );
    persistDiaryCreateIntent(asEntry("en_ack_e", "old local"), noteInput("en_ack_e", "old local"));
    await __diarySyncTest.processQueue("u1");
    assert.equal(eCreates, 1);
    assert.equal(eUpdates, 0);
    assert.equal(eStore.get("en_ack_e")?.title, "server newer");
    const eRow = await localEntriesRepository.getRecord("u1", "en_ack_e");
    assert.equal(eRow?.entry.title, "server newer");
    await __diarySyncTest.processQueue("u1");
    assert.equal(eUpdates, 0);
    assert.equal(eStore.get("en_ack_e")?.title, "server newer");

    // F. Genuine edit after CREATE dispatch eventually updates the same cloud ID, one CREATE.
    const fStore = new Map<string, BusinessEntry>();
    const fEntered = deferred();
    const fGate = deferred();
    let fCreates = 0;
    let fUpdates = 0;
    setDiaryRepositoryForTests(
      mockRepo(fStore, {
        create: async (input) => {
          fCreates += 1;
          fEntered.resolve();
          await fGate.promise;
          const entry = { ...asEntry(input.clientRecordId!, input.title), userId: "u1" };
          fStore.set(entry.id, entry);
          return entry;
        },
        update: async (input) => {
          fUpdates += 1;
          const cur = fStore.get(input.id)!;
          const next = { ...cur, ...input, updatedAt: Date.now() } as BusinessEntry;
          fStore.set(input.id, next);
          return next;
        },
      })
    );
    const fPending = createEntryLocalFirst("u1", noteInput("en_ack_f", "original"));
    await fEntered.promise;
    await updateEntryLocalFirst("u1", { id: "en_ack_f", title: "follow-up edit" });
    fGate.resolve();
    await fPending;
    await __diarySyncTest.processQueue("u1");
    assert.equal(fCreates, 1);
    assert.equal(fUpdates, 1);
    assert.equal(fStore.get("en_ack_f")?.title, "follow-up edit");
    assert.equal(fStore.get("en_ack_f")?.id, "en_ack_f");

    // G. Reminder-only in-flight edit survives.
    const gStore = new Map<string, BusinessEntry>();
    const gEntered = deferred();
    const gGate = deferred();
    setDiaryRepositoryForTests(
      mockRepo(gStore, {
        create: async (input) => {
          gEntered.resolve();
          await gGate.promise;
          const entry = { ...asEntry(input.clientRecordId!, input.title), userId: "u1", reminder: input.reminder ?? null };
          gStore.set(entry.id, entry);
          return entry;
        },
      })
    );
    const gPending = createEntryLocalFirst("u1", noteInput("en_ack_g", "same title"));
    await gEntered.promise;
    await updateEntryLocalFirst("u1", {
      id: "en_ack_g",
      reminder: { at: 1_800_000_000_000, note: "site call", notificationId: null },
    });
    gGate.resolve();
    await gPending;
    const gRow = await localEntriesRepository.getRecord("u1", "en_ack_g");
    assert.equal(gRow?.entry.title, "same title");
    assert.equal(gRow?.entry.reminder?.note, "site call");
    assert.equal(gRow?.meta.pendingOp, "update");
    assert.notEqual(gRow?.meta.syncStatus, "synced");

    // H. Pull/cache arrival while local changes are pending preserves those changes.
    setDiaryRepositoryForTests(
      mockRepo(new Map(), {
        create: async () => {
          throw new AppError("network", "offline");
        },
      })
    );
    const hLocal = await createEntryLocalFirst("u1", noteInput("en_ack_h", "local pending"));
    assert.equal(hLocal.remoteAccepted, false);
    await syncEngine.cacheEntry({
      ...asEntry("en_ack_h", "cloud overwrite"),
      userId: "u1",
    });
    const hRow = await localEntriesRepository.getRecord("u1", "en_ack_h");
    assert.equal(hRow?.entry.title, "local pending");
    assert.notEqual(hRow?.meta.syncStatus, "synced");

    // Round 6 — lost CREATE ack, later edit, restart, existing-record replay.
    // Boundary: production persist/processQueue/ack; mocked DiaryRepository (not Firebase quota).
    const lostStore = new Map<string, BusinessEntry>();
    let lostCreates = 0;
    let lostUpdates = 0;
    setDiaryRepositoryForTests(
      mockRepo(lostStore, {
        create: async (input) => {
          lostCreates += 1;
          const entry = { ...asEntry(input.clientRecordId!, input.title), userId: "u1", updatedAt: 50 };
          lostStore.set(entry.id, entry);
          throw new AppError("network", "ack lost");
        },
        update: async (input) => {
          lostUpdates += 1;
          const cur = lostStore.get(input.id)!;
          const next = { ...cur, ...input, updatedAt: Date.now() } as BusinessEntry;
          lostStore.set(input.id, next);
          return next;
        },
      })
    );
    const lostMemory = installMemoryLocalDatabase();
    syncSessionOwnership.resetForTests();
    syncSessionOwnership.beginSession("u1");
    const lostCreate = await createEntryLocalFirst("u1", noteInput("en_lost_1", "original"));
    assert.equal(lostCreate.remoteAccepted, false);
    assert.equal(lostStore.get("en_lost_1")?.title, "original");
    await updateEntryLocalFirst("u1", { id: "en_lost_1", title: "later offline edit" });
    const lostMid = await localEntriesRepository.getRecord("u1", "en_lost_1");
    assert.equal(lostMid?.entry.title, "later offline edit");
    assert.ok((lostMid?.meta.originRevision ?? 0) > 0);
    assert.equal(lostMid?.meta.originEntry?.title, "original");
    reopenMemoryLocalDatabaseFrom(lostMemory);
    setDiaryRepositoryForTests(
      mockRepo(lostStore, {
        create: async (input) => {
          lostCreates += 1;
          return lostStore.get(input.clientRecordId!)!;
        },
        update: async (input) => {
          lostUpdates += 1;
          const cur = lostStore.get(input.id)!;
          if (input.expectedUpdatedAt != null && cur.updatedAt !== input.expectedUpdatedAt) {
            throw new AppError("save_failed", "Entry changed remotely.", undefined, { remoteChanged: true });
          }
          const next = { ...cur, ...input, updatedAt: Date.now() } as BusinessEntry;
          lostStore.set(input.id, next);
          return next;
        },
      })
    );
    await __diarySyncTest.processQueue("u1");
    const lostAfterReplay = await localEntriesRepository.getRecord("u1", "en_lost_1");
    assert.equal(lostAfterReplay?.entry.title, "later offline edit");
    assert.notEqual(lostAfterReplay?.meta.syncStatus, "synced");
    assert.equal(lostAfterReplay?.meta.pendingOp, "update");
    assert.equal(lostAfterReplay?.meta.localRevision, 2);
    assert.equal(lostAfterReplay?.meta.ackedRevision, 1);
    assert.ok((lostAfterReplay?.meta.ackedRevision ?? 0) < (lostAfterReplay?.meta.localRevision ?? 0));
    assert.equal(lostStore.get("en_lost_1")?.title, "original");
    await __diarySyncTest.processQueue("u1");
    assert.equal(lostStore.get("en_lost_1")?.title, "later offline edit");
    assert.equal((await localEntriesRepository.getRecord("u1", "en_lost_1"))?.meta.syncStatus, "synced");
    assert.equal(lostCreates, 2);
    assert.equal(lostUpdates, 1);

    async function recoverLostCreateWithLaterEdit(id: string) {
      const store = new Map<string, BusinessEntry>();
      setDiaryRepositoryForTests(
        mockRepo(store, {
          create: async (input) => {
            const entry = { ...asEntry(input.clientRecordId!, input.title), userId: "u1", updatedAt: 50 };
            store.set(entry.id, entry);
            throw new AppError("network", "ack lost");
          },
        })
      );
      const memory = installMemoryLocalDatabase();
      syncSessionOwnership.beginSession("u1");
      await createEntryLocalFirst("u1", noteInput(id, "original"));
      await updateEntryLocalFirst("u1", { id, title: "later offline edit" });
      reopenMemoryLocalDatabaseFrom(memory);
      setDiaryRepositoryForTests(
        mockRepo(store, {
          create: async (input) => store.get(input.clientRecordId!)!,
        })
      );
      await __diarySyncTest.processQueue("u1");
      return store;
    }

    // B. Follow-up UPDATE permission_denied.
    {
      const store = await recoverLostCreateWithLaterEdit("en_lost_perm");
      let updates = 0;
      setDiaryRepositoryForTests(
        mockRepo(store, {
          update: async () => {
            updates += 1;
            throw new AppError("permission_denied", "denied");
          },
        })
      );
      const before = await localEntriesRepository.getRecord("u1", "en_lost_perm");
      const queueBefore = (await syncQueueRepository.listForUser("u1")).find((q) => q.entityId === "en_lost_perm");
      const deniedSent = captureSentDiaryOp({
        userId: "u1",
        recordId: "en_lost_perm",
        op: "update",
        queueId: queueBefore?.id ?? null,
        entry: before!.entry,
        session: syncSessionOwnership.capture(),
        revision: before!.meta.localRevision,
        dispatchGeneration: before!.meta.dispatchGeneration,
      });
      await __diarySyncTest.processQueue("u1");
      const after = await localEntriesRepository.getRecord("u1", "en_lost_perm");
      assert.equal(after?.entry.title, "later offline edit");
      assert.equal(store.get("en_lost_perm")?.title, "original");
      assert.equal(after?.meta.syncErrorCode, "permission_denied");
      assert.equal(after?.meta.autoRetry, false);
      assert.equal(after?.meta.pendingOp, "update");
      assert.equal(updates, 1);
      await __diarySyncTest.processQueue("u1");
      assert.equal(updates, 1);
      await localEntriesRepository.enableAutoRetry("u1", "en_lost_perm");
      const rearmed = await localEntriesRepository.getRecord("u1", "en_lost_perm");
      assert.equal(rearmed?.meta.autoRetry, true);
      const oldFail = acknowledgeDiaryFailure(deniedSent, new AppError("permission_denied", "old"));
      assert.equal(oldFail.applied, false);
      assert.equal((await localEntriesRepository.getRecord("u1", "en_lost_perm"))?.meta.autoRetry, true);
    }

    // C. Follow-up UPDATE remoteChanged.
    {
      const store = await recoverLostCreateWithLaterEdit("en_lost_conflict");
      let updates = 0;
      setDiaryRepositoryForTests(
        mockRepo(store, {
          update: async () => {
            updates += 1;
            throw new AppError("save_failed", "Entry changed remotely.", undefined, { remoteChanged: true });
          },
        })
      );
      await __diarySyncTest.processQueue("u1");
      const after = await localEntriesRepository.getRecord("u1", "en_lost_conflict");
      assert.equal(after?.entry.title, "later offline edit");
      assert.equal(store.get("en_lost_conflict")?.title, "original");
      assert.equal(after?.meta.syncStatus, "conflict");
      assert.equal(after?.meta.syncErrorCode, "conflict");
      assert.equal(after?.meta.autoRetry, false);
      await __diarySyncTest.processQueue("u1");
      assert.equal(updates, 1);
    }

    // D. Follow-up UPDATE network failure.
    {
      const store = await recoverLostCreateWithLaterEdit("en_lost_net");
      let updates = 0;
      setDiaryRepositoryForTests(
        mockRepo(store, {
          update: async () => {
            updates += 1;
            throw new AppError("network", "offline");
          },
        })
      );
      await __diarySyncTest.processQueue("u1");
      const after = await localEntriesRepository.getRecord("u1", "en_lost_net");
      assert.equal(after?.entry.title, "later offline edit");
      assert.equal(after?.meta.autoRetry, true);
      assert.equal(after?.meta.syncErrorCode, null);
      assert.equal(after?.meta.pendingOp, "update");
      const q = (await syncQueueRepository.listForUser("u1")).filter((i) => i.entityId === "en_lost_net");
      assert.ok(q.length >= 1);
      assert.equal(store.get("en_lost_net")?.title, "original");
    }

    // Settled revision: success then late failure cannot reopen.
    persistDiaryCreateIntent(asEntry("en_settled", "ok"), noteInput("en_settled", "ok"));
    const settledRow = await localEntriesRepository.getRecord("u1", "en_settled");
    const settledSent = captureSentDiaryOp({
      userId: "u1",
      recordId: "en_settled",
      op: "create",
      queueId: (await syncQueueRepository.listForUser("u1")).find((q) => q.entityId === "en_settled")?.id ?? null,
      entry: settledRow!.entry,
      session: syncSessionOwnership.capture(),
    });
    setDiaryRepositoryForTests(mockRepo(new Map()));
    await __diarySyncTest.processQueue("u1");
    assert.equal((await localEntriesRepository.getRecord("u1", "en_settled"))?.meta.syncStatus, "synced");
    const lateFail = acknowledgeDiaryFailure(settledSent, new AppError("permission_denied", "late"));
    assert.equal(lateFail.applied, false);
    const settledAfter = await localEntriesRepository.getRecord("u1", "en_settled");
    assert.equal(settledAfter?.meta.syncStatus, "synced");
    assert.equal(settledAfter?.meta.autoRetry, true);
    assert.notEqual(settledAfter?.meta.syncErrorCode, "permission_denied");
    const dup = acknowledgeDiaryCreateSuccess(settledSent, { ...asEntry("en_settled", "ok"), userId: "u1" }, "created");
    assert.equal(dup.applied, false);
    assert.equal((await localEntriesRepository.getRecord("u1", "en_settled"))?.meta.syncStatus, "synced");

    persistDiaryCreateIntent(asEntry("en_create_then_update", "c"), noteInput("en_create_then_update", "c"));
    setDiaryRepositoryForTests(mockRepo(new Map()));
    await __diarySyncTest.processQueue("u1");
    const afterCreate = await localEntriesRepository.getRecord("u1", "en_create_then_update");
    const createSent = captureSentDiaryOp({
      userId: "u1",
      recordId: "en_create_then_update",
      op: "create",
      queueId: null,
      entry: afterCreate!.entry,
      session: syncSessionOwnership.capture(),
    });
    await updateEntryLocalFirst("u1", { id: "en_create_then_update", title: "updated" });
    await __diarySyncTest.processQueue("u1");
    const afterUpdate = await localEntriesRepository.getRecord("u1", "en_create_then_update");
    assert.equal(afterUpdate?.meta.syncStatus, "synced");
    acknowledgeDiaryCreateSuccess(createSent, { ...asEntry("en_create_then_update", "c"), userId: "u1" }, "created");
    const afterStaleCreate = await localEntriesRepository.getRecord("u1", "en_create_then_update");
    assert.equal(afterStaleCreate?.entry.title, "updated");
    assert.equal(afterStaleCreate?.meta.syncStatus, "synced");

    persistDiaryCreateIntent(asEntry("en_rearm", "r"), noteInput("en_rearm", "r"));
    const rearmRecord = await localEntriesRepository.getRecord("u1", "en_rearm");
    const rearmSent = captureSentDiaryOp({
      userId: "u1",
      recordId: "en_rearm",
      op: "create",
      queueId: (await syncQueueRepository.listForUser("u1")).find((q) => q.entityId === "en_rearm")?.id ?? null,
      entry: rearmRecord!.entry,
      session: syncSessionOwnership.capture(),
    });
    setDiaryRepositoryForTests(
      mockRepo(new Map(), {
        create: async () => {
          throw new AppError("permission_denied", "denied");
        },
      })
    );
    await __diarySyncTest.processQueue("u1");
    await localEntriesRepository.enableAutoRetry("u1", "en_rearm");
    const afterRearm = await localEntriesRepository.getRecord("u1", "en_rearm");
    assert.equal(afterRearm?.meta.autoRetry, true);
    const oldFail = acknowledgeDiaryFailure(rearmSent, new AppError("permission_denied", "old"));
    assert.equal(oldFail.applied, false);
    assert.equal((await localEntriesRepository.getRecord("u1", "en_rearm"))?.meta.autoRetry, true);
  } finally {
    setDiaryRepositoryForTests(null);
    sessionSyncGate.unlock();
    syncSessionOwnership.resetForTests();
    __diarySyncTest.resetFlushChain();
    uninstallMemoryLocalDatabase();
  }

  console.log("diary.ackOwnership.test.ts: ok");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
