/**
 * Round 9 — composer orchestration: completed-step CAS, PDF resume, session
 * ownership, and truthful write presentation.
 * Boundary: mocked DiaryRepository + MemorySqlite + injected PDF/index hooks.
 * Not device, expo-sqlite, native PDF, or Firestore emulator quota.
 */
import assert from "node:assert/strict";

import { AppError } from "@/domain/errors";
import { DEFAULT_PDF_BRANDING, type UserProfile } from "@/domain/types";
import type { BusinessEntry } from "@/domain/businessEntry";
import type { CreateBusinessEntryInput, DiaryRepository, UpdateBusinessEntryInput } from "@/services/diary/types";
import { setDiaryRepositoryForTests } from "@/services/diary";
import { updateEntryLocalFirst } from "@/services/diary/localFirst";
import { setReminderNotificationsForTests } from "@/services/diary/saveWithReminder";
import {
  saveComposerEntry,
  setComposerSecondaryIndexHookForTests,
} from "@/services/diary/saveComposerEntry";
import { presentComposerWriteAcceptance } from "@/services/diary/composerSaveSteps";
import { setPdfGenerateHookForTests } from "@/services/pdf/pdfGenerateHook";
import { expectedUpdatedAtForRecord } from "@/sync/diaryAck";
import {
  localEntriesRepository,
  readLocalEntryRecordSync,
  writeLocalEntryRowSync,
} from "@/repositories/localEntriesRepository";
import { installMemoryLocalDatabase, uninstallMemoryLocalDatabase } from "@/localDb/testHarness";
import { __diarySyncTest } from "@/sync/syncEngine";
import { sessionSyncGate } from "@/sync/sessionSyncGate";
import { syncSessionOwnership } from "@/sync/syncSessionOwnership";
import { resetDiaryRecordWritesForTests } from "@/sync/diaryRecordWrites";
import { applyAuthSyncIdentityTransition } from "@/sync/syncLockIdentityPolicy";
import { SAVE_STEP, hasCompletedStep } from "@/services/records/saveLockTypes";
import { fetchRecordCompletedSteps } from "@/services/records/recordCompletedSteps";
import { createSaveIdempotencyContext } from "@/services/records/saveIdempotency";

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
      const found = store.get(id) ?? null;
      if (!found) return null;
      return { ...found, pdfUri: null };
    },
    async list() {
      return [...store.values()];
    },
  };
}

const composerUser = {
  uid: "u1",
  ueid: "VYD-2026-TEST01",
  phoneE164: "+919876543210",
  displayName: "T",
  salutation: null,
  businessName: "Site Co",
  workType: null,
  designation: null,
  businessEmail: "a@b.co",
  language: "en" as const,
  profileCompletedAt: 1,
  ueidReleasedAt: 1,
  onboardingIntroSeenAt: 1,
  profileLogo: null,
  pdfBranding: { ...DEFAULT_PDF_BRANDING },
  lastLoginAt: 1,
  previousLoginAt: null,
  lastActiveAt: 1,
  createdAt: 1,
  updatedAt: 1,
  deletedAt: null,
  status: "active" as const,
} satisfies UserProfile;

