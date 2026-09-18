/**
 * Letterhead save lifecycle: PDF / diary-link / session ownership.
 * Boundary: mocked repos + PDF hook + local persistent lock (not emulator quota).
 */
import assert from "node:assert/strict";

import type { Firestore } from "firebase/firestore";
import { AppError } from "@/domain/errors";
import { DEFAULT_PDF_BRANDING, type UserProfile } from "@/domain/types";
import type { BusinessEntry } from "@/domain/businessEntry";
import type { CreateBusinessEntryInput, DiaryRepository } from "@/services/diary/types";
import { setDiaryRepositoryForTests } from "@/services/diary";
import {
  DEFAULT_LETTERHEAD_MARGINS,
  type LetterheadConfig,
  type LetterheadDocument,
  type LetterheadDocumentCreateInput,
  type LetterheadDocumentRepository,
} from "@/services/letterhead/types";
import { setLetterheadDocumentRepositoryForTests } from "@/services/letterhead/documentRepository";
import { updateLetterheadDocumentOnDb } from "@/services/letterhead/documents-firebase";
import { letterheadDocToCloudStorage } from "@/services/pdf/pdfCloudSync";
import {
  resetLetterheadPdfRetentionForTests,
  saveLetterheadCreateWithPdf,
} from "@/services/letterhead/saveWithPdf";
import { letterheadMirrorRecordId } from "@/services/letterhead/letterheadMirrorPolicy";
import { setPdfGenerateHookForTests } from "@/services/pdf/pdfGenerateHook";
import { createSaveIdempotencyContext, isProcessSaveLockHeld } from "@/services/records/saveIdempotency";
import {
  markPersistentLockFailed,
  markPersistentLockInFlight,
  readPersistentSaveLock,
} from "@/services/records/persistentSaveLock";
import { SAVE_STEP, SaveRetryableError, hasCompletedStep } from "@/services/records/saveLockTypes";
import {
  fetchRecordCompletedSteps,
  setCompletedStepWriteObserverForTests,
  type CompletedStepWriteObservation,
} from "@/services/records/recordCompletedSteps";
import { applyAuthSyncIdentityTransition } from "@/sync/syncLockIdentityPolicy";
import { syncSessionOwnership } from "@/sync/syncSessionOwnership";
import { __resetCapabilityGuardForTests } from "@/auth/offlineCapabilityGuard";

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

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const user: UserProfile = {
  uid: "u-lh",
  ueid: "VYD-2026-TEST01",
  phoneE164: "+919876543210",
  displayName: "T",
  salutation: null,
  businessName: "Site Co",
  workType: null,
  designation: null,
  businessEmail: "a@b.co",
  language: "en",
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
  status: "active",
};

const config: LetterheadConfig = {
  userId: "u-lh",
  imageWidth: 100,
  imageHeight: 100,
  margins: { ...DEFAULT_LETTERHEAD_MARGINS },
  createdAt: 1,
  updatedAt: 1,
};

const docInput = {
  title: "Notice",
  date: 1_700_000_000_000,
  subject: "Subject",
  body: "Body",
  closing: "Yours",
  name: "Owner",
  designation: "Proprietor",
  place: "Delhi",
};

function mockLetterheadRepo(
  store: Map<string, LetterheadDocument>,
  opts: {
    throwOnPdfUri?: () => boolean;
    createGate?: () => Promise<void>;
    updateGate?: () => Promise<void>;
    getGate?: () => Promise<void>;
  } = {}
): LetterheadDocumentRepository {
  return {
    async list() {
      return [...store.values()];
    },
    async get(_userId, id) {
      if (opts.getGate) await opts.getGate();
      return store.get(id) ?? null;
    },
    async create(userId, record: LetterheadDocumentCreateInput) {
      if (opts.createGate) await opts.createGate();
      const id = record.clientRecordId ?? `lh_${Date.now()}`;
      const existing = store.get(id);
      if (existing) return existing;
      const now = Date.now();
      const { clientRecordId: _omit, ...rest } = record;
      const doc: LetterheadDocument = {
        ...rest,
        id,
        userId,
        createdAt: now,
        updatedAt: now,
      };
      store.set(id, doc);
      return doc;
    },
    async update(_userId, id, patch) {
      if (opts.updateGate) await opts.updateGate();
      if (patch.pdfUri && opts.throwOnPdfUri?.()) {
        throw new AppError("save_failed", "uri attach boom");
      }
      const cur = store.get(id);
      if (!cur) throw new AppError("not_found", "missing");
      const next = { ...cur, ...patch, updatedAt: Date.now() };
      store.set(id, next);
      return next;
    },
    async remove(_userId, id) {
      store.delete(id);
    },
  };
}

