/**
 * Letterhead save lifecycle: PDF / diary-link failure must not report complete.
 * Boundary: mocked repos + PDF hook + local persistent lock (not emulator quota).
 */
import assert from "node:assert/strict";

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
import { saveLetterheadCreateWithPdf } from "@/services/letterhead/saveWithPdf";
import { setPdfGenerateHookForTests } from "@/services/pdf/pdfGenerateHook";
import { createSaveIdempotencyContext } from "@/services/records/saveIdempotency";
import { readPersistentSaveLock } from "@/services/records/persistentSaveLock";
import { SAVE_STEP, hasCompletedStep } from "@/services/records/saveLockTypes";
import { fetchRecordCompletedSteps } from "@/services/records/recordCompletedSteps";

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

function mockLetterheadRepo(store: Map<string, LetterheadDocument>): LetterheadDocumentRepository {
  return {
    async list() {
      return [...store.values()];
    },
    async get(_userId, id) {
      return store.get(id) ?? null;
    },
    async create(userId, record: LetterheadDocumentCreateInput) {
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
    async getById() {
      return null;
    },
    async list() {
      return [];
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

async function main() {
  installAsyncStoragePolyfill();
  const { default: AsyncStorage } = await import("@react-native-async-storage/async-storage");
  await AsyncStorage.clear();

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
    assert.equal(pdfFailDiaryCreates.n, 0, "diary mirror must not run after PDF failure");
    const pdfLock = await readPersistentSaveLock("u-lh", "lh_pdf_fail");
    assert.notEqual(pdfLock?.status, "done", "incomplete PDF must not mark the save complete");
    assert.equal(
      hasCompletedStep(
        await fetchRecordCompletedSteps("u-lh", "letterhead_doc", "lh_pdf_fail"),
        SAVE_STEP.DIARY_LINK_CREATED
      ),
      false
    );

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
        SAVE_STEP.DIARY_LINK_CREATED
      ),
      false
    );
  } finally {
    setPdfGenerateHookForTests(null);
    setLetterheadDocumentRepositoryForTests(null);
    setDiaryRepositoryForTests(null);
  }

  console.log("saveWithPdf.lifecycle.test.ts: ok");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
