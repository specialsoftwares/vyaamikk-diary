/**
 * Persistent save lock + completed steps — Node unit tests.
 */
import assert from "node:assert/strict";

import {
  SAVE_LOCK_TTL_MS,
  SAVE_STEP,
  hasCompletedStep,
  mergeCompletedSteps,
  unionCompletedSteps,
} from "./saveLockTypes";
import { isLockExpired } from "./persistentSaveLock";
import {
  appendPayment,
  applyFullClosure,
} from "@/services/customerCredit/shared";
import type { CustomerCreditRecord } from "@/domain/customerCredit";
import { stableRecordId } from "./stableRecordId";

function installAsyncStoragePolyfill(): void {
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

function creditBase(): CustomerCreditRecord {
  const now = Date.now();
  return {
    id: "cr_lock_test",
    userId: "u1",
    ueid: "VYD-0000-000001",
    serial: 1,
    recordNumber: "VYD-CR-0001",
    status: "active",
    mode: "credit",
    saleDate: now,
    customerName: "Test",
    customerMobile: "+919876543210",
    customerAltContact: null,
    customerAddress: null,
    customerLocality: null,
    customerCity: null,
    customerState: null,
    customerPin: null,
    customerEmail: null,
    customerPhoto: null,
    documentType: null,
    documentReference: null,
    products: [],
    saleAmount: 5000,
    downPayment: null,
    interestCharges: null,
    charges: null,
    upfrontCharges: null,
    totalPayable: 5000,
    emiFrequency: null,
    emiCount: null,
    emiAmount: null,
    firstDueDate: null,
    customIntervalDays: null,
    schedule: [],
    payments: [],
    financerName: null,
    financeRefNumber: null,
    financeDownPayment: null,
    financeAmount: null,
    shopFollowUpRequired: false,
    guarantorName: null,
    remarks: null,
    idAttachmentConsentAt: null,
    hasIdAttachment: false,
    pdfUri: null,
    reminderAt: null,
    reminderNotificationId: null,
    firstGeneratedAt: now,
    lastEditedAt: null,
    version: 1,
    editHistory: [],
    cancelledAt: null,
    closedAt: null,
    closure: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

async function run(): Promise<void> {
  installAsyncStoragePolyfill();

  assert.equal(SAVE_LOCK_TTL_MS, 30 * 60 * 1000);
  assert.equal(hasCompletedStep(["base_record_created"], SAVE_STEP.BASE_RECORD_CREATED), true);
  assert.equal(hasCompletedStep([], SAVE_STEP.PDF_GENERATED), false);
  assert.deepEqual(
    mergeCompletedSteps([SAVE_STEP.BASE_RECORD_CREATED], SAVE_STEP.PDF_GENERATED),
    [SAVE_STEP.BASE_RECORD_CREATED, SAVE_STEP.PDF_GENERATED]
  );
  assert.deepEqual(
    mergeCompletedSteps([SAVE_STEP.BASE_RECORD_CREATED], SAVE_STEP.BASE_RECORD_CREATED),
    [SAVE_STEP.BASE_RECORD_CREATED]
  );
  assert.deepEqual(
    unionCompletedSteps(
      [SAVE_STEP.PDF_GENERATED],
      [SAVE_STEP.BASE_RECORD_CREATED, SAVE_STEP.PDF_GENERATED]
    ),
    [SAVE_STEP.PDF_GENERATED, SAVE_STEP.BASE_RECORD_CREATED]
  );

  const inFlight = {
    clientRecordId: "po_x",
    idempotencyKey: "k",
    userId: "u1",
    recordKind: "purchase_order" as const,
    status: "in_flight" as const,
    startedAt: Date.now() - 1000,
    updatedAt: Date.now(),
    expiresAt: Date.now() + SAVE_LOCK_TTL_MS,
  };
  assert.equal(isLockExpired(inFlight), false);
  assert.equal(
    isLockExpired({ ...inFlight, expiresAt: Date.now() - 1 }),
    true
  );

  const { readPersistentSaveLock, markPersistentLockInFlight, markPersistentLockDone } =
    await import("./persistentSaveLock");

  await markPersistentLockInFlight({
    userId: "u1",
    clientRecordId: "po_lock_1",
    idempotencyKey: "u1:purchase_order:po_lock_1:none:create",
    recordKind: "purchase_order",
    recordId: null,
  });
  const lock = await readPersistentSaveLock("u1", "po_lock_1");
  assert.ok(lock);
  assert.equal(lock!.status, "in_flight");
  await markPersistentLockDone("u1", "po_lock_1", "po_lock_1");
  const done = await readPersistentSaveLock("u1", "po_lock_1");
  assert.equal(done?.status, "done");
  assert.equal(done?.recordId, "po_lock_1");

  const id1 = stableRecordId("po_retry_1", "po");
  const id2 = stableRecordId("po_retry_1", "po");
  assert.equal(id1, id2, "retry reuses stable clientRecordId");

  const { mockPurchaseOrderRepository } = await import("@/services/purchaseOrder/mock");
  const { default: AsyncStorage } = await import(
    "@react-native-async-storage/async-storage"
  );
  await AsyncStorage.clear();

  const poInput = {
    clientRecordId: "po_serial_test",
    ueid: "VYD-0000-000001",
    poDate: Date.now(),
    vendorName: "Vendor",
    buyerName: "Buyer",
    items: [
      {
        itemName: "X",
        descriptionLines: [],
        quantity: 1,
        unit: "pcs",
        rate: 10,
        taxRate: null,
        amount: 10,
      },
    ],
    total: 10,
  };
  const po1 = await mockPurchaseOrderRepository.create("u1", poInput);
  const po2 = await mockPurchaseOrderRepository.create("u1", poInput);
  assert.equal(po1.serial, po2.serial, "retry does not allocate new serial");
  const serialNext = await mockPurchaseOrderRepository.allocateSerial("u1");
  assert.equal(serialNext, 2);

  const base = creditBase();
  const closed = applyFullClosure(
    base,
    {
      finalPaymentDate: Date.now(),
      finalPaymentAmount: 5000,
      paymentMode: "cash",
      paymentReference: null,
      paidBy: "customer",
      payerName: null,
      payerRelation: null,
      payerMobile: null,
      recordedBy: "Shop",
      closingRemarks: null,
      balanceAtClosure: 5000,
      adjustment: "exact",
      adjustmentAmount: null,
      adjustmentNote: null,
      closedAt: Date.now(),
    },
    { appendPayment: true, clientPaymentId: "pay_close_lock" },
    Date.now()
  );
  const closed2 = applyFullClosure(
    closed,
    closed.closure!,
    { appendPayment: true, clientPaymentId: "pay_close_lock" },
    Date.now()
  );
  assert.equal(closed2.payments.length, 1, "closure step idempotent");

  const paid = appendPayment(
    base,
    {
      amount: 100,
      paidDate: Date.now(),
      mode: "cash",
      reference: null,
      note: null,
      clientPaymentId: "pay_lock_1",
    },
    Date.now()
  );
  const paid2 = appendPayment(
    paid,
    {
      amount: 100,
      paidDate: Date.now(),
      mode: "cash",
      reference: null,
      note: null,
      clientPaymentId: "pay_lock_1",
    },
    Date.now()
  );
  assert.equal(paid2.payments.length, 1, "payment ledger idempotent");

  console.log("saveLock.test.ts ok");
}

void run();
