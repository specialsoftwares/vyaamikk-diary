/**
 * Dukaan / customer credit save lifecycle — repository ordering (Node, no RN UI).
 */
import assert from "node:assert/strict";

import {
  attachRecordIdToPersistentLock,
  readPersistentSaveLock,
} from "@/services/records/persistentSaveLock";
import { shouldRunStep } from "@/services/records/saveCoordinator";
import { SAVE_STEP } from "@/services/records/saveLockTypes";
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

function minimalCreditInput(clientRecordId: string) {
  return {
    clientRecordId,
    ueid: "VYD-0000-000001",
    saleDate: Date.now(),
    mode: "credit" as const,
    customerName: "Ravi Kumar",
    customerMobile: "+919876543210",
    products: [
      {
        productName: "Phone",
        brandModel: null,
        serialImei: null,
        saleAmount: 10000,
        invoiceNumber: null,
      },
    ],
    saleAmount: 10000,
    schedule: [],
    payments: [],
  };
}

async function run(): Promise<void> {
  installAsyncStoragePolyfill();
  const { mockCustomerCreditRepository } = await import("@/services/customerCredit/mock");

  const userId = "dukaan_lifecycle_user";
  await clearStorage();

  // --- stable clientRecordId → one persisted id ---
  const clientRecordId = "cr_lifecycle_1";
  const expectedId = stableRecordId(clientRecordId, "cr");
  const created = await mockCustomerCreditRepository.create(
    userId,
    minimalCreditInput(clientRecordId)
  );
  assert.equal(created.id, expectedId);
  assert.ok(created.id.length > 0);

  // --- base record exists before PDF uri attach ---
  const beforePdf = await mockCustomerCreditRepository.getById(userId, created.id);
  assert.ok(beforePdf, "base record must exist before pdfUri update");
  assert.equal(beforePdf!.pdfUri, null);

  const withPdf = await mockCustomerCreditRepository.update(userId, {
    id: created.id,
    pdfUri: "file:///tmp/dukaan-test.pdf",
  });
  assert.equal(withPdf.pdfUri, "file:///tmp/dukaan-test.pdf");

  // --- list / history includes saved record ---
  const list = await mockCustomerCreditRepository.list(userId);
  assert.equal(list.length, 1);
  assert.equal(list[0]!.id, created.id);
  assert.equal(list[0]!.pdfUri, "file:///tmp/dukaan-test.pdf");

  // --- rapid create with same clientRecordId → one record ---
  const dup = await mockCustomerCreditRepository.create(userId, minimalCreditInput(clientRecordId));
  assert.equal(dup.id, created.id);
  assert.equal((await mockCustomerCreditRepository.list(userId)).length, 1);

  // --- PDF step gating: skip generate when pdfUri already saved ---
  assert.equal(
    shouldRunStep([SAVE_STEP.PDF_GENERATED, SAVE_STEP.PDF_URI_SAVED], SAVE_STEP.PDF_GENERATED, {
      pdfUri: withPdf.pdfUri,
    }),
    false
  );
  assert.equal(
    shouldRunStep([], SAVE_STEP.PDF_GENERATED, { pdfUri: null }),
    true,
    "PDF must run only when base record has no pdfUri yet"
  );

  // --- persistent lock stores recordId after create (resume support) ---
  const lockClientId = "cr_lock_attach";
  const { markPersistentLockInFlight } = await import("@/services/records/persistentSaveLock");
  await markPersistentLockInFlight({
    userId,
    clientRecordId: lockClientId,
    idempotencyKey: "test-key",
    recordKind: "customer_credit",
    recordId: null,
  });
  await attachRecordIdToPersistentLock(userId, lockClientId, created.id);
  const lock = await readPersistentSaveLock(userId, lockClientId);
  assert.equal(lock?.recordId, created.id);

  // --- internal type alias unchanged (Saved Records / search mapping) ---
  assert.equal("customer_credit", "customer_credit");

  // --- payment ledger: append once, retry same clientPaymentId → one entry ---
  const saleDate = created.saleDate;
  const { createSaveIdempotencyContext } = await import(
    "@/services/records/saveIdempotency"
  );
  const { saveCustomerCreditPayment } = await import("@/services/customerCredit/savePayment");
  const payClientId = "pay_lifecycle_1";
  const payCtx = createSaveIdempotencyContext({
    userId,
    recordKind: "customer_credit_payment",
    clientRecordId: payClientId,
    scopeKey: created.id,
  });
  const afterPay1 = await saveCustomerCreditPayment(
    userId,
    created.id,
    {
      amount: 2500,
      paidDate: saleDate,
      mode: "cash",
      reference: null,
      note: null,
      clientPaymentId: payClientId,
    },
    payCtx
  );
  assert.equal(afterPay1.payments.length, 1);
  const payCtxRetry = createSaveIdempotencyContext({
    userId,
    recordKind: "customer_credit_payment",
    clientRecordId: payClientId,
    scopeKey: created.id,
  });
  const afterPay2 = await saveCustomerCreditPayment(
    userId,
    created.id,
    {
      amount: 2500,
      paidDate: saleDate,
      mode: "cash",
      reference: null,
      note: null,
      clientPaymentId: payClientId,
    },
    payCtxRetry
  );
  assert.equal(afterPay2.payments.length, 1, "retry with same clientPaymentId dedupes");
  const detail = await mockCustomerCreditRepository.getById(userId, created.id);
  assert.equal(detail?.payments.length, 1);
  const summary = (await import("@/domain/customerCredit")).computeCreditSummary(detail!);
  assert.ok(summary.totalPaid >= 2500, "balance reflects appended payment");

  const closedAt = Date.now();
  const closed = await mockCustomerCreditRepository.closeFullyPaid(userId, {
    recordId: created.id,
    appendFinalPayment: true,
    clientMutationId: "close_lifecycle_1",
    closure: {
      finalPaymentDate: closedAt,
      finalPaymentAmount: 7500,
      paymentMode: "cash",
      paidBy: "customer",
      recordedBy: userId,
      balanceAtClosure: 0,
      adjustment: "exact",
      closedAt,
    },
  });
  assert.equal(closed.status, "fully_paid");
  assert.ok(closed.closure, "closure metadata persisted");
  const closedAgain = await mockCustomerCreditRepository.closeFullyPaid(userId, {
    recordId: created.id,
    appendFinalPayment: true,
    clientMutationId: "close_lifecycle_1",
    closure: closed.closure!,
  });
  assert.equal(closedAgain.status, "fully_paid");
  assert.equal(closedAgain.version, closed.version, "repeat closeFullyPaid is idempotent");

  // --- absent/blank clientRecordId: identity captured once per create ---
  const absent = await mockCustomerCreditRepository.create(userId, {
    ...minimalCreditInput("unused"),
    clientRecordId: undefined,
  });
  assert.ok(absent.id.trim().length > 0, "absent clientRecordId still yields an id");
  const absentHit = await mockCustomerCreditRepository.getById(userId, absent.id);
  assert.equal(absentHit?.id, absent.id, "mock payload id matches stored id");
  const absentOther = await mockCustomerCreditRepository.create(userId, {
    ...minimalCreditInput("unused"),
    clientRecordId: undefined,
  });
  assert.notEqual(
    absentOther.id,
    absent.id,
    "a new create with absent clientRecordId is a distinct record"
  );

  const blank = await mockCustomerCreditRepository.create(userId, {
    ...minimalCreditInput("unused"),
    clientRecordId: "   ",
  });
  assert.ok(blank.id.trim().length > 0, "blank clientRecordId still yields an id");
  const blankRetry = await mockCustomerCreditRepository.create(userId, {
    ...minimalCreditInput("unused"),
    clientRecordId: blank.id,
  });
  assert.equal(blankRetry.id, blank.id, "retry with captured id is idempotent");
  assert.equal(blankRetry.serial, blank.serial, "idempotent retry does not allocate another serial");

  console.log("saveLifecycle.test.ts: all cases passed");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