function composerOptions(clientRecordId: string) {
  return {
    user: composerUser,
    t: (key: string) => key,
    labels: {
      pdfProfileTitle: "p",
      pdfUeid: "u",
      pdfUserName: "n",
      pdfBusiness: "b",
      pdfEntryDate: "d",
      pdfNotes: "notes",
      pdfReminder: "rem",
      pdfDetailsSection: "det",
      pdfHistorySectionTitle: "hist",
      pdfHistoryFirstGenerated: "fg",
      pdfHistoryLastEdited: "le",
      pdfHistoryVersion: "ver",
      pdfHistoryChanges: "ch",
      reminderNotificationTitle: "Reminder: {{title}}",
      fileNameHint: "hint-{{date}}",
    },
    idempotency: createSaveIdempotencyContext({
      userId: "u1",
      recordKind: "business_entry",
      clientRecordId,
    }),
  };
}

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
  setComposerSecondaryIndexHookForTests(async () => undefined);
  setReminderNotificationsForTests({
    scheduleOneShot: async () => "nid-r9",
    cancel: async () => undefined,
  });

  try {
    assert.deepEqual(
      presentComposerWriteAcceptance({
        entry: asEntry("x"),
        remoteAccepted: false,
        failureKind: "permission_denied",
      }),
      { cloudAccepted: false, syncFailureKind: "permission_denied" }
    );
    assert.deepEqual(
      presentComposerWriteAcceptance({ entry: asEntry("x"), remoteAccepted: true }),
      { cloudAccepted: true }
    );

    // 1. Normal save including completed-step metadata — PDF CAS still matches.
    const aStore = new Map<string, BusinessEntry>();
    const aClock = { n: 1000 };
    let aCreates = 0;
    let aPdfUpdates = 0;
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
          if (input.pdfUri) aPdfUpdates += 1;
          return applyCasUpdate(aStore, aClock, "u1", input);
        },
      })
    );
    let aGenerates = 0;
    setPdfGenerateHookForTests(async () => {
      aGenerates += 1;
      return { uri: "file:///tmp/r9-a.pdf", fileName: "a.pdf" };
    });
    const savedA = await saveComposerEntry("u1", noteInput("en_r9_a"), composerOptions("en_r9_a"));
    assert.equal(savedA.cloudAccepted, true);
    assert.equal(aCreates, 1);
    assert.equal(aGenerates, 1);
    assert.equal(aPdfUpdates, 1);
    assert.equal((savedA.failedSecondarySteps ?? []).includes("pdf_uri_saved"), false);
    const stepsA = await fetchRecordCompletedSteps("u1", "business_entry", "en_r9_a");
    assert.equal(hasCompletedStep(stepsA, SAVE_STEP.BASE_RECORD_CREATED), true);
    assert.equal(hasCompletedStep(stepsA, SAVE_STEP.PDF_GENERATED), true);
    assert.equal(hasCompletedStep(stepsA, SAVE_STEP.PDF_URI_SAVED), true);
    assert.equal(aStore.get("en_r9_a")?.pdfUri, "file:///tmp/r9-a.pdf");
    assert.equal(readLocalEntryRecordSync("u1", "en_r9_a")?.entry.pdfUri, "file:///tmp/r9-a.pdf");

    // 2. Genuine intervening remote content edit — CAS must still conflict.
    const bStore = new Map<string, BusinessEntry>();
    const bClock = { n: 2000 };
    let bCreates = 0;
    setDiaryRepositoryForTests(
      mockRepo(bStore, bClock, {
        create: async (input) => {
          bCreates += 1;
          bClock.n += 1;
          const entry = {
            ...asEntry(input.clientRecordId!, input.title, "u1"),
            reminder: input.reminder ?? null,
            updatedAt: bClock.n,
          };
          bStore.set(entry.id, entry);
          return entry;
        },
        update: async (input) => applyCasUpdate(bStore, bClock, "u1", input),
      })
    );
    setPdfGenerateHookForTests(async () => {
      const cur = bStore.get("en_r9_b")!;
      bClock.n = cur.updatedAt + 50;
      bStore.set("en_r9_b", { ...cur, title: "remote edit", updatedAt: bClock.n });
      return { uri: "file:///tmp/r9-b.pdf", fileName: "b.pdf" };
    });
    const savedB = await saveComposerEntry("u1", noteInput("en_r9_b"), composerOptions("en_r9_b"));
    assert.equal(savedB.cloudAccepted, true, "base CREATE remains accepted");
    assert.equal(bCreates, 1);
    assert.equal((savedB.failedSecondarySteps ?? []).includes("pdf_uri_saved"), true);
    assert.equal(bStore.get("en_r9_b")?.title, "remote edit");
    assert.equal(bStore.get("en_r9_b")?.pdfUri ?? null, null);
    assert.equal(readLocalEntryRecordSync("u1", "en_r9_b")?.entry.pdfUri, "file:///tmp/r9-b.pdf");

    // 3. Generated PDF + failed URI + same-ID retry recovers retained local artifact.
    const cStore = new Map<string, BusinessEntry>();
    const cClock = { n: 3000 };
    let cCreates = 0;
    let cPdfUpdates = 0;
    let cFailPdf = true;
    setDiaryRepositoryForTests(
      mockRepo(cStore, cClock, {
        create: async (input) => {
          cCreates += 1;
          cClock.n += 1;
          const entry = {
            ...asEntry(input.clientRecordId!, input.title, "u1"),
            reminder: input.reminder ?? null,
            updatedAt: cClock.n,
          };
          cStore.set(entry.id, entry);
          return entry;
        },
        update: async (input) => {
          if (input.pdfUri) {
            cPdfUpdates += 1;
            if (cFailPdf) {
              throw new AppError("save_failed", "Entry changed remotely.", undefined, {
                remoteChanged: true,
              });
            }
          }
          return applyCasUpdate(cStore, cClock, "u1", input);
        },
      })
    );
    let cGenerates = 0;
    setPdfGenerateHookForTests(async () => {
      cGenerates += 1;
      return { uri: "file:///tmp/r9-c.pdf", fileName: "c.pdf" };
    });
    const firstC = await saveComposerEntry("u1", noteInput("en_r9_c"), composerOptions("en_r9_c"));
    assert.equal(firstC.cloudAccepted, true);
    assert.equal(cCreates, 1);
    assert.equal(cGenerates, 1);
    assert.equal((firstC.failedSecondarySteps ?? []).includes("pdf_uri_saved"), true);
    assert.equal(hasCompletedStep(await fetchRecordCompletedSteps("u1", "business_entry", "en_r9_c"), SAVE_STEP.PDF_GENERATED), true);
    assert.equal(hasCompletedStep(await fetchRecordCompletedSteps("u1", "business_entry", "en_r9_c"), SAVE_STEP.PDF_URI_SAVED), false);
    assert.equal(cStore.get("en_r9_c")?.pdfUri ?? null, null);
    assert.equal(readLocalEntryRecordSync("u1", "en_r9_c")?.entry.pdfUri, "file:///tmp/r9-c.pdf");

    cFailPdf = false;
    const retryC = await saveComposerEntry("u1", noteInput("en_r9_c"), composerOptions("en_r9_c"));
    assert.equal(retryC.cloudAccepted, true);
    assert.equal(cCreates, 1, "retry must not start another billable CREATE");
    assert.equal(cGenerates, 1, "retained local artifact must not regenerate");
    assert.equal(retryC.entry.id, "en_r9_c");
    assert.equal((retryC.failedSecondarySteps ?? []).includes("pdf_uri_saved"), false);
    assert.equal(hasCompletedStep(await fetchRecordCompletedSteps("u1", "business_entry", "en_r9_c"), SAVE_STEP.PDF_URI_SAVED), true);
    assert.equal(cStore.get("en_r9_c")?.pdfUri, "file:///tmp/r9-c.pdf");
    assert.equal(cPdfUpdates >= 2, true);

    // 4. Retry regenerates when the retained artifact is unavailable.
    const dStore = new Map<string, BusinessEntry>();
    const dClock = { n: 4000 };
    let dCreates = 0;
    let dFailPdf = true;
    setDiaryRepositoryForTests(
      mockRepo(dStore, dClock, {
        create: async (input) => {
          dCreates += 1;
          dClock.n += 1;
          const entry = {
            ...asEntry(input.clientRecordId!, input.title, "u1"),
            reminder: input.reminder ?? null,
            updatedAt: dClock.n,
          };
          dStore.set(entry.id, entry);
          return entry;
        },
        update: async (input) => {
          if (input.pdfUri && dFailPdf) {
            throw new AppError("save_failed", "Entry changed remotely.", undefined, {
              remoteChanged: true,
            });
          }
          return applyCasUpdate(dStore, dClock, "u1", input);
        },
      })
    );
    let dGenerates = 0;
    setPdfGenerateHookForTests(async () => {
      dGenerates += 1;
      return { uri: `file:///tmp/r9-d-${dGenerates}.pdf`, fileName: "d.pdf" };
    });
    const firstD = await saveComposerEntry("u1", noteInput("en_r9_d"), composerOptions("en_r9_d"));
    assert.equal((firstD.failedSecondarySteps ?? []).includes("pdf_uri_saved"), true);
    const localD = readLocalEntryRecordSync("u1", "en_r9_d")!;
    writeLocalEntryRowSync(
      { ...localD.entry, pdfUri: null },
      { syncStatus: localD.meta.syncStatus, preserveUnspecifiedMeta: true },
      localD
    );
    assert.equal(readLocalEntryRecordSync("u1", "en_r9_d")?.entry.pdfUri ?? null, null);
    dFailPdf = false;
    const retryD = await saveComposerEntry("u1", noteInput("en_r9_d"), composerOptions("en_r9_d"));
    assert.equal(dCreates, 1);
    assert.equal(dGenerates, 2, "missing artifact must regenerate");
    assert.equal(retryD.entry.id, "en_r9_d");
    assert.equal((retryD.failedSecondarySteps ?? []).includes("pdf_uri_saved"), false);
    assert.equal(dStore.get("en_r9_d")?.pdfUri, "file:///tmp/r9-d-2.pdf");

    // 5a. Deferred PDF after A→B must not dispatch on B's session.
    const eStore = new Map<string, BusinessEntry>();
    const eClock = { n: 5000 };
    let ePdfUpdates = 0;
    setDiaryRepositoryForTests(
      mockRepo(eStore, eClock, {
        create: async (input) => {
          eClock.n += 1;
          const entry = {
            ...asEntry(input.clientRecordId!, input.title, "u1"),
            reminder: input.reminder ?? null,
            updatedAt: eClock.n,
          };
          eStore.set(entry.id, entry);
          return entry;
        },
        update: async (input) => {
          if (input.pdfUri) ePdfUpdates += 1;
          return applyCasUpdate(eStore, eClock, "u1", input);
        },
      })
    );
    const eHold = deferred<{ uri: string; fileName: string }>();
    const eStarted = deferred();
    setPdfGenerateHookForTests(async () => {
      eStarted.resolve();
      return eHold.promise;
    });
    const saveE = saveComposerEntry("u1", noteInput("en_r9_e"), composerOptions("en_r9_e"));
    await eStarted.promise;
    applyAuthSyncIdentityTransition({
      prevStatus: "signed_in",
      nextStatus: "signed_in",
      prevUid: "u1",
      nextUid: "u2",
    });
    eHold.resolve({ uri: "file:///tmp/r9-e.pdf", fileName: "e.pdf" });
    const resultE = await saveE;
    assert.equal(resultE.cloudAccepted, true);
    assert.equal(ePdfUpdates, 0, "A→B must not dispatch PDF UPDATE");
    assert.equal((resultE.failedSecondarySteps ?? []).includes("pdf_uri_saved"), true);
    assert.equal(eStore.get("en_r9_e")?.pdfUri ?? null, null);
    assert.equal(readLocalEntryRecordSync("u1", "en_r9_e")?.entry.pdfUri, "file:///tmp/r9-e.pdf");

    applyAuthSyncIdentityTransition({
      prevStatus: "signed_in",
      nextStatus: "signed_out",
      prevUid: "u2",
      nextUid: null,
    });
    applyAuthSyncIdentityTransition({
      prevStatus: "signed_out",
      nextStatus: "signed_in",
      prevUid: null,
      nextUid: "u1",
    });

    // 5b. Deferred PDF after A→logout→A must not use the later generation.
    const fStore = new Map<string, BusinessEntry>();
    const fClock = { n: 6000 };
    let fPdfUpdates = 0;
    const admittedGen = syncSessionOwnership.current()?.generation;
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
          if (input.pdfUri) fPdfUpdates += 1;
          return applyCasUpdate(fStore, fClock, "u1", input);
        },
      })
    );
    const fHold = deferred<{ uri: string; fileName: string }>();
    const fStarted = deferred();
    setPdfGenerateHookForTests(async () => {
      fStarted.resolve();
      return fHold.promise;
    });
    const saveF = saveComposerEntry("u1", noteInput("en_r9_f"), composerOptions("en_r9_f"));
    await fStarted.promise;
    applyAuthSyncIdentityTransition({
      prevStatus: "signed_in",
      nextStatus: "signed_out",
      prevUid: "u1",
      nextUid: null,
    });
    applyAuthSyncIdentityTransition({
      prevStatus: "signed_out",
      nextStatus: "signed_in",
      prevUid: null,
      nextUid: "u1",
    });
    assert.notEqual(syncSessionOwnership.current()?.generation, admittedGen);
    fHold.resolve({ uri: "file:///tmp/r9-f.pdf", fileName: "f.pdf" });
    const resultF = await saveF;
    assert.equal(resultF.cloudAccepted, true, "accepted CREATE is preserved");
    assert.equal(fPdfUpdates, 0, "later A session must not dispatch the old PDF UPDATE");
    assert.equal((resultF.failedSecondarySteps ?? []).includes("pdf_uri_saved"), true);
    assert.equal(fStore.get("en_r9_f")?.pdfUri ?? null, null);
    assert.equal(readLocalEntryRecordSync("u1", "en_r9_f")?.entry.pdfUri, "file:///tmp/r9-f.pdf");

    // 6. Rejected UPDATE — presentation follows LocalFirstWriteResult, not existence.
    const gStore = new Map<string, BusinessEntry>();
    const gClock = { n: 7000 };
    setDiaryRepositoryForTests(
      mockRepo(gStore, gClock, {
        create: async (input) => {
          gClock.n += 1;
          const entry = {
            ...asEntry(input.clientRecordId!, input.title, "u1"),
            reminder: input.reminder ?? null,
            updatedAt: gClock.n,
          };
          gStore.set(entry.id, entry);
          return entry;
        },
        update: async (input) => {
          if (input.title === "denied edit") {
            throw new AppError("permission_denied", "denied");
          }
          return applyCasUpdate(gStore, gClock, "u1", input);
        },
      })
    );
    await saveComposerEntry("u1", noteInput("en_r9_g", "keep"), composerOptions("en_r9_g"));
    const denied = await updateEntryLocalFirst("u1", { id: "en_r9_g", title: "denied edit" });
    const presented = presentComposerWriteAcceptance(denied);
    assert.equal(denied.remoteAccepted, false);
    assert.equal(presented.cloudAccepted, false);
    assert.equal(presented.syncFailureKind, "permission_denied");
    assert.equal(denied.entry.title, "denied edit", "local recovery content retained");
    const localG = await localEntriesRepository.getRecord("u1", "en_r9_g");
    assert.equal(localG?.meta.remoteConfirmed, true, "existence must not imply UPDATE accepted");
    const inferredFromExistence = !(
      localG?.meta.pendingOp === "create" && !localG.meta.remoteConfirmed
    );
    assert.equal(inferredFromExistence, true);
    assert.notEqual(presented.cloudAccepted, inferredFromExistence);
    assert.equal(expectedUpdatedAtForRecord("u1", "en_r9_g") != null, true);
  } finally {
    setPdfGenerateHookForTests(null);
    setComposerSecondaryIndexHookForTests(null);
    setReminderNotificationsForTests(null);
    setDiaryRepositoryForTests(null);
    sessionSyncGate.unlock();
    syncSessionOwnership.resetForTests();
    __diarySyncTest.resetFlushChain();
    uninstallMemoryLocalDatabase();
  }

  console.log("diary.composerOrchestration.test.ts: ok (saveComposerEntry + injected deps)");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
