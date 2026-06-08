/**
 * App-wide record save lifecycle — base save critical, secondary steps best-effort.
 */
import assert from "node:assert/strict";

import {
  entryTypeFromMovementKind,
  isMaterialMovementEntryType,
  movementKindFromEntryType,
} from "@/domain/materialMovement";
import {
  isDukaanPaymentDateAllowed,
  minDukaanPaymentDate,
} from "@/domain/customerCredit";
import { runBestEffortSecondary } from "@/services/records/saveLifecycleRunner";
import { SAVE_STEP } from "@/services/records/saveLockTypes";
import { shouldRunStep } from "@/services/records/saveCoordinator";

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

async function clearStorage(): Promise<void> {
  const { default: AsyncStorage } = await import(
    "@react-native-async-storage/async-storage"
  );
  await AsyncStorage.clear();
}

async function run(): Promise<void> {
  installAsyncStoragePolyfill();

  // --- runBestEffortSecondary: success ---
  const ok = await runBestEffortSecondary(
    "test_step",
    { recordKind: "business_entry", userId: "u1", remoteId: "e1" },
    async () => "done"
  );
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.result, "done");

  // --- runBestEffortSecondary: failure does not throw ---
  const fail = await runBestEffortSecondary(
    "test_step",
    { recordKind: "business_entry", userId: "u1", remoteId: "e1" },
    async () => {
      throw new Error("secondary_failed");
    }
  );
  assert.equal(fail.ok, false);

  // --- runBestEffortSecondary: bounded timeout ---
  const slow = await runBestEffortSecondary(
    "test_step",
    { recordKind: "business_entry", userId: "u1", remoteId: "e1" },
    () => new Promise<string>((resolve) => setTimeout(() => resolve("late"), 50)),
    { timeoutMs: 5 }
  );
  assert.equal(slow.ok, false);

  // --- Material Movement mapping: internal types visible in list filters ---
  for (const kind of ["sent_transport", "received", "return"] as const) {
    const entryType = entryTypeFromMovementKind(kind);
    assert.ok(isMaterialMovementEntryType(entryType));
    assert.equal(movementKindFromEntryType(entryType), kind);
  }
  assert.equal(entryTypeFromMovementKind("sent_transport"), "material_dispatched");
  assert.equal(
    movementKindFromEntryType("outward_freight_details"),
    "sent_transport",
    "freight maps to sent_transport for list visibility"
  );

  // --- PDF / secondary step gating ---
  assert.equal(
    shouldRunStep([SAVE_STEP.PDF_GENERATED], SAVE_STEP.PDF_GENERATED, {
      pdfUri: "file:///tmp/x.pdf",
    }),
    false
  );
  assert.equal(
    shouldRunStep([], SAVE_STEP.INSIGHTS_INDEXED, { pdfUri: null }),
    true,
    "secondary insight step independent of PDF"
  );

  // --- Dukaan payment date policy ---
  const saleDate = new Date(2025, 5, 10).getTime();
  const minPay = minDukaanPaymentDate(saleDate);
  assert.ok(minPay >= saleDate);
  assert.equal(isDukaanPaymentDateAllowed(saleDate, saleDate), true);
  assert.equal(
    isDukaanPaymentDateAllowed(saleDate + 86_400_000 * 30, saleDate),
    true,
    "future instalment/due date after sale allowed"
  );
  assert.equal(
    isDukaanPaymentDateAllowed(saleDate - 86_400_000, saleDate),
    false,
    "payment before invoice/sale date blocked"
  );

  // --- Payment dedupe (from customer credit save lifecycle) ---
  const { mockCustomerCreditRepository } = await import("@/services/customerCredit/mock");
  const { createSaveIdempotencyContext } = await import(
    "@/services/records/saveIdempotency"
  );
  const { saveCustomerCreditPayment } = await import(
    "@/services/customerCredit/savePayment"
  );
  await clearStorage();
  const creditUser = "pay_lifecycle_user";
  const credit = await mockCustomerCreditRepository.create(creditUser, {
    clientRecordId: "cr_pay_lifecycle",
    ueid: "VYD-0000-000001",
    saleDate,
    mode: "credit",
    customerName: "Test",
    customerMobile: "+919876543210",
    products: [{ productName: "Item", brandModel: null, serialImei: null, saleAmount: 5000, invoiceNumber: null }],
    saleAmount: 5000,
    schedule: [],
  });
  const payId = "pay_dedupe_1";
  const ctx = createSaveIdempotencyContext({
    userId: creditUser,
    recordKind: "customer_credit_payment",
    clientRecordId: payId,
    scopeKey: credit.id,
  });
  await saveCustomerCreditPayment(
    creditUser,
    credit.id,
    {
      amount: 1000,
      paidDate: saleDate + 86_400_000 * 7,
      mode: "cash",
      reference: null,
      note: null,
      clientPaymentId: payId,
    },
    ctx
  );
  const ctx2 = createSaveIdempotencyContext({
    userId: creditUser,
    recordKind: "customer_credit_payment",
    clientRecordId: payId,
    scopeKey: credit.id,
  });
  const afterRetry = await saveCustomerCreditPayment(
    creditUser,
    credit.id,
    {
      amount: 1000,
      paidDate: saleDate + 86_400_000 * 7,
      mode: "cash",
      reference: null,
      note: null,
      clientPaymentId: payId,
    },
    ctx2
  );
  assert.equal(afterRetry.payments.length, 1, "rapid tap creates one ledger entry");

  // --- PO: one serial per clientRecordId (hardening smoke) ---
  const { mockPurchaseOrderRepository } = await import("@/services/purchaseOrder/mock");
  const { stableRecordId } = await import("@/services/records/stableRecordId");
  await clearStorage();
  const poUser = "po_lifecycle_user";
  const poClientId = "po_client_1";
  const poInput = {
    clientRecordId: poClientId,
    ueid: "VYD-0000-000001",
    poDate: saleDate,
    vendorName: "Vendor",
    buyerName: "Buyer",
    items: [
      {
        itemName: "Widget",
        descriptionLines: [],
        quantity: 1,
        unit: "pcs",
        rate: 100,
        taxRate: null,
        amount: 100,
      },
    ],
    total: 100,
  };
  const po1 = await mockPurchaseOrderRepository.create(poUser, poInput);
  assert.equal(po1.id, stableRecordId(poClientId, "po"));
  const po2 = await mockPurchaseOrderRepository.create(poUser, poInput);
  assert.equal(po2.id, po1.id);
  assert.equal((await mockPurchaseOrderRepository.list(poUser)).length, 1);

  // --- Letterhead edit updates existing doc only ---
  const { mockLetterheadDocumentRepository } = await import(
    "@/services/letterhead/documents-mock"
  );
  await clearStorage();
  const lhUser = "lh_lifecycle_user";
  const lh = await mockLetterheadDocumentRepository.create(lhUser, {
    clientRecordId: "lh_client_1",
    ueid: "VYD-0000-000001",
    title: "Test letter",
    input: {
      title: "Test letter",
      date: saleDate,
      subject: "Hi",
      body: "Body",
      closing: "Regards",
      name: "Shop",
      designation: "Owner",
      place: "Delhi",
    },
    templateRefUpdatedAt: null,
    pdfUri: null,
    saved: true,
    firstGeneratedAt: saleDate,
    lastEditedAt: null,
    version: 1,
    editHistory: [{ version: 1, at: saleDate, action: "created" }],
  });
  const edited = await mockLetterheadDocumentRepository.update(lhUser, lh.id, {
    title: "Updated",
    version: 2,
    lastEditedAt: Date.now(),
    editHistory: [
      ...(lh.editHistory ?? []),
      { version: 2, at: Date.now(), action: "edited" },
    ],
  });
  assert.equal(edited.id, lh.id);
  assert.equal((await mockLetterheadDocumentRepository.list(lhUser)).length, 1);

  console.log("saveLifecycle.test.ts: all cases passed");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