function repoWithProductionUpdate(
  store: Map<string, LetterheadDocument>,
  opts: {
    throwOnPdfUri?: () => boolean;
    createGate?: () => Promise<void>;
    getGate?: () => Promise<void>;
    afterGetDoc?: () => Promise<void>;
    onSetDoc?: (payload: Record<string, unknown>) => void;
  } = {}
): LetterheadDocumentRepository {
  const base = mockLetterheadRepo(store, opts);
  return {
    ...base,
    async update(userId, id, patch, session) {
      if (patch.pdfUri && opts.throwOnPdfUri?.()) {
        throw new AppError("save_failed", "uri attach boom");
      }
      return updateLetterheadDocumentOnDb({} as Firestore, userId, id, patch, session, {
        docRef: { path: `users/${userId}/letterheadDocs/${id}` } as never,
        getDoc: async () => {
          const cur = store.get(id);
          const snap = {
            exists: () => Boolean(cur),
            id,
            data: () => (cur ? letterheadDocToCloudStorage(cur) : undefined),
          };
          if (opts.afterGetDoc) await opts.afterGetDoc();
          return snap;
        },
        setDoc: async (_ref, payload) => {
          opts.onSetDoc?.(payload as Record<string, unknown>);
          const cur = store.get(id);
          if (!cur) throw new AppError("not_found", "missing");
          store.set(id, {
            ...cur,
            ...(payload as object),
            pdfUri: typeof patch.pdfUri === "string" ? patch.pdfUri : cur.pdfUri,
            updatedAt: Date.now(),
          } as LetterheadDocument);
        },
      });
    },
  };
}

