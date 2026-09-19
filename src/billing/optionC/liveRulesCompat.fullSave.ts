/**
 * LIVE_RULES_COMPAT production save callers. Injected PDF/effects; real
 * Firestore atomic CREATE, coordinator, and completed steps.
 */
import { doc, getDoc, setDoc, type Firestore } from "firebase/firestore";

import { DEFAULT_PDF_BRANDING, type UserProfile } from "@/domain/types";
import { createEntryAtomicDetailed, entryFromFirestoreDoc } from "@/services/diary/atomicCreate";
import { updateDiaryEntryOnDb } from "@/services/diary/firebaseUpdate";
import { setDiaryRepositoryForTests, type DiaryRepository } from "@/services/diary";
import {
  saveComposerEntry,
  setComposerSecondaryIndexHookForTests,
} from "@/services/diary/saveComposerEntry";
import { setReminderNotificationsForTests } from "@/services/diary/saveWithReminder";
import { createLetterheadDocumentAtomic } from "@/services/letterhead/atomicCreate";
import { updateLetterheadDocumentOnDb } from "@/services/letterhead/documents-firebase";
import { setLetterheadDocumentRepositoryForTests } from "@/services/letterhead/documentRepository";
import { saveLetterheadCreateWithPdf } from "@/services/letterhead/saveWithPdf";
import { letterheadMirrorRecordId } from "@/services/letterhead/letterheadMirrorPolicy";
import { parseLetterheadDocument } from "@/services/letterhead/documentParse";
import { createPurchaseOrderAtomic } from "@/services/purchaseOrder/atomicCreate";
import { setPurchaseOrderRepositoryForTests } from "@/services/purchaseOrder";
import { setPurchaseOrderSaveEffectsForTests, savePurchaseOrderWithPdf } from "@/services/purchaseOrder/saveWithPdf";
import type { PurchaseOrderRepository } from "@/services/purchaseOrder/types";
import { createCustomerCreditAtomic } from "@/services/customerCredit/atomicCreate";
import { setCustomerCreditRepositoryForTests } from "@/services/customerCredit";
import { setCustomerCreditSaveEffectsForTests, saveCustomerCreditWithPdf } from "@/services/customerCredit/saveWithPdf";
import type { CustomerCreditRepository } from "@/services/customerCredit/types";
import { createProfessionalPackAtomic, packFromFirestoreDoc } from "@/services/professionalPack/atomicCreate";
import { setProfessionalPackRepositoryForTests } from "@/services/professionalPack";
import { saveProfessionalPackWithPdf, setProfessionalPackSaveEffectsForTests } from "@/services/professionalPack/saveWithPdf";
import type { ProfessionalPackRepository } from "@/services/professionalPack/types";
import { setPdfGenerateHookForTests } from "@/services/pdf/pdfGenerateHook";
import { createSaveIdempotencyContext } from "@/services/records/saveIdempotency";
import { fetchRecordCompletedSteps } from "@/services/records/recordCompletedSteps";
import { SAVE_STEP, hasCompletedStep } from "@/services/records/saveLockTypes";
import { sessionSyncGate } from "@/sync/sessionSyncGate";
import { captureAdmissionToken } from "@/sync/syncSessionOwnership";
import { installMemoryLocalDatabase, uninstallMemoryLocalDatabase } from "@/localDb/testHarness";
import type { PurchaseOrder } from "@/domain/purchaseOrder";
import type { CustomerCreditRecord } from "@/domain/customerCredit";
import {
  DEFAULT_LETTERHEAD_MARGINS,
  type LetterheadConfig,
  type LetterheadDocumentRepository,
} from "@/services/letterhead/types";

function unused(): never {
  throw new Error("unused live-rules repo method");
}

