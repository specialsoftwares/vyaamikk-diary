/**
 * Two synthetic clients of one credit record. Encryption stays outside the
 * commit. A retry re-reads and reseals; it does not write the first payload.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, type Firestore } from "firebase/firestore";

import { retireJsAuthBridge } from "@/services/auth/authSessionFence";
import { openContent, sealContent } from "../../../functions/src/privacy/contentEncryption";
import { sealedBusinessCloud } from "@/services/privacy/businessCloudSeal";
import { buildNewRecord } from "./shared";
import {
  addCustomerCreditPaymentOnDb,
  closeCustomerCreditFullyPaidOnDb,
  mutateCustomerCreditOnDb,
} from "./recordMutations";
import type { CustomerCreditRecord } from "@/domain/customerCredit";

const PROJECT_ID = "vyaamikk-diary-credit-revision-test";
const KEY = Buffer.alloc(32, 12);
let failures = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) console.log(`  ok - ${name}`);
  else {
    failures += 1;
    console.error(`  FAIL - ${name}${detail ? ` (${detail})` : ""}`);
  }
}

function gate(parties: number, onFull?: () => Promise<void>) {
  let arrived = 0;
  let release: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    release = resolve;
  });
  return async function wait() {
    arrived += 1;
    if (arrived >= parties) {
      if (onFull) await onFull();
      release();
    } else {
      await opened;
    }
  };
}

async function main() {
  const rules = readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8");
  const testEnv: RulesTestEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules },
  });
  await testEnv.clearFirestore();
  const uid = "credit-owner";
  const db = () => testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;

  async function seed(recordId: string, at: number) {
    const record = buildNewRecord(
      uid,
      1,
      {
        ueid: "VYD-2026-BILL01",
        saleDate: at,
        mode: "credit",
        customerName: "Ravi Kumar",
        customerMobile: "+919876543210",
        products: [{ productName: "Phone", brandModel: "A1", serialImei: null, saleAmount: 10000, invoiceNumber: null }],
        saleAmount: 10000,
        schedule: [],
      },
      at,
      recordId
    );
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const admin = ctx.firestore();
      await setDoc(doc(admin, "users", uid), {
        uid,
        status: "active",
        ageEligibility: "eligible",
        createdAt: at,
        updatedAt: at,
      });
      await setDoc(doc(admin, "users", uid, "subscription", "usageCurrent"), {
        recordsThisMonth: 4,
        monthKey: "2026-10",
        updatedAt: at,
      });
      await setDoc(doc(admin, "users", uid, "customerCreditRecords", recordId), record as unknown as Record<string, unknown>);
    });
    return record;
  }

  function parse(base: CustomerCreditRecord) {
    return (id: string, data: Record<string, unknown>) => ({ ...base, ...data, id }) as CustomerCreditRecord;
  }

  function codec(recordId: string, reads: { n: number }, wait?: () => Promise<void>, onProtect?: () => void) {
    return {
      restoreRaw: async (raw: Record<string, unknown>) => {
        reads.n += 1;
        if (wait && reads.n <= 2) await wait();
        const seal = raw.contentSeal as { revision?: number } | undefined;
        if (!seal) return raw;
        const plain = openContent({
          key: KEY,
          uid,
          collection: "customerCreditRecords",
          recordId,
          revision: Number(seal.revision),
          purpose: "customer_credit",
          seal: seal as never,
        });
        return { ...raw, ...JSON.parse(plain.toString("utf8")) };
      },
      protectCloud: async (record: CustomerCreditRecord) => {
        onProtect?.();
        const seal = sealContent({
          key: KEY,
          uid,
          collection: "customerCreditRecords",
          recordId,
          revision: record.updatedAt,
          purpose: "customer_credit",
          plaintext: Buffer.from(JSON.stringify(record)),
        });
        return sealedBusinessCloud({
          collection: "customerCreditRecords",
          plain: record as unknown as Record<string, unknown>,
          seal,
        });
      },
    };
  }

  async function paymentsOf(recordId: string, base: CustomerCreditRecord) {
    const snap = await getDoc(doc(db(), "users", uid, "customerCreditRecords", recordId));
    const raw = snap.data() as Record<string, unknown>;
    const opened = await codec(recordId, { n: 0 }).restoreRaw(raw);
    return parse(base)(recordId, opened).payments.map((payment) => payment.id);
  }

  const at = Date.UTC(2026, 9, 23, 3);
  const raceBase = await seed("cr_race", at);
  const reads = { n: 0 };
  const wait = gate(2);
  const options = codec("cr_race", reads, wait);
  const sameNow = at + 10;
  const [first, second] = await Promise.all([
    addCustomerCreditPaymentOnDb(db(), uid, "cr_race", {
      amount: 1000, paidDate: sameNow, mode: "cash", clientPaymentId: "pay_a",
    }, parse(raceBase), sameNow, options),
    addCustomerCreditPaymentOnDb(db(), uid, "cr_race", {
      amount: 2000, paidDate: sameNow, mode: "upi", clientPaymentId: "pay_b",
    }, parse(raceBase), sameNow, options),
  ]);
  const raceIds = await paymentsOf("cr_race", raceBase);
  check("concurrent payments both remain", raceIds.includes("pay_a") && raceIds.includes("pay_b") && raceIds.length === 2, raceIds.join(","));
  check("same millisecond does not reuse one revision", first.updatedAt !== second.updatedAt);

  const again = await addCustomerCreditPaymentOnDb(db(), uid, "cr_race", {
    amount: 1000, paidDate: sameNow, mode: "cash", clientPaymentId: "pay_a",
  }, parse(raceBase), sameNow + 50, codec("cr_race", { n: 0 }));
  check("retried payment id is not added twice", again.payments.filter((payment) => payment.id === "pay_a").length === 1);

  const closeBase = await seed("cr_close", at);
  const closeReads = { n: 0 };
  const closeWait = gate(2);
  const closeOptions = codec("cr_close", closeReads, closeWait);
  await Promise.all([
    addCustomerCreditPaymentOnDb(db(), uid, "cr_close", {
      amount: 500, paidDate: at, mode: "cash", clientPaymentId: "pay_new",
    }, parse(closeBase), at + 20, closeOptions),
    closeCustomerCreditFullyPaidOnDb(db(), uid, {
      recordId: "cr_close",
      clientMutationId: "pay_close",
      closure: {
        finalPaymentDate: at,
        finalPaymentAmount: 9500,
        paymentMode: "cash",
        paidBy: "customer",
        recordedBy: uid,
        balanceAtClosure: 0,
        adjustment: "exact",
        closedAt: at + 20,
      },
    }, parse(closeBase), at + 20, closeOptions),
  ]);
  const closedIds = await paymentsOf("cr_close", closeBase);
  const closedSnap = await getDoc(doc(db(), "users", uid, "customerCreditRecords", "cr_close"));
  check("closure keeps the newer payment", closedIds.includes("pay_new") && closedIds.includes("pay_close"), closedIds.join(","));
  check("closure still completes", closedSnap.data()?.status === "fully_paid");

  const editBase = await seed("cr_edit", at);
  const editReads = { n: 0 };
  const editWait = gate(2);
  const editOptions = codec("cr_edit", editReads, editWait);
  await Promise.all([
    mutateCustomerCreditOnDb(db(), uid, "cr_edit", (existing) => ({ ...existing, customerName: "Edited Name" }), parse(editBase), at + 30, editOptions),
    closeCustomerCreditFullyPaidOnDb(db(), uid, {
      recordId: "cr_edit",
      appendFinalPayment: false,
      closure: {
        finalPaymentDate: at,
        finalPaymentAmount: 0,
        paymentMode: "cash",
        paidBy: "customer",
        recordedBy: uid,
        balanceAtClosure: 10000,
        adjustment: "exact",
        closedAt: at + 30,
      },
    }, parse(editBase), at + 30, editOptions),
  ]);
  const editedSnap = await getDoc(doc(db(), "users", uid, "customerCreditRecords", "cr_edit"));
  const editedRaw = await codec("cr_edit", { n: 0 }).restoreRaw(editedSnap.data() as Record<string, unknown>);
  check("edit and closure both survive", editedRaw.customerName === "Edited Name" && editedSnap.data()?.status === "fully_paid");

  const deleteBase = await seed("cr_delete", at);
  const deleteReads = { n: 0 };
  let deleted = false;
  const deleteWait = gate(2, async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const { deleteDoc } = await import("firebase/firestore");
      await deleteDoc(doc(ctx.firestore(), "users", uid, "customerCreditRecords", "cr_delete"));
    });
    deleted = true;
  });
  const deleteOptions = codec("cr_delete", deleteReads, deleteWait);
  const outcomes = await Promise.allSettled([
    addCustomerCreditPaymentOnDb(db(), uid, "cr_delete", {
      amount: 10, paidDate: at, mode: "cash", clientPaymentId: "pay_gone",
    }, parse(deleteBase), at + 40, deleteOptions),
    addCustomerCreditPaymentOnDb(db(), uid, "cr_delete", {
      amount: 20, paidDate: at, mode: "cash", clientPaymentId: "pay_gone_2",
    }, parse(deleteBase), at + 40, deleteOptions),
  ]);
  let afterDelete: Awaited<ReturnType<typeof getDoc>> | undefined;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    afterDelete = await getDoc(doc(ctx.firestore(), "users", uid, "customerCreditRecords", "cr_delete"));
  });
  check("deletion during preparation is not recreated", deleted && outcomes.every((outcome) => outcome.status === "rejected") && afterDelete != null && !afterDelete.exists());

  const sessionBase = await seed("cr_session", at);
  let flipped = false;
  let sessionError: unknown;
  try {
    await addCustomerCreditPaymentOnDb(db(), uid, "cr_session", {
      amount: 10, paidDate: at, mode: "cash", clientPaymentId: "pay_session",
    }, parse(sessionBase), at + 50, codec("cr_session", { n: 0 }, undefined, () => {
      if (!flipped) {
        retireJsAuthBridge();
        flipped = true;
      }
    }));
  } catch (error) {
    sessionError = error;
  }
  const sessionSnap = await getDoc(doc(db(), "users", uid, "customerCreditRecords", "cr_session"));
  check(
    "uid generation change does not commit the prepared payment",
    flipped && !sessionSnap.data()?.contentSeal && (sessionError as { details?: { reason?: string } })?.details?.reason === "session_changed"
  );

  const usage = await getDoc(doc(db(), "users", uid, "subscription", "usageCurrent"));
  check("payment and closure edits do not charge a creation slot", usage.data()?.recordsThisMonth === 4);

  await testEnv.cleanup();
  if (failures > 0) {
    console.error(`credit revision: ${failures} failed`);
    process.exitCode = 1;
  } else {
    console.log("credit revision: concurrent payment, closure, deletion and session tests passed");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