function mockDiaryRepo(opts: { throwOnCreate?: boolean; creates?: { n: number } }): DiaryRepository {
  const store = new Map<string, BusinessEntry>();
  return {
    async create(userId, input: CreateBusinessEntryInput) {
      opts.creates && (opts.creates.n += 1);
      if (opts.throwOnCreate) throw new AppError("quota_exhausted", "Monthly record limit reached.");
      const id = input.clientRecordId ?? `en_${Date.now()}`;
      const entry = {
        id,
        userId,
        ueid: input.ueid,
        entryType: input.entryType,
        title: input.title,
        entryDate: input.entryDate,
        notes: null,
        reminder: null,
        location: input.location ?? null,
        attachments: [],
        payload: input.payload,
        source: input.source ?? "composer",
        status: "active" as const,
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
      store.set(id, entry);
      return entry;
    },
    async createWithOutcome(userId, input) {
      const record = await this.create(userId, input);
      return { record, outcome: "created" as const };
    },
    async update() {
      throw new Error("unused");
    },
    async hardDelete() {},
    async softDelete() {},
    async getById(_userId, id) {
      return store.get(id) ?? null;
    },
    async list() {
      return [...store.values()];
    },
  };
}

function saveParams(clientRecordId: string) {
  return {
    user,
    config,
    docInput,
    title: "Notice",
    createPayload: {
      ueid: user.ueid,
      templateRefUpdatedAt: config.updatedAt,
      pdfUri: null,
      saved: true,
    },
    idempotency: createSaveIdempotencyContext({
      userId: "u-lh",
      recordKind: "letterhead_doc" as const,
      clientRecordId,
    }),
    locale: "en-IN" as const,
    t: (key: string) => key,
    diaryClientId: `${clientRecordId}_matter`,
    route: "/(app)/letterhead/create",
  };
}

function beginOwner(uid = "u-lh") {
  applyAuthSyncIdentityTransition({
    prevStatus: "signed_out",
    nextStatus: "signed_in",
    prevUid: null,
    nextUid: uid,
  });
}

async function main() {
  installAsyncStoragePolyfill();
  const { default: AsyncStorage } = await import("@react-native-async-storage/async-storage");
  await AsyncStorage.clear();
  __resetCapabilityGuardForTests();
  syncSessionOwnership.resetForTests();
  resetLetterheadPdfRetentionForTests();
  beginOwner();
  const stepWrites: CompletedStepWriteObservation[] = [];
  setCompletedStepWriteObserverForTests((observation) => {
    stepWrites.push(observation);
  });

  try {
    const pdfFailStore = new Map<string, LetterheadDocument>();
    const pdfFailDiaryCreates = { n: 0 };
    setLetterheadDocumentRepositoryForTests(mockLetterheadRepo(pdfFailStore));
    setDiaryRepositoryForTests(mockDiaryRepo({ throwOnCreate: false, creates: pdfFailDiaryCreates }));
    setPdfGenerateHookForTests(async () => {
      throw new Error("pdf boom");
    });
    let pdfFailed = false;
    try {
      await saveLetterheadCreateWithPdf("u-lh", saveParams("lh_pdf_fail"));
    } catch {
      pdfFailed = true;
    }
    assert.equal(pdfFailed, true);
    assert.equal(pdfFailStore.has("lh_pdf_fail"), true, "base letterhead CREATE is retained");
    assert.equal(pdfFailDiaryCreates.n, 0, "diary mirror must not run after PDF generation failure");
    const pdfLock = await readPersistentSaveLock("u-lh", "lh_pdf_fail");
    assert.notEqual(pdfLock?.status, "done", "incomplete PDF must not mark the save complete");
    assert.equal(
      hasCompletedStep(
        await fetchRecordCompletedSteps("u-lh", "letterhead_doc", "lh_pdf_fail"),
        SAVE_STEP.DIARY_LINK_CREATED
      ),
      false
    );
    assert.equal(
      hasCompletedStep(
        await fetchRecordCompletedSteps("u-lh", "letterhead_doc", "lh_pdf_fail"),
        SAVE_STEP.PDF_URI_SAVED
      ),
      false
    );

    resetLetterheadPdfRetentionForTests();
    const uriFailStore = new Map<string, LetterheadDocument>();
    const uriFailDiary = { n: 0 };
    let uriFailsRemaining = 1;
    let uriGenerates = 0;
    setLetterheadDocumentRepositoryForTests(
      mockLetterheadRepo(uriFailStore, { throwOnPdfUri: () => uriFailsRemaining > 0 })
    );
    setDiaryRepositoryForTests(mockDiaryRepo({ creates: uriFailDiary }));
    setPdfGenerateHookForTests(async () => {
      uriGenerates += 1;
      return { uri: `file:///tmp/lh-uri-${uriGenerates}.pdf`, fileName: "lh.pdf" };
    });
    let uriFailed = false;
    try {
      await saveLetterheadCreateWithPdf("u-lh", saveParams("lh_uri_fail"));
    } catch {
      uriFailed = true;
    }
    assert.equal(uriFailed, true);
    assert.equal(uriFailStore.has("lh_uri_fail"), true);
    assert.equal(uriFailStore.get("lh_uri_fail")?.pdfUri ?? null, null, "failed attach must not persist URI");
    assert.equal(uriFailDiary.n, 0, "diary mirror must not run after URI-attachment failure");
    assert.equal(
      hasCompletedStep(
        await fetchRecordCompletedSteps("u-lh", "letterhead_doc", "lh_uri_fail"),
        SAVE_STEP.PDF_GENERATED
      ),
      true
    );
    assert.equal(
      hasCompletedStep(
        await fetchRecordCompletedSteps("u-lh", "letterhead_doc", "lh_uri_fail"),
        SAVE_STEP.PDF_URI_SAVED
      ),
      false
    );

    uriFailsRemaining = 0;
    const uriRetry = await saveLetterheadCreateWithPdf("u-lh", saveParams("lh_uri_fail"));
    assert.equal(uriRetry.doc.id, "lh_uri_fail");
    assert.equal(uriRetry.pdfUri, "file:///tmp/lh-uri-1.pdf");
    assert.equal(uriGenerates, 1, "retained artifact retry must not regenerate");
    assert.equal(uriFailStore.get("lh_uri_fail")?.pdfUri, "file:///tmp/lh-uri-1.pdf");
    assert.equal(uriFailDiary.n, 1);
    assert.equal(letterheadMirrorRecordId("lh_uri_fail"), "lh_uri_fail:matter");
    assert.equal(
      hasCompletedStep(
        await fetchRecordCompletedSteps("u-lh", "letterhead_doc", "lh_uri_fail"),
        SAVE_STEP.PDF_URI_SAVED
      ),
      true
    );

    resetLetterheadPdfRetentionForTests();
    const missingStore = new Map<string, LetterheadDocument>();
    const missingDiary = { n: 0 };
    let missingFails = 1;
    let missingGenerates = 0;
    setLetterheadDocumentRepositoryForTests(
      mockLetterheadRepo(missingStore, { throwOnPdfUri: () => missingFails > 0 })
    );
    setDiaryRepositoryForTests(mockDiaryRepo({ creates: missingDiary }));
    setPdfGenerateHookForTests(async () => {
      missingGenerates += 1;
      return { uri: `file:///tmp/lh-miss-${missingGenerates}.pdf`, fileName: "lh.pdf" };
    });
    try {
      await saveLetterheadCreateWithPdf("u-lh", saveParams("lh_uri_missing"));
    } catch {
      /* first pass URI attach fails */
    }
    assert.equal(missingGenerates, 1);
    resetLetterheadPdfRetentionForTests();
    missingFails = 0;
    const missingRetry = await saveLetterheadCreateWithPdf("u-lh", saveParams("lh_uri_missing"));
    assert.equal(missingGenerates, 2, "missing artifact must regenerate");
    assert.equal(missingRetry.pdfUri, "file:///tmp/lh-miss-2.pdf");
    assert.equal(missingRetry.doc.id, "lh_uri_missing");
    assert.equal(missingDiary.n, 1);

    const diaryFailStore = new Map<string, LetterheadDocument>();
    const diaryFailCreates = { n: 0 };
    setLetterheadDocumentRepositoryForTests(mockLetterheadRepo(diaryFailStore));
    setDiaryRepositoryForTests(mockDiaryRepo({ throwOnCreate: true, creates: diaryFailCreates }));
    setPdfGenerateHookForTests(async () => ({ uri: "file:///tmp/lh.pdf", fileName: "lh.pdf" }));
    let diaryFailed = false;
    try {
      await saveLetterheadCreateWithPdf("u-lh", saveParams("lh_diary_fail"));
    } catch (e) {
      diaryFailed = e instanceof AppError && e.code === "quota_exhausted";
    }
    assert.equal(diaryFailed, true);
    assert.equal(diaryFailStore.get("lh_diary_fail")?.pdfUri, "file:///tmp/lh.pdf");
    assert.equal(diaryFailCreates.n, 1);
    const diaryLock = await readPersistentSaveLock("u-lh", "lh_diary_fail");
    assert.notEqual(diaryLock?.status, "done", "diary-link failure must not mark the save complete");
    assert.equal(
      hasCompletedStep(
        await fetchRecordCompletedSteps("u-lh", "letterhead_doc", "lh_diary_fail"),
        SAVE_STEP.BASE_RECORD_CREATED
      ),
      true
    );
    assert.equal(
      hasCompletedStep(
        await fetchRecordCompletedSteps("u-lh", "letterhead_doc", "lh_diary_fail"),
        SAVE_STEP.PDF_URI_SAVED
      ),
      true
    );
    assert.equal(
      hasCompletedStep(
        await fetchRecordCompletedSteps("u-lh", "letterhead_doc", "lh_diary_fail"),
        SAVE_STEP.DIARY_LINK_CREATED
      ),
      false
    );

    setDiaryRepositoryForTests(mockDiaryRepo({ throwOnCreate: false, creates: diaryFailCreates }));
    const diaryRecover = await saveLetterheadCreateWithPdf("u-lh", saveParams("lh_diary_fail"));
    assert.equal(diaryRecover.doc.id, "lh_diary_fail");
    assert.equal(diaryFailCreates.n, 2, "same-ID recovery retries only the missing diary link");
    assert.equal(letterheadMirrorRecordId(diaryRecover.doc.id), "lh_diary_fail:matter");
    assert.equal(
      hasCompletedStep(
        await fetchRecordCompletedSteps("u-lh", "letterhead_doc", "lh_diary_fail"),
        SAVE_STEP.DIARY_LINK_CREATED
      ),
      true
    );

    const eStore = new Map<string, LetterheadDocument>();
    const eDiary = { n: 0 };
    const eHold = deferred<{ uri: string; fileName: string }>();
    const eStarted = deferred();
    setLetterheadDocumentRepositoryForTests(mockLetterheadRepo(eStore));
    setDiaryRepositoryForTests(mockDiaryRepo({ creates: eDiary }));
    setPdfGenerateHookForTests(async () => {
      eStarted.resolve();
      return eHold.promise;
    });
    const saveE = saveLetterheadCreateWithPdf("u-lh", saveParams("lh_pdf_ab"));
    await eStarted.promise;
    applyAuthSyncIdentityTransition({
      prevStatus: "signed_in",
      nextStatus: "signed_in",
      prevUid: "u-lh",
      nextUid: "u2",
    });
    eHold.resolve({ uri: "file:///tmp/lh-ab.pdf", fileName: "lh.pdf" });
    await assert.rejects(
      saveE,
      (err: unknown) => err instanceof SaveRetryableError && err.failureCode === "session_retired"
    );
    assert.equal(eStore.has("lh_pdf_ab"), true, "accepted parent CREATE is preserved");
    assert.equal(eDiary.n, 0, "A→B must not create a mirror");
    assert.equal(eStore.get("lh_pdf_ab")?.pdfUri ?? null, null, "A→B must not attach URI");
    assert.equal(
      hasCompletedStep(await fetchRecordCompletedSteps("u-lh", "letterhead_doc", "lh_pdf_ab"), SAVE_STEP.PDF_GENERATED),
      false,
      "retired A→B must not append PDF_GENERATED"
    );
    assert.equal(
      hasCompletedStep(await fetchRecordCompletedSteps("u-lh", "letterhead_doc", "lh_pdf_ab"), SAVE_STEP.PDF_URI_SAVED),
      false
    );
    assert.equal(isProcessSaveLockHeld(saveParams("lh_pdf_ab").idempotency.idempotencyKey), false);
    const lockAfterAb = await readPersistentSaveLock("u-lh", "lh_pdf_ab");
    assert.notEqual(lockAfterAb?.status, "done", "retired A→B must not publish success");

    applyAuthSyncIdentityTransition({
      prevStatus: "signed_in",
      nextStatus: "signed_out",
      prevUid: "u2",
      nextUid: null,
    });
    beginOwner();
    setPdfGenerateHookForTests(async () => ({ uri: "file:///tmp/lh-ab-recover.pdf", fileName: "lh.pdf" }));
    const recoverAb = await saveLetterheadCreateWithPdf("u-lh", saveParams("lh_pdf_ab"));
    assert.equal(recoverAb.doc.id, "lh_pdf_ab");
    assert.equal(eDiary.n, 1);
    assert.equal(recoverAb.pdfUri.includes("lh-ab"), true);

    const fStore = new Map<string, LetterheadDocument>();
    const fDiary = { n: 0 };
    const fHold = deferred<{ uri: string; fileName: string }>();
    const fStarted = deferred();
    setLetterheadDocumentRepositoryForTests(mockLetterheadRepo(fStore));
    setDiaryRepositoryForTests(mockDiaryRepo({ creates: fDiary }));
    beginOwner();
    setPdfGenerateHookForTests(async () => {
      fStarted.resolve();
      return fHold.promise;
    });
    const saveF = saveLetterheadCreateWithPdf("u-lh", saveParams("lh_pdf_relogin"));
    await fStarted.promise;
    applyAuthSyncIdentityTransition({
      prevStatus: "signed_in",
      nextStatus: "signed_out",
      prevUid: "u-lh",
      nextUid: null,
    });
    applyAuthSyncIdentityTransition({
      prevStatus: "signed_out",
      nextStatus: "signed_in",
      prevUid: null,
      nextUid: "u-lh",
    });
    fHold.resolve({ uri: "file:///tmp/lh-relogin.pdf", fileName: "lh.pdf" });
    await assert.rejects(
      saveF,
      (err: unknown) => err instanceof SaveRetryableError && err.failureCode === "session_retired"
    );
    assert.equal(fDiary.n, 0, "A→logout→A must not create a mirror");
    assert.equal(
      hasCompletedStep(
        await fetchRecordCompletedSteps("u-lh", "letterhead_doc", "lh_pdf_relogin"),
        SAVE_STEP.PDF_GENERATED
      ),
      false
    );
    assert.notEqual((await readPersistentSaveLock("u-lh", "lh_pdf_relogin"))?.status, "done");

    setPdfGenerateHookForTests(async () => ({ uri: "file:///tmp/lh-relogin-recover.pdf", fileName: "lh.pdf" }));
    const recoverF = await saveLetterheadCreateWithPdf("u-lh", saveParams("lh_pdf_relogin"));
    assert.equal(recoverF.doc.id, "lh_pdf_relogin");
    assert.equal(fDiary.n, 1);

    const gStore = new Map<string, LetterheadDocument>();
    const gDiary = { n: 0 };
    const gHold = deferred();
    const gStarted = deferred();
    beginOwner();
    setLetterheadDocumentRepositoryForTests(
      mockLetterheadRepo(gStore, {
        createGate: async () => {
          gStarted.resolve();
          await gHold.promise;
        },
      })
    );
    setDiaryRepositoryForTests(mockDiaryRepo({ creates: gDiary }));
    setPdfGenerateHookForTests(async () => ({ uri: "file:///tmp/lh-retire.pdf", fileName: "lh.pdf" }));
    const saveG = saveLetterheadCreateWithPdf("u-lh", saveParams("lh_retire_create"));
    await gStarted.promise;
    applyAuthSyncIdentityTransition({
      prevStatus: "signed_in",
      nextStatus: "signed_out",
      prevUid: "u-lh",
      nextUid: null,
    });
    gHold.resolve();
    await assert.rejects(
      saveG,
      (err: unknown) => err instanceof SaveRetryableError && err.failureCode === "session_retired"
    );
    assert.equal(gStore.has("lh_retire_create"), true, "in-flight CREATE remains accepted");
    assert.equal(gDiary.n, 0, "retirement during repository await must not issue a mirror");
    assert.equal(
      hasCompletedStep(
        await fetchRecordCompletedSteps("u-lh", "letterhead_doc", "lh_retire_create"),
        SAVE_STEP.BASE_RECORD_CREATED
      ),
      false,
      "retired session must not append completed steps"
    );

    beginOwner();
    const oldLease = (await readPersistentSaveLock("u-lh", "lh_retire_create"))?.startedAt ?? 0;
    const replacement = await markPersistentLockInFlight({
      userId: "u-lh",
      clientRecordId: "lh_retire_create",
      idempotencyKey: "replacement-owner",
      recordKind: "letterhead_doc",
    });
    await markPersistentLockFailed("u-lh", "lh_retire_create", "session_retired", oldLease);
    const afterStale = await readPersistentSaveLock("u-lh", "lh_retire_create");
    assert.equal(afterStale?.startedAt, replacement.startedAt, "stale cleanup cannot release a newer owner");
    assert.notEqual(stepWrites.length, 0);

    resetLetterheadPdfRetentionForTests();
    const prodStore = new Map<string, LetterheadDocument>();
    const prodDiary = { n: 0 };
    const prodHold = deferred();
    const prodStarted = deferred();
    const prodSetDocs: Record<string, unknown>[] = [];
    let pauseProdGet = true;
    beginOwner();
    setLetterheadDocumentRepositoryForTests(
      repoWithProductionUpdate(prodStore, {
        afterGetDoc: async () => {
          if (!pauseProdGet) return;
          prodStarted.resolve();
          await prodHold.promise;
        },
        onSetDoc: (payload) => {
          prodSetDocs.push(payload);
        },
      })
    );
    setDiaryRepositoryForTests(mockDiaryRepo({ creates: prodDiary }));
    setPdfGenerateHookForTests(async () => ({ uri: "file:///tmp/lh-prod-ab.pdf", fileName: "lh.pdf" }));
    const saveProdAb = saveLetterheadCreateWithPdf("u-lh", saveParams("lh_prod_update_ab"));
    await prodStarted.promise;
    applyAuthSyncIdentityTransition({
      prevStatus: "signed_in",
      nextStatus: "signed_in",
      prevUid: "u-lh",
      nextUid: "u2",
    });
    prodHold.resolve();
    await assert.rejects(
      saveProdAb,
      (err: unknown) => err instanceof SaveRetryableError && err.failureCode === "session_retired"
    );
    assert.equal(prodSetDocs.length, 0, "retired A→B must not newly issue setDoc");
    assert.equal(prodDiary.n, 0, "retired A→B must not create a mirror");
    assert.equal(
      hasCompletedStep(
        await fetchRecordCompletedSteps("u-lh", "letterhead_doc", "lh_prod_update_ab"),
        SAVE_STEP.PDF_URI_SAVED
      ),
      false,
      "retired A→B must not complete PDF_URI_SAVED"
    );
    assert.equal(
      hasCompletedStep(
        await fetchRecordCompletedSteps("u-lh", "letterhead_doc", "lh_prod_update_ab"),
        SAVE_STEP.DIARY_LINK_CREATED
      ),
      false
    );
    assert.equal(isProcessSaveLockHeld(saveParams("lh_prod_update_ab").idempotency.idempotencyKey), false);
    assert.notEqual((await readPersistentSaveLock("u-lh", "lh_prod_update_ab"))?.status, "done");

    applyAuthSyncIdentityTransition({
      prevStatus: "signed_in",
      nextStatus: "signed_out",
      prevUid: "u2",
      nextUid: null,
    });
    beginOwner();
    pauseProdGet = false;
    const recoverProdAb = await saveLetterheadCreateWithPdf("u-lh", saveParams("lh_prod_update_ab"));
    assert.equal(recoverProdAb.doc.id, "lh_prod_update_ab");
    assert.equal(prodDiary.n, 1);
    assert.equal(prodSetDocs.length >= 1, true);
    assert.equal(prodSetDocs.every((payload) => payload.pdfUri === null), true);

    resetLetterheadPdfRetentionForTests();
    const reloginStore = new Map<string, LetterheadDocument>();
    const reloginDiary = { n: 0 };
    const reloginHold = deferred();
    const reloginStarted = deferred();
    const reloginSetDocs: Record<string, unknown>[] = [];
    let pauseReloginGet = true;
    beginOwner();
    setLetterheadDocumentRepositoryForTests(
      repoWithProductionUpdate(reloginStore, {
        afterGetDoc: async () => {
          if (!pauseReloginGet) return;
          reloginStarted.resolve();
          await reloginHold.promise;
        },
        onSetDoc: (payload) => {
          reloginSetDocs.push(payload);
        },
      })
    );
    setDiaryRepositoryForTests(mockDiaryRepo({ creates: reloginDiary }));
    setPdfGenerateHookForTests(async () => ({ uri: "file:///tmp/lh-prod-relogin.pdf", fileName: "lh.pdf" }));
    const saveProdRelogin = saveLetterheadCreateWithPdf("u-lh", saveParams("lh_prod_update_relogin"));
    await reloginStarted.promise;
    applyAuthSyncIdentityTransition({
      prevStatus: "signed_in",
      nextStatus: "signed_out",
      prevUid: "u-lh",
      nextUid: null,
    });
    applyAuthSyncIdentityTransition({
      prevStatus: "signed_out",
      nextStatus: "signed_in",
      prevUid: null,
      nextUid: "u-lh",
    });
    reloginHold.resolve();
    await assert.rejects(
      saveProdRelogin,
      (err: unknown) => err instanceof SaveRetryableError && err.failureCode === "session_retired"
    );
    assert.equal(reloginSetDocs.length, 0, "retired A→logout→A must not newly issue setDoc");
    assert.equal(reloginDiary.n, 0);
    assert.equal(
      hasCompletedStep(
        await fetchRecordCompletedSteps("u-lh", "letterhead_doc", "lh_prod_update_relogin"),
        SAVE_STEP.PDF_URI_SAVED
      ),
      false
    );
    assert.equal(isProcessSaveLockHeld(saveParams("lh_prod_update_relogin").idempotency.idempotencyKey), false);

    pauseReloginGet = false;
    const recoverProdRelogin = await saveLetterheadCreateWithPdf("u-lh", saveParams("lh_prod_update_relogin"));
    assert.equal(recoverProdRelogin.doc.id, "lh_prod_update_relogin");
    assert.equal(reloginDiary.n, 1);
    const oldProdLease = (await readPersistentSaveLock("u-lh", "lh_prod_update_relogin"))?.startedAt ?? 0;
    const newerOwner = await markPersistentLockInFlight({
      userId: "u-lh",
      clientRecordId: "lh_prod_update_relogin",
      idempotencyKey: "replacement-prod-owner",
      recordKind: "letterhead_doc",
    });
    await markPersistentLockFailed("u-lh", "lh_prod_update_relogin", "session_retired", oldProdLease);
    const afterNewer = await readPersistentSaveLock("u-lh", "lh_prod_update_relogin");
    assert.equal(afterNewer?.startedAt, newerOwner.startedAt, "stale cleanup cannot release a newer owner");
  } finally {
    setPdfGenerateHookForTests(null);
    setLetterheadDocumentRepositoryForTests(null);
    setDiaryRepositoryForTests(null);
    setCompletedStepWriteObserverForTests(null);
    resetLetterheadPdfRetentionForTests();
  }

  console.log("saveWithPdf.lifecycle.test.ts: ok");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
