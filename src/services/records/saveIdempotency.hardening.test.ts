/**
 * Save idempotency hardening — repository-level guards (Node, no RN UI).
 */
import assert from "node:assert/strict";

import type { CustomerCreditRecord } from "@/domain/customerCredit";
import { appendPayment, applyFullClosure } from "@/services/customerCredit/shared";
import { stableRecordId } from "@/services/records/stableRecordId";

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

async function clearStorage(): Promise<void> {
  const { default: AsyncStorage } = await import(
    "@react-native-async-storage/async-storage"
  );
  await AsyncStorage.clear();
}

function minimalPoInput(clientRecordId: string) {
  return {
    clientRecordId,
    ueid: "VYD-0000-000001",
    poDate: Date.now(),
    vendorName: "Acme Supplies",
    buyerName: "Test Buyer",
    items: [{ itemName: "Widget", descriptionLines: [], quantity: 1, unit: "pcs", rate: 100, taxRate: null, amount: 100 }],
    total: 100,
  };
}

function minimalCreditInput(clientRecordId: string) {
  return {
    clientRecordId,
    ueid: "VYD-0000-000001",
    saleDate: Date.now(),
    mode: "credit" as const,
    customerName: "Ravi Kumar",
    customerMobile: "+919876543210",
    products: [{ productName: "Phone", brandModel: null, serialImei: null, saleAmount: 10000, invoiceNumber: null }],
    saleAmount: 10000,
    schedule: [],
    payments: [],
  };
}

function creditRecord(overrides: Partial<CustomerCreditRecord> = {}): CustomerCreditRecord {
  const now = Date.now();
  return {
    id: "cr_test_1",
    userId: "u1",
    ueid: "VYD-0000-000001",
    serial: 1,
    recordNumber: "VYD-CR-0001",
    status: "active",
    mode: "credit",
    saleDate: now,
    customerName: "Ravi",
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
    saleAmount: 10000,
    downPayment: null,
    interestCharges: null,
    charges: null,
    upfrontCharges: null,
    totalPayable: 10000,
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
    ...overrides,
  };
}

