/**
 * Round 8 — reminder attachment through owned local-first writes.
 * Boundary: mocked DiaryRepository + MemorySqlite + test notification hooks.
 * Not device, expo-sqlite, native notifications, or Firestore emulator quota.
 */
import assert from "node:assert/strict";

import { AppError } from "@/domain/errors";
import type { BusinessEntry } from "@/domain/businessEntry";
import type { CreateBusinessEntryInput, DiaryRepository, UpdateBusinessEntryInput } from "@/services/diary/types";
import { setDiaryRepositoryForTests } from "@/services/diary";
import { updateEntryLocalFirst } from "@/services/diary/localFirst";
import {
  createEntryWithReminder,
  setReminderNotificationsForTests,
} from "@/services/diary/saveWithReminder";
import { expectedUpdatedAtForRecord } from "@/sync/diaryAck";
import { localEntriesRepository } from "@/repositories/localEntriesRepository";
import { syncQueueRepository } from "@/repositories/syncQueueRepository";
import { installMemoryLocalDatabase, uninstallMemoryLocalDatabase } from "@/localDb/testHarness";
import { __diarySyncTest } from "@/sync/syncEngine";
import { sessionSyncGate } from "@/sync/sessionSyncGate";
import { syncSessionOwnership } from "@/sync/syncSessionOwnership";
import { resetDiaryRecordWritesForTests } from "@/sync/diaryRecordWrites";
import { applyAuthSyncIdentityTransition } from "@/sync/syncLockIdentityPolicy";
import { SAVE_STEP, hasCompletedStep } from "@/services/records/saveLockTypes";
import { fetchRecordCompletedSteps } from "@/services/records/recordCompletedSteps";
import { runRecordStepIfNeeded } from "@/services/records/saveCoordinator";
import {
  attachComposerPdfUri,
  composerSecondaryWriteReachedCloud,
} from "@/services/diary/composerSaveSteps";

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function noteInput(id: string, title = "original"): CreateBusinessEntryInput {
  return {
    clientRecordId: id,
    ueid: "VYD-2026-TEST01",
    entryType: "work_update_issue",
    title,
    entryDate: 1_700_000_000_000,
    reminder: { at: 1_800_000_000_000, note: "call site", notificationId: null },
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

function asEntry(id: string, title = "original", userId = "u1"): BusinessEntry {
  const input = noteInput(id, title);
  return {
    id,
    userId,
    ueid: input.ueid,
    entryType: input.entryType,
    title: input.title,
    entryDate: input.entryDate,
    notes: null,
    reminder: input.reminder ?? null,
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

function applyCasUpdate(
  store: Map<string, BusinessEntry>,
  clock: { n: number },
  userId: string,
  input: UpdateBusinessEntryInput
): BusinessEntry {
  const cur = store.get(input.id);
  if (!cur) throw new AppError("not_found", "missing");
  if (input.expectedUpdatedAt != null && cur.updatedAt !== input.expectedUpdatedAt) {
    throw new AppError("save_failed", "Entry changed remotely.", undefined, { remoteChanged: true });
  }
  clock.n += 1;
  const next: BusinessEntry = {
    ...cur,
    userId,
    title: input.title ?? cur.title,
    entryDate: input.entryDate ?? cur.entryDate,
    notes: input.notes !== undefined ? input.notes : cur.notes,
    reminder: input.reminder !== undefined ? input.reminder : cur.reminder,
    location: input.location !== undefined ? input.location : cur.location,
    attachments: input.attachments ?? cur.attachments,
    payload: input.payload ?? cur.payload,
    pdfUri: input.pdfUri !== undefined ? input.pdfUri : cur.pdfUri,
    updatedAt: clock.n,
  };
  store.set(input.id, next);
  return next;
}

function mockRepo(
  store: Map<string, BusinessEntry>,
  clock: { n: number },
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
      clock.n += 1;
      const entry = {
        ...asEntry(id, input.title, userId),
        reminder: input.reminder ?? null,
        updatedAt: clock.n,
      };
      store.set(id, entry);
      return { record: entry, outcome: had ? "existing" : "created" };
    },
    async update(userId, input) {
      if (hooks?.update) return hooks.update(input);
      return applyCasUpdate(store, clock, userId, input);
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

const labels = { title: "Reminder: {{title}}", body: "follow up" };

function installAsyncStoragePolyfill(): void {
  (globalThis as unknown as { __DEV__: boolean }).__DEV__ = true;
  const mem = new Map<string, string>();
  (globalThis as unknown as { window: { localStorage: Storage } }).window = {
    localStorage: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
      removeItem: (k: string) => {
        mem.delete(k);
      },
      clear: () => {
        mem.clear();
      },
      get length() {
        return mem.size;
      },
      key: (i: number) => [...mem.keys()][i] ?? null,
    } as Storage,
  };
}

async function main() {
  installAsyncStoragePolyfill();
  const { default: AsyncStorage } = await import("@react-native-async-storage/async-storage");
  await AsyncStorage.clear();
  installMemoryLocalDatabase();
  sessionSyncGate.unlock();
  syncSessionOwnership.resetForTests();
  __diarySyncTest.resetFlushChain();
  resetDiaryRecordWritesForTests();
  applyAuthSyncIdentityTransition({
    prevStatus: "signed_out",
    nextStatus: "signed_in",
    prevUid: null,
    nextUid: "u1",
  });

  try {
    setReminderNotificationsForTests({
      scheduleOneShot: async () => "nid-a",
      cancel: async () => undefined,
    });

    // A. Reminder save then PDF metadata — production createEntryWithReminder + local-first.
    const aStore = new Map<string, BusinessEntry>();
    const aClock = { n: 1000 };
    let aCreates = 0;
    let aUpdates = 0;
    setDiaryRepositoryForTests(
      mockRepo(aStore, aClock, {
        create: async (input) => {
          aCreates += 1;
          aClock.n += 1;
          const entry = {
            ...asEntry(input.clientRecordId!, input.title, "u1"),
            reminder: input.reminder ?? null,
            updatedAt: aClock.n,
          };
          aStore.set(entry.id, entry);
          return entry;
        },
        update: async (input) => {
          aUpdates += 1;
          return applyCasUpdate(aStore, aClock, "u1", input);
        },
      })
    );
    const createdA = await createEntryWithReminder("u1", noteInput("en_r8_a"), labels);
    assert.equal(createdA.remoteAccepted, true);
    assert.equal(createdA.reminderRemoteAccepted, true);
    assert.equal(createdA.entry.id, "en_r8_a");
    assert.equal(aCreates, 1);
    const afterReminderExpected = expectedUpdatedAtForRecord("u1", "en_r8_a");
    assert.equal(afterReminderExpected, aStore.get("en_r8_a")?.updatedAt);
    const pdfA = await updateEntryLocalFirst("u1", { id: "en_r8_a", pdfUri: "file:///tmp/a.pdf" });
    assert.equal(pdfA.remoteAccepted, true);
    const aLocal = await localEntriesRepository.getRecord("u1", "en_r8_a");
    const aRemote = aStore.get("en_r8_a");
    assert.equal(aLocal?.entry.reminder?.notificationId, "nid-a");
    assert.equal(aRemote?.reminder?.notificationId, "nid-a");
    assert.equal(aLocal?.entry.pdfUri, "file:///tmp/a.pdf");
    assert.equal(aRemote?.pdfUri, "file:///tmp/a.pdf");
    assert.equal(aLocal?.meta.syncStatus, "synced");
    assert.equal(aLocal?.entry.id, "en_r8_a");
    assert.equal(aCreates, 1);
    assert.equal(aUpdates, 2);

    // B. Notification await across A -> B.
    resetDiaryRecordWritesForTests();
    const tokenA = applyAuthSyncIdentityTransition({
      prevStatus: "signed_in",
      nextStatus: "signed_in",
      prevUid: "u1",
      nextUid: "user-a",
    });
    const bStore = new Map<string, BusinessEntry>();
    const bClock = { n: 2000 };
    let bCreates = 0;
    let bUpdates = 0;
    const bSched = deferred<string>();
    const bEntered = deferred();
    const cancelledB: string[] = [];
    setReminderNotificationsForTests({
      scheduleOneShot: async () => {
        bEntered.resolve();
        return bSched.promise;
      },
      cancel: async (id) => {
        if (id) cancelledB.push(id);
      },
    });
    setDiaryRepositoryForTests(
      mockRepo(bStore, bClock, {
        create: async (input) => {
          bCreates += 1;
          bClock.n += 1;
          const entry = {
            ...asEntry(input.clientRecordId!, input.title, "user-a"),
            reminder: input.reminder ?? null,
            updatedAt: bClock.n,
          };
          bStore.set(entry.id, entry);
          return entry;
        },
        update: async (input) => {
          bUpdates += 1;
          return applyCasUpdate(bStore, bClock, "user-a", input);
        },
      })
    );
    const pendingB = createEntryWithReminder("user-a", noteInput("en_r8_b"), labels);
    await bEntered.promise;
    const tokenB = applyAuthSyncIdentityTransition({
      prevStatus: "signed_in",
      nextStatus: "signed_in",
      prevUid: "user-a",
      nextUid: "user-b",
    });
    assert.ok(tokenA && tokenB);
    assert.notEqual(tokenB.generation, tokenA.generation);
    bSched.resolve("nid-retired");
    const resultB = await pendingB;
    assert.equal(bCreates, 1);
    assert.equal(bUpdates, 0, "retired continuation must not UPDATE after A->B");
    assert.equal(sessionSyncGate.isLocked(), false);
    assert.equal(syncSessionOwnership.current()?.uid, "user-b");
    assert.equal(resultB.remoteAccepted, true);
    assert.equal(resultB.reminderRemoteAccepted, false);
    const bLocal = await localEntriesRepository.getRecord("user-a", "en_r8_b");
    assert.equal(bLocal?.entry.reminder?.notificationId, "nid-retired");
    assert.equal(bLocal?.meta.remoteConfirmed, true);
    assert.equal(cancelledB.length, 0);
    assert.equal(bStore.get("en_r8_b")?.reminder?.notificationId ?? null, null);

    // C. A -> logout -> A new generation.
    resetDiaryRecordWritesForTests();
    const tokenC1 = applyAuthSyncIdentityTransition({
      prevStatus: "signed_in",
      nextStatus: "signed_in",
      prevUid: "user-b",
      nextUid: "user-a",
    });
    const cStore = new Map<string, BusinessEntry>();
    const cClock = { n: 3000 };
    let cUpdates = 0;
    const cSched = deferred<string>();
    const cEntered = deferred();
    setReminderNotificationsForTests({
      scheduleOneShot: async () => {
        cEntered.resolve();
        return cSched.promise;
      },
      cancel: async () => undefined,
    });
    setDiaryRepositoryForTests(
      mockRepo(cStore, cClock, {
        create: async (input) => {
          cClock.n += 1;
          const entry = {
            ...asEntry(input.clientRecordId!, input.title, "user-a"),
            reminder: input.reminder ?? null,
            updatedAt: cClock.n,
          };
          cStore.set(entry.id, entry);
          return entry;
        },
        update: async (input) => {
          cUpdates += 1;
          return applyCasUpdate(cStore, cClock, "user-a", input);
        },
      })
    );
    const pendingC = createEntryWithReminder("user-a", noteInput("en_r8_c"), labels);
    await cEntered.promise;
    applyAuthSyncIdentityTransition({
      prevStatus: "signed_in",
      nextStatus: "signed_out",
      prevUid: "user-a",
      nextUid: null,
    });
    const tokenC2 = applyAuthSyncIdentityTransition({
      prevStatus: "signed_out",
      nextStatus: "signed_in",
      prevUid: null,
      nextUid: "user-a",
    });
    assert.ok(tokenC1 && tokenC2);
    assert.notEqual(tokenC2.generation, tokenC1.generation);
    cSched.resolve("nid-c");
    await pendingC;
    assert.equal(cUpdates, 0, "old continuation cannot acquire the new generation");
    assert.equal(syncSessionOwnership.current()?.generation, tokenC2.generation);

    // D. Reminder changed/cleared while scheduling + unrelated title survives.
    resetDiaryRecordWritesForTests();
    applyAuthSyncIdentityTransition({
      prevStatus: "signed_in",
      nextStatus: "signed_in",
      prevUid: "user-a",
      nextUid: "u1",
    });
    const dStore = new Map<string, BusinessEntry>();
    const dClock = { n: 4000 };
    const dCancelled: string[] = [];
    const dSched = deferred<string>();
    const dEntered = deferred();
    setReminderNotificationsForTests({
      scheduleOneShot: async () => {
        dEntered.resolve();
        return dSched.promise;
      },
      cancel: async (id) => {
        if (id) dCancelled.push(id);
      },
    });
    setDiaryRepositoryForTests(
      mockRepo(dStore, dClock, {
        create: async (input) => {
          dClock.n += 1;
          const entry = {
            ...asEntry(input.clientRecordId!, input.title, "u1"),
            reminder: input.reminder ?? null,
            updatedAt: dClock.n,
          };
          dStore.set(entry.id, entry);
          return entry;
        },
        update: async (input) => applyCasUpdate(dStore, dClock, "u1", input),
      })
    );
    const pendingD = createEntryWithReminder("u1", noteInput("en_r8_d"), labels);
    await dEntered.promise;
    await updateEntryLocalFirst("u1", {
      id: "en_r8_d",
      title: "NEW TITLE",
      reminder: null,
    });
    dSched.resolve("nid-stale");
    const resultD = await pendingD;
    assert.equal(resultD.entry.title, "NEW TITLE");
    assert.equal(resultD.entry.reminder, null);
    assert.equal(dCancelled.includes("nid-stale"), true);
    const dLocal = await localEntriesRepository.getRecord("u1", "en_r8_d");
    assert.equal(dLocal?.entry.title, "NEW TITLE");
    assert.equal(dLocal?.entry.reminder, null);
    assert.notEqual(dStore.get("en_r8_d")?.reminder?.notificationId, "nid-stale");

    const d2Store = new Map<string, BusinessEntry>();
    const d2Clock = { n: 4500 };
    const d2Sched = deferred<string>();
    const d2Entered = deferred();
    setReminderNotificationsForTests({
      scheduleOneShot: async () => {
        d2Entered.resolve();
        return d2Sched.promise;
      },
      cancel: async () => undefined,
    });
    setDiaryRepositoryForTests(
      mockRepo(d2Store, d2Clock, {
        create: async (input) => {
          d2Clock.n += 1;
          const entry = {
            ...asEntry(input.clientRecordId!, input.title, "u1"),
            reminder: input.reminder ?? null,
            updatedAt: d2Clock.n,
          };
          d2Store.set(entry.id, entry);
          return entry;
        },
        update: async (input) => applyCasUpdate(d2Store, d2Clock, "u1", input),
      })
    );
    const pendingD2 = createEntryWithReminder("u1", noteInput("en_r8_d2"), labels);
    await d2Entered.promise;
    await updateEntryLocalFirst("u1", { id: "en_r8_d2", title: "KEEP TITLE", notes: "site notes" });
    d2Sched.resolve("nid-keep");
    const resultD2 = await pendingD2;
    assert.equal(resultD2.entry.title, "KEEP TITLE");
    assert.equal(resultD2.entry.notes, "site notes");
    assert.equal(resultD2.entry.reminder?.notificationId, "nid-keep");
    assert.equal(resultD2.reminderRemoteAccepted, true);

    // E. Reminder UPDATE denied / PDF unavailable / network + permission vs notification.
    resetDiaryRecordWritesForTests();
    const eStore = new Map<string, BusinessEntry>();
    const eClock = { n: 5000 };
    let eCreates = 0;
    let eUpdates = 0;
    setReminderNotificationsForTests({
      scheduleOneShot: async () => "nid-e",
      cancel: async () => undefined,
    });
    setDiaryRepositoryForTests(
      mockRepo(eStore, eClock, {
        create: async (input) => {
          eCreates += 1;
          eClock.n += 1;
          const entry = {
            ...asEntry(input.clientRecordId!, input.title, "u1"),
            reminder: input.reminder ?? null,
            updatedAt: eClock.n,
          };
          eStore.set(entry.id, entry);
          return entry;
        },
        update: async () => {
          eUpdates += 1;
          throw new AppError("permission_denied", "Missing or insufficient permissions.");
        },
      })
    );
    const denied = await createEntryWithReminder("u1", noteInput("en_r8_e"), labels);
    assert.equal(denied.remoteAccepted, true);
    assert.equal(denied.reminderRemoteAccepted, false);
    assert.equal(denied.reminderFailureKind, "permission_denied");
    assert.notEqual(
      String(denied.entry.reminder?.notificationId),
      "",
      "local reminder retained"
    );
    const eLocal = await localEntriesRepository.getRecord("u1", "en_r8_e");
    assert.equal(eLocal?.entry.reminder?.notificationId, "nid-e");
    assert.equal(eLocal?.meta.syncErrorCode, "permission_denied");
    assert.equal(eLocal?.meta.autoRetry, false);
    assert.equal(eStore.get("en_r8_e")?.reminder?.notificationId ?? null, null);
    const eUpdatesAfterFail = eUpdates;
    await __diarySyncTest.processQueue("u1");
    await __diarySyncTest.processQueue("u1");
    assert.equal(eUpdates, eUpdatesAfterFail, "repeated flush respects suspension");
    assert.equal(eCreates, 1);

    await localEntriesRepository.enableAutoRetry("u1", "en_r8_e");
    setDiaryRepositoryForTests(
      mockRepo(eStore, eClock, {
        create: async (input) => {
          eCreates += 1;
          return eStore.get(input.clientRecordId!)!;
        },
        update: async (input) => {
          eUpdates += 1;
          return applyCasUpdate(eStore, eClock, "u1", input);
        },
      })
    );
    await __diarySyncTest.processQueue("u1");
    const eRecovered = await localEntriesRepository.getRecord("u1", "en_r8_e");
    assert.equal(eRecovered?.entry.id, "en_r8_e");
    assert.equal(eRecovered?.entry.reminder?.notificationId, "nid-e");
    assert.equal(eStore.get("en_r8_e")?.reminder?.notificationId, "nid-e");
    assert.equal(eCreates, 1);

    const nStore = new Map<string, BusinessEntry>();
    const nClock = { n: 5500 };
    let nUpdates = 0;
    setReminderNotificationsForTests({
      scheduleOneShot: async () => "nid-net",
      cancel: async () => undefined,
    });
    setDiaryRepositoryForTests(
      mockRepo(nStore, nClock, {
        create: async (input) => {
          nClock.n += 1;
          const entry = {
            ...asEntry(input.clientRecordId!, input.title, "u1"),
            reminder: input.reminder ?? null,
            updatedAt: nClock.n,
          };
          nStore.set(entry.id, entry);
          return entry;
        },
        update: async () => {
          nUpdates += 1;
          throw new AppError("network", "offline");
        },
      })
    );
    const net = await createEntryWithReminder("u1", noteInput("en_r8_net"), labels);
    assert.equal(net.remoteAccepted, true);
    assert.equal(net.reminderRemoteAccepted, false);
    assert.equal(net.reminderFailureKind, "network");
    const netLocal = await localEntriesRepository.getRecord("u1", "en_r8_net");
    assert.equal(netLocal?.entry.reminder?.notificationId, "nid-net");
    assert.equal(netLocal?.meta.autoRetry, true);
    const queued = (await syncQueueRepository.listForUser("u1")).filter((q) => q.entityId === "en_r8_net");
    assert.ok(queued.length > 0);

    const pStore = new Map<string, BusinessEntry>();
    const pClock = { n: 5600 };
    setReminderNotificationsForTests({
      scheduleOneShot: async () => {
        throw new AppError("permission_denied", "Notification permission not granted.");
      },
      cancel: async () => undefined,
    });
    setDiaryRepositoryForTests(mockRepo(pStore, pClock));
    await assert.rejects(
      () => createEntryWithReminder("u1", noteInput("en_r8_notif"), labels),
      (err: unknown) =>
        err instanceof AppError &&
        err.code === "permission_denied" &&
        err.message === "Notification permission is required to save this reminder."
    );

    setReminderNotificationsForTests({
      scheduleOneShot: async () => "nid-fs",
      cancel: async () => undefined,
    });
    const fsStore = new Map<string, BusinessEntry>();
    const fsClock = { n: 5650 };
    setDiaryRepositoryForTests(
      mockRepo(fsStore, fsClock, {
        update: async () => {
          throw new AppError("permission_denied", "Missing or insufficient permissions.");
        },
      })
    );
    const fsDenied = await createEntryWithReminder("u1", noteInput("en_r8_fs"), labels);
    assert.equal(fsDenied.remoteAccepted, true);
    assert.equal(fsDenied.reminderRemoteAccepted, false);
    assert.equal(fsDenied.reminderFailureKind, "permission_denied");

    // PDF UPDATE remoteChanged after a successful reminder (owned path must not false-conflict).
    const fStore = new Map<string, BusinessEntry>();
    const fClock = { n: 5700 };
    setReminderNotificationsForTests({
      scheduleOneShot: async () => "nid-pdf",
      cancel: async () => undefined,
    });
    setDiaryRepositoryForTests(
      mockRepo(fStore, fClock, {
        create: async (input) => {
          fClock.n += 1;
          const entry = {
            ...asEntry(input.clientRecordId!, input.title, "u1"),
            reminder: input.reminder ?? null,
            updatedAt: fClock.n,
          };
          fStore.set(entry.id, entry);
          return entry;
        },
        update: async (input) => {
          if (input.pdfUri) {
            throw new AppError("save_failed", "Entry changed remotely.", undefined, {
              remoteChanged: true,
            });
          }
          return applyCasUpdate(fStore, fClock, "u1", input);
        },
      })
    );
    await createEntryWithReminder("u1", noteInput("en_r8_pdf"), labels);
    const pdfDenied = await updateEntryLocalFirst("u1", {
      id: "en_r8_pdf",
      pdfUri: "file:///tmp/denied.pdf",
    });
    assert.equal(pdfDenied.remoteAccepted, false);
    const pdfLocal = await localEntriesRepository.getRecord("u1", "en_r8_pdf");
    assert.equal(pdfLocal?.entry.pdfUri, "file:///tmp/denied.pdf");
    assert.equal(pdfLocal?.meta.syncStatus, "conflict");
    assert.equal(pdfLocal?.meta.autoRetry, false);
    assert.equal(fStore.get("en_r8_pdf")?.pdfUri ?? null, null);

    // F. Composer consumer: base CREATE vs pending secondary PDF URI.
    // Uses the same attachComposerPdfUri helper as saveComposerEntry (Node-safe;
    // saveComposerEntry itself still imports expo PDF templates).
    assert.equal(
      composerSecondaryWriteReachedCloud({ entry: asEntry("x"), remoteAccepted: false }),
      false
    );
    assert.equal(
      composerSecondaryWriteReachedCloud({ entry: asEntry("x"), remoteAccepted: true }),
      true
    );

    const gStore = new Map<string, BusinessEntry>();
    const gClock = { n: 6000 };
    let gCreates = 0;
    setReminderNotificationsForTests({
      scheduleOneShot: async () => "nid-comp",
      cancel: async () => undefined,
    });
    setDiaryRepositoryForTests(
      mockRepo(gStore, gClock, {
        create: async (input) => {
          gCreates += 1;
          gClock.n += 1;
          const entry = {
            ...asEntry(input.clientRecordId!, input.title, "u1"),
            reminder: input.reminder ?? null,
            updatedAt: gClock.n,
          };
          gStore.set(entry.id, entry);
          return entry;
        },
        update: async (input) => applyCasUpdate(gStore, gClock, "u1", input),
      })
    );
    const createdG = await createEntryWithReminder("u1", noteInput("en_r8_comp"), labels);
    assert.equal(createdG.remoteAccepted, true);
    assert.equal(createdG.reminderRemoteAccepted, true);
    const baseG = await runRecordStepIfNeeded(
      {
        userId: "u1",
        recordKind: "business_entry",
        recordId: "en_r8_comp",
        step: SAVE_STEP.BASE_RECORD_CREATED,
        completedSteps: [],
        clientRecordId: "en_r8_comp",
        alwaysRun: true,
      },
      async () => createdG.entry
    );
    const attachedG = await attachComposerPdfUri({
      userId: "u1",
      entryId: "en_r8_comp",
      pdfUri: "file:///tmp/composer.pdf",
      completedSteps: baseG.completedSteps,
      clientRecordId: "en_r8_comp",
    });
    assert.equal(attachedG.remoteAccepted, true);
    assert.equal(attachedG.entry.pdfUri, "file:///tmp/composer.pdf");
    assert.equal(gStore.get("en_r8_comp")?.pdfUri, "file:///tmp/composer.pdf");
    assert.equal(gStore.get("en_r8_comp")?.reminder?.notificationId, "nid-comp");
    const gSteps = await fetchRecordCompletedSteps("u1", "business_entry", "en_r8_comp");
    assert.equal(hasCompletedStep(gSteps, SAVE_STEP.BASE_RECORD_CREATED), true);
    assert.equal(hasCompletedStep(gSteps, SAVE_STEP.PDF_URI_SAVED), true);
    assert.equal(gCreates, 1);

    const hStore = new Map<string, BusinessEntry>();
    const hClock = { n: 7000 };
    let hCreates = 0;
    setDiaryRepositoryForTests(
      mockRepo(hStore, hClock, {
        create: async (input) => {
          hCreates += 1;
          hClock.n += 1;
          const entry = {
            ...asEntry(input.clientRecordId!, input.title, "u1"),
            reminder: input.reminder ?? null,
            updatedAt: hClock.n,
          };
          hStore.set(entry.id, entry);
          return entry;
        },
        update: async (input) => {
          if (input.pdfUri) {
            throw new AppError("permission_denied", "Missing or insufficient permissions.");
          }
          return applyCasUpdate(hStore, hClock, "u1", input);
        },
      })
    );
    const createdH = await createEntryWithReminder("u1", noteInput("en_r8_partial"), labels);
    assert.equal(createdH.remoteAccepted, true, "base CREATE remains accepted");
    const baseH = await runRecordStepIfNeeded(
      {
        userId: "u1",
        recordKind: "business_entry",
        recordId: "en_r8_partial",
        step: SAVE_STEP.BASE_RECORD_CREATED,
        completedSteps: [],
        clientRecordId: "en_r8_partial",
        alwaysRun: true,
      },
      async () => createdH.entry
    );
    const attachedH = await attachComposerPdfUri({
      userId: "u1",
      entryId: "en_r8_partial",
      pdfUri: "file:///tmp/composer.pdf",
      completedSteps: baseH.completedSteps,
      clientRecordId: "en_r8_partial",
    });
    assert.equal(attachedH.remoteAccepted, false);
    assert.equal(attachedH.entry.id, "en_r8_partial");
    assert.equal(attachedH.entry.pdfUri, "file:///tmp/composer.pdf");
    assert.equal(hStore.get("en_r8_partial")?.pdfUri ?? null, null);
    const hSteps = await fetchRecordCompletedSteps("u1", "business_entry", "en_r8_partial");
    assert.equal(hasCompletedStep(hSteps, SAVE_STEP.BASE_RECORD_CREATED), true);
    assert.equal(hasCompletedStep(hSteps, SAVE_STEP.PDF_URI_SAVED), false);
    assert.equal(hCreates, 1);
    const hLocal = await localEntriesRepository.getRecord("u1", "en_r8_partial");
    assert.equal(hLocal?.meta.remoteConfirmed, true);
    assert.notEqual(hLocal?.meta.syncStatus, "synced");
  } finally {
    setReminderNotificationsForTests(null);
    setDiaryRepositoryForTests(null);
    sessionSyncGate.unlock();
    syncSessionOwnership.resetForTests();
    __diarySyncTest.resetFlushChain();
    uninstallMemoryLocalDatabase();
  }

  console.log("diary.reminderIntegration.test.ts: ok (mocked DiaryRepository + MemorySqlite)");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