export function compatUser(uid: string): UserProfile {
  return {
    uid,
    ueid: "VYD-2026-BILL01",
    phoneE164: "+919999999991",
    displayName: "Compat User",
    salutation: null,
    businessName: "Compat Co",
    workType: null,
    designation: null,
    businessEmail: "compat@example.com",
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
}

const t = (key: string) => key;

function firestoreDiaryRepo(db: Firestore): DiaryRepository {
  return {
    async create(userId, input, session) {
      return (await this.createWithOutcome(userId, input, session)).record;
    },
    async createWithOutcome(userId, input, session) {
      return createEntryAtomicDetailed(
        db,
        userId,
        input,
        session === undefined ? undefined : { session }
      );
    },
    async update(userId, input) {
      return updateDiaryEntryOnDb(db, userId, input, { cancelNotification: async () => undefined });
    },
    async hardDelete() {},
    async softDelete() {},
    async getById(userId, id) {
      const snap = await getDoc(doc(db, "users", userId, "entries", id));
      if (!snap.exists()) return null;
      return entryFromFirestoreDoc(snap.id, snap.data() as Record<string, unknown>);
    },
    async list() {
      return [];
    },
  };
}

function firestoreLetterheadRepo(db: Firestore): LetterheadDocumentRepository {
  return {
    async list() {
      return [];
    },
    async get(userId, id) {
      const snap = await getDoc(doc(db, "users", userId, "letterheadDocs", id));
      if (!snap.exists()) return null;
      return parseLetterheadDocument(snap.id, snap.data() as Record<string, unknown>, userId);
    },
    async create(userId, record, session) {
      return createLetterheadDocumentAtomic(
        db,
        userId,
        record,
        session === undefined ? undefined : { session }
      );
    },
    async update(userId, id, patch, session) {
      return updateLetterheadDocumentOnDb(db, userId, id, patch, session);
    },
    async remove() {},
  };
}

export async function installCompatSaveSeams(input: {
  db: Firestore;
  parsePo: (id: string, raw: Record<string, unknown>) => PurchaseOrder;
  parseCredit: (id: string, raw: Record<string, unknown>) => CustomerCreditRecord;
}): Promise<void> {
  installMemoryLocalDatabase();
  sessionSyncGate.unlock();
  setReminderNotificationsForTests({
    scheduleOneShot: async () => "nid-compat",
    cancel: async () => undefined,
  });
  setComposerSecondaryIndexHookForTests(async () => undefined);
  setPurchaseOrderSaveEffectsForTests(async () => undefined);
  setCustomerCreditSaveEffectsForTests(async () => undefined);
  setProfessionalPackSaveEffectsForTests(async () => undefined);
  setPdfGenerateHookForTests(async () => ({ uri: "file:///tmp/compat.pdf", fileName: "compat.pdf" }));
  setDiaryRepositoryForTests(firestoreDiaryRepo(input.db));
  setLetterheadDocumentRepositoryForTests(firestoreLetterheadRepo(input.db));

  const poRepo: PurchaseOrderRepository = {
    allocateSerial: async () => 1,
    create: (userId, createInput) =>
      createPurchaseOrderAtomic(input.db, userId, createInput, input.parsePo, {
        session: captureAdmissionToken(),
      }),
    update: async (userId, updateInput) => {
      const ref = doc(input.db, "users", userId, "purchaseOrders", updateInput.id);
      const snap = await getDoc(ref);
      if (!snap.exists()) unused();
      const existing = input.parsePo(snap.id, snap.data() as Record<string, unknown>);
      const next = { ...existing, pdfUri: updateInput.pdfUri ?? existing.pdfUri };
      await setDoc(ref, { pdfUri: next.pdfUri }, { merge: true });
      return next;
    },
    cancel: async () => unused(),
    remove: async () => unused(),
    getById: async (userId, id) => {
      const snap = await getDoc(doc(input.db, "users", userId, "purchaseOrders", id));
      if (!snap.exists()) return null;
      return input.parsePo(snap.id, snap.data() as Record<string, unknown>);
    },
    list: async () => [],
  };
  setPurchaseOrderRepositoryForTests(poRepo);

  const ccRepo: CustomerCreditRepository = {
    allocateSerial: async () => 1,
    create: (userId, createInput) =>
      createCustomerCreditAtomic(input.db, userId, createInput, input.parseCredit, {
        session: captureAdmissionToken(),
      }),
    update: async (userId, updateInput) => {
      const ref = doc(input.db, "users", userId, "customerCreditRecords", updateInput.id);
      const snap = await getDoc(ref);
      if (!snap.exists()) unused();
      const existing = input.parseCredit(snap.id, snap.data() as Record<string, unknown>);
      const next = { ...existing, pdfUri: updateInput.pdfUri ?? existing.pdfUri };
      await setDoc(ref, { pdfUri: next.pdfUri }, { merge: true });
      return next;
    },
    addPayment: async () => unused(),
    removePayment: async () => unused(),
    setStatus: async () => unused(),
    closeFullyPaid: async () => unused(),
    setReminder: async () => unused(),
    remove: async () => unused(),
    getById: async (userId, id) => {
      const snap = await getDoc(doc(input.db, "users", userId, "customerCreditRecords", id));
      if (!snap.exists()) return null;
      return input.parseCredit(snap.id, snap.data() as Record<string, unknown>);
    },
    list: async () => [],
  };
  setCustomerCreditRepositoryForTests(ccRepo);

  const packRepo: ProfessionalPackRepository = {
    create: (userId, createInput) =>
      createProfessionalPackAtomic(input.db, userId, createInput, {
        session: captureAdmissionToken(),
      }),
    update: async (userId, updateInput) => {
      const ref = doc(input.db, "users", userId, "professionalPacks", updateInput.id);
      const snap = await getDoc(ref);
      if (!snap.exists()) unused();
      const existing = packFromFirestoreDoc(snap.id, snap.data() as Record<string, unknown>)!;
      const next = { ...existing, pdfUri: updateInput.pdfUri ?? existing.pdfUri };
      await setDoc(ref, { pdfUri: next.pdfUri }, { merge: true });
      return next;
    },
    hardDelete: async () => undefined,
    softDelete: async () => undefined,
    getById: async (userId, id) => {
      const snap = await getDoc(doc(input.db, "users", userId, "professionalPacks", id));
      if (!snap.exists()) return null;
      return packFromFirestoreDoc(snap.id, snap.data() as Record<string, unknown>);
    },
    list: async () => [],
  };
  setProfessionalPackRepositoryForTests(packRepo);
}

export function uninstallCompatSaveSeams(): void {
  setPdfGenerateHookForTests(null);
  setComposerSecondaryIndexHookForTests(null);
  setReminderNotificationsForTests(null);
  setDiaryRepositoryForTests(null);
  setLetterheadDocumentRepositoryForTests(null);
  setPurchaseOrderRepositoryForTests(null);
  setCustomerCreditRepositoryForTests(null);
  setProfessionalPackRepositoryForTests(null);
  setPurchaseOrderSaveEffectsForTests(null);
  setCustomerCreditSaveEffectsForTests(null);
  setProfessionalPackSaveEffectsForTests(null);
  uninstallMemoryLocalDatabase();
}

export async function runCompatProductionSaves(input: {
  uid: string;
  db: Firestore;
  check: (name: string, ok: boolean, detail?: string) => void;
  entryInput: (id: string) => Parameters<typeof saveComposerEntry>[1];
  poInput: (id: string) => Parameters<typeof savePurchaseOrderWithPdf>[1]["create"];
  creditInput: (id: string) => Parameters<typeof saveCustomerCreditWithPdf>[1]["create"];
  packInput: (id: string) => Parameters<typeof saveProfessionalPackWithPdf>[1];
}): Promise<void> {
  const user = compatUser(input.uid);
  const composerOpts = (clientRecordId: string) => ({
    user,
    t,
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
      fileNameHint: "hint",
    },
    idempotency: createSaveIdempotencyContext({
      userId: input.uid,
      recordKind: "business_entry" as const,
      clientRecordId,
    }),
    route: "compat-saveComposerEntry",
  });

  const first = await saveComposerEntry(input.uid, input.entryInput("en_full_1"), composerOpts("en_full_1"));
  const steps = await fetchRecordCompletedSteps(input.uid, "business_entry", "en_full_1");
  input.check(
    "after: saveComposerEntry first Save completes with PDF metadata",
    first.cloudAccepted &&
      Boolean(first.entry.pdfUri) &&
      hasCompletedStep(steps, SAVE_STEP.BASE_RECORD_CREATED) &&
      hasCompletedStep(steps, SAVE_STEP.PDF_GENERATED) &&
      hasCompletedStep(steps, SAVE_STEP.PDF_URI_SAVED)
  );

  const replay = await saveComposerEntry(input.uid, input.entryInput("en_full_1"), composerOpts("en_full_1"));
  input.check(
    "after: saveComposerEntry same-ID return_done does not extra-CREATE",
    replay.entry.id === first.entry.id && replay.cloudAccepted
  );

  let pdfFails = true;
  setPdfGenerateHookForTests(async () => {
    if (pdfFails) throw new Error("injected pdf failure");
    return { uri: "file:///tmp/compat-retry.pdf", fileName: "retry.pdf" };
  });
  const failed = await saveComposerEntry(input.uid, input.entryInput("en_full_pdf"), composerOpts("en_full_pdf"));
  input.check(
    "after: saveComposerEntry PDF failure keeps base record",
    failed.cloudAccepted && failed.pdfFailed === true
  );
  const createsBefore = await getDoc(doc(input.db, "users", input.uid, "entries", failed.entry.id));
  pdfFails = false;
  const recovered = await saveComposerEntry(input.uid, input.entryInput("en_full_pdf"), composerOpts("en_full_pdf"));
  const createsAfter = await getDoc(doc(input.db, "users", input.uid, "entries", failed.entry.id));
  input.check(
    "after: saveComposerEntry PDF recovery does not extra-CREATE",
    recovered.cloudAccepted &&
      recovered.pdfFailed === false &&
      createsBefore.exists() &&
      createsAfter.exists() &&
      recovered.entry.id === failed.entry.id
  );
  setPdfGenerateHookForTests(async () => ({ uri: "file:///tmp/compat.pdf", fileName: "compat.pdf" }));

  const config: LetterheadConfig = {
    userId: input.uid,
    imageWidth: 100,
    imageHeight: 100,
    margins: { ...DEFAULT_LETTERHEAD_MARGINS },
    createdAt: 1,
    updatedAt: 1,
  };
  const lh = await saveLetterheadCreateWithPdf(input.uid, {
    user,
    config,
    docInput: {
      title: "Letterhead compat",
      date: Date.now(),
      subject: "Subject",
      body: "Body of the letter.",
      closing: "Yours faithfully",
      name: "Owner",
      designation: "Proprietor",
      place: "Delhi",
    },
    title: "Letterhead compat",
    createPayload: {
      ueid: "VYD-2026-BILL01",
      templateRefUpdatedAt: config.updatedAt,
      pdfUri: null,
      saved: true,
    },
    idempotency: createSaveIdempotencyContext({
      userId: input.uid,
      recordKind: "letterhead_doc",
      clientRecordId: "lh_full_1",
    }),
    locale: "en-IN",
    t,
    diaryClientId: "lh_full_1_matter",
    route: "compat-saveLetterhead",
  });
  const mirrorId = letterheadMirrorRecordId(lh.doc.id);
  const mirror = await getDoc(doc(input.db, "users", input.uid, "entries", mirrorId));
  input.check(
    "after: saveLetterheadCreateWithPdf PDF + genuine mirror",
    Boolean(lh.pdfUri) && mirror.exists() === true
  );

  const po = await savePurchaseOrderWithPdf(input.uid, {
    create: input.poInput("po_full_1")!,
    user,
    locale: "en-IN",
    t,
    idempotency: createSaveIdempotencyContext({
      userId: input.uid,
      recordKind: "purchase_order",
      clientRecordId: "po_full_1",
    }),
    route: "compat-po",
  });
  input.check("after: savePurchaseOrderWithPdf completes", Boolean(po.id) && Boolean(po.pdfUri));

  const cc = await saveCustomerCreditWithPdf(input.uid, {
    create: input.creditInput("cr_full_1")!,
    user,
    locale: "en-IN",
    t,
    idempotency: createSaveIdempotencyContext({
      userId: input.uid,
      recordKind: "customer_credit",
      clientRecordId: "cr_full_1",
    }),
    route: "compat-cc",
  });
  input.check("after: saveCustomerCreditWithPdf completes", Boolean(cc.id));

  const pack = await saveProfessionalPackWithPdf(input.uid, input.packInput("pk_full_1")!, {
    user,
    locale: "en-IN",
    t,
    idempotency: createSaveIdempotencyContext({
      userId: input.uid,
      recordKind: "professional_pack",
      clientRecordId: "pk_full_1",
    }),
    route: "compat-pack",
  });
  input.check("after: saveProfessionalPackWithPdf completes", Boolean(pack.id));
}