async function run(): Promise<void> {
  installAsyncStoragePolyfill();
  const { mockCustomerCreditRepository } = await import(
    "@/services/customerCredit/mock"
  );
  const { mockLetterheadDocumentRepository } = await import(
    "@/services/letterhead/documents-mock"
  );
  const { mockPurchaseOrderRepository } = await import(
    "@/services/purchaseOrder/mock"
  );

  const userId = "hardening_user";

  // --- letterhead: double create → one document ---
  await clearStorage();
  const lhdId = "lhd_hardening_1";
  const lh1 = await mockLetterheadDocumentRepository.create(userId, {
    clientRecordId: lhdId,
    ueid: "VYD-0000-000001",
    title: "Demand letter",
    input: {
      title: "Demand letter",
      date: Date.now(),
      subject: "Payment reminder",
      body: "Please pay.",
      closing: "Yours faithfully",
      name: "Shop",
      designation: "Owner",
      place: "Delhi",
    },
    templateRefUpdatedAt: null,
    pdfUri: null,
    saved: true,
    firstGeneratedAt: Date.now(),
    lastEditedAt: null,
    version: 1,
    editHistory: [{ version: 1, at: Date.now(), action: "created" }],
  });
  const lh2 = await mockLetterheadDocumentRepository.create(userId, {
    clientRecordId: lhdId,
    ueid: "VYD-0000-000001",
    title: "Demand letter duplicate attempt",
    input: {
      title: "Demand letter",
      date: Date.now(),
      subject: "Payment reminder",
      body: "Please pay.",
      closing: "Yours faithfully",
      name: "Shop",
      designation: "Owner",
      place: "Delhi",
    },
    templateRefUpdatedAt: null,
    pdfUri: null,
    saved: true,
    firstGeneratedAt: Date.now(),
    lastEditedAt: null,
    version: 1,
    editHistory: [{ version: 1, at: Date.now(), action: "created" }],
  });
  assert.equal(lh1.id, lh2.id);
  const lhList = await mockLetterheadDocumentRepository.list(userId);
  assert.equal(lhList.length, 1, "letterhead double-submit creates one doc");

  // --- letterhead: edit updates existing, no new doc ---
  const lhEdited = await mockLetterheadDocumentRepository.update(userId, lh1.id, {
    title: "Updated title",
    version: 2,
    lastEditedAt: Date.now(),
    editHistory: [
      ...(lh1.editHistory ?? []),
      { version: 2, at: Date.now(), action: "edited" },
    ],
  });
  assert.equal(lhEdited.id, lh1.id);
  assert.equal(lhEdited.title, "Updated title");
  assert.equal((await mockLetterheadDocumentRepository.list(userId)).length, 1);

  // --- PO: rapid save → one PO, one serial ---
  await clearStorage();
  const poId = "po_hardening_1";
  const po1 = await mockPurchaseOrderRepository.create(userId, minimalPoInput(poId));
  const po2 = await mockPurchaseOrderRepository.create(userId, minimalPoInput(poId));
  assert.equal(po1.id, po2.id);
  assert.equal(po1.serial, po2.serial);
  const poList = await mockPurchaseOrderRepository.list(userId);
  assert.equal(poList.length, 1);
  const serialAfterDup = await mockPurchaseOrderRepository.allocateSerial(userId);
  assert.equal(serialAfterDup, 2, "serial increments only once per successful create");

  // --- Customer Credit: rapid save → one record ---
  await clearStorage();
  const crId = "cr_hardening_1";
  const cr1 = await mockCustomerCreditRepository.create(userId, minimalCreditInput(crId));
  const cr2 = await mockCustomerCreditRepository.create(userId, minimalCreditInput(crId));
  assert.equal(cr1.id, cr2.id);
  assert.equal(cr1.serial, cr2.serial);
  assert.equal((await mockCustomerCreditRepository.list(userId)).length, 1);

  // --- closure: rapid apply → one closure payment ---
  const base = creditRecord({ saleAmount: 5000, totalPayable: 5000, payments: [] });
  const closureMeta = {
    finalPaymentDate: Date.now(),
    finalPaymentAmount: 5000,
    paymentMode: "cash" as const,
    paymentReference: null,
    paidBy: "customer" as const,
    payerName: null,
    payerRelation: null,
    payerMobile: null,
    recordedBy: "Shop",
    closingRemarks: null,
    balanceAtClosure: 5000,
    adjustment: "exact" as const,
    adjustmentAmount: null,
    adjustmentNote: null,
    closedAt: Date.now(),
  };
  const closed1 = applyFullClosure(
    base,
    closureMeta,
    { appendPayment: true, clientPaymentId: "pay_close_1" },
    Date.now()
  );
  const closed2 = applyFullClosure(
    closed1,
    closureMeta,
    { appendPayment: true, clientPaymentId: "pay_close_1" },
    Date.now()
  );
  assert.equal(closed1.payments.length, 1);
  assert.equal(closed2.payments.length, 1, "closure replay does not duplicate payment");
  assert.equal(closed2.status, "fully_paid");

  // --- payment ledger: rapid append → one payment event ---
  const withPay1 = appendPayment(
    base,
    { amount: 1000, paidDate: Date.now(), mode: "cash", reference: null, note: null, clientPaymentId: "pay_ledger_1" },
    Date.now()
  );
  const withPay2 = appendPayment(
    withPay1,
    { amount: 1000, paidDate: Date.now(), mode: "cash", reference: null, note: null, clientPaymentId: "pay_ledger_1" },
    Date.now()
  );
  assert.equal(withPay1.payments.length, 1);
  assert.equal(withPay2.payments.length, 1, "payment ledger idempotent by clientPaymentId");

  // --- stableRecordId consistency ---
  assert.equal(stableRecordId("po_x", "po"), stableRecordId("po_x", "po"));

  console.log("saveIdempotency.hardening.test.ts ok");
}

void run();
