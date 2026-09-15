/**
 * VYD-36 Round 1 — Option-C production write-set proofs for
 * purchaseOrders, customerCreditRecords, professionalPacks.
 *
 * Runs in the same emulator session as firestore.rules.billing.test.ts.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";

import { istMonthKeyForMillis } from "@/billing/istMonthKey";
import { AppError } from "@/domain/errors";
import {
  buildPurchaseOrderRecord,
  createPurchaseOrderAtomic,
} from "@/services/purchaseOrder/atomicCreate";
import { createCustomerCreditAtomic } from "@/services/customerCredit/atomicCreate";
import { createProfessionalPackAtomic } from "@/services/professionalPack/atomicCreate";
import { classifyAtomicCreateError } from "@/billing/optionC/classifyCreateError";
import { runAtomicBillableCreate } from "@/billing/optionC/atomicBillableCreate";
import type { PurchaseOrder } from "@/domain/purchaseOrder";
import type { CustomerCreditRecord } from "@/domain/customerCredit";

const PROJECT_ID = "vyaamikk-diary-phaseg-quota-test";
const RULES_PATH = resolve(process.cwd(), "firestore.rules");

let testEnv: RulesTestEnvironment;
let failures = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) console.log(`  ok - ${name}`);
  else {
    failures += 1;
    console.error(`  FAIL - ${name}${detail ? ` (${detail})` : ""}`);
  }
}

function authedDb(uid: string): Firestore {
  return testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
}

async function seedUser(uid: string, patch: Record<string, unknown> = {}): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "users", uid), {
      uid,
      ueid: "VYD-2026-BILL01",
      phoneE164: "+919999999999",
      status: "active",
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      displayName: "Phase G User",
      ...patch,
    });
  });
}

async function seedStatus(uid: string, patch: Record<string, unknown> = {}): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "users", uid, "subscription", "status"), {
      plan: "free",
      billingStatus: "active",
      entitlementActive: true,
      entitlementReason: "neverSubscribed",
      quotaEnforcementEnabled: false,
      updatedAt: Date.now(),
      updatedBy: "admin",
      ...patch,
    });
  });
}

async function seedUsage(uid: string, data: Record<string, unknown>): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "users", uid, "subscription", "usageCurrent"), data);
  });
}

function usageDoc(
  monthKey: string,
  recordsThisMonth: number,
  lastRecordId: string,
  lastRecordCollection = "purchaseOrders"
) {
  return {
    monthKey,
    recordsThisMonth,
    lastRecordCollection,
    lastRecordId,
    updatedAt: Date.now(),
  };
}

function poInput(clientRecordId: string) {
  return {
    clientRecordId,
    ueid: "VYD-2026-BILL01",
    poDate: Date.now(),
    vendorName: "Acme Supplies Private Limited",
    vendorGstin: "27AAPFU0939F1ZV",
    vendorAddress: "1 Industrial Area",
    buyerName: "Test Buyer",
    buyerAddress: "2 Market Street",
    items: [
      {
        itemName: "Widget",
        descriptionLines: ["Grade A"],
        quantity: 2,
        unit: "pcs",
        rate: 500,
        taxRate: 18,
        amount: 1000,
      },
    ],
    total: 1180,
    notes: "production-shaped create",
    terms: "Net 30",
  };
}

function creditInput(clientRecordId: string) {
  return {
    clientRecordId,
    ueid: "VYD-2026-BILL01",
    saleDate: Date.now(),
    mode: "credit" as const,
    customerName: "Ravi Kumar",
    customerMobile: "+919876543210",
    products: [
      {
        productName: "Phone",
        brandModel: "A1",
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

function packInput(clientRecordId: string) {
  return {
    clientRecordId,
    ueid: "VYD-2026-BILL01" as const,
    professionalCategory: "ca_tax" as const,
    matterType: "gst_return_support" as const,
    title: "GST return support pack",
    facts: { period: "2026-09", notes: "brief" },
    matterDate: Date.now(),
  };
}

function parsePo(id: string, raw: Record<string, unknown>): PurchaseOrder {
  return { ...(raw as object), id } as PurchaseOrder;
}
function parseCredit(id: string, raw: Record<string, unknown>): CustomerCreditRecord {
  return { ...(raw as object), id } as CustomerCreditRecord;
}

async function counterNext(uid: string, counterId: string): Promise<number | null> {
  const snap = await getDoc(doc(authedDb(uid), "users", uid, "counters", counterId));
  if (!snap.exists()) return null;
  const n = (snap.data() as { next?: number }).next;
  return typeof n === "number" ? n : null;
}

async function usageCount(uid: string): Promise<number | null> {
  const snap = await getDoc(
    doc(authedDb(uid), "users", uid, "subscription", "usageCurrent")
  );
  if (!snap.exists()) return null;
  return Number((snap.data() as { recordsThisMonth?: number }).recordsThisMonth);
}

async function main() {
  console.log("firestore.rules phase-G quota emulator tests");
  const rules = readFileSync(RULES_PATH, "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules },
  });
  await testEnv.clearFirestore();
  const monthNow = istMonthKeyForMillis(Date.now());
  const monthPrev = (() => {
    const [y, m] = monthNow.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 2, 1));
    const mm = d.getUTCMonth() + 1;
    return `${d.getUTCFullYear()}-${mm < 10 ? `0${mm}` : mm}`;
  })();

  try {
    // A. Flag off — create works without usage; standalone usage denied.
    await seedUser("flag-off-g");
    await seedStatus("flag-off-g", { quotaEnforcementEnabled: false });
    const offPo = await createPurchaseOrderAtomic(
      authedDb("flag-off-g"),
      "flag-off-g",
      poInput("po_off_1"),
      parsePo
    );
    check("A PO flag-off create without usage", offPo.serial === 1 && offPo.id === "po_off_1");
    check("A PO flag-off did not write usage", (await usageCount("flag-off-g")) == null);
    check("A PO flag-off serial=1", (await counterNext("flag-off-g", "purchaseOrder")) === 1);
    await assertFails(
      setDoc(
        doc(authedDb("flag-off-g"), "users", "flag-off-g", "subscription", "usageCurrent"),
        usageDoc(monthNow, 1, "po_off_2")
      )
    );
    check("A standalone usage denied while flag off", true);

    const offCr = await createCustomerCreditAtomic(
      authedDb("flag-off-g"),
      "flag-off-g",
      creditInput("cr_off_1"),
      parseCredit
    );
    check("A CC flag-off create without usage", offCr.serial === 1);
    const offPk = await createProfessionalPackAtomic(
      authedDb("flag-off-g"),
      "flag-off-g",
      packInput("pk_off_1")
    );
    check("A pack flag-off create without usage", offPk.id === "pk_off_1");
    check("A flag-off still no usage after CC/pack", (await usageCount("flag-off-g")) == null);

    // B/C/D PO flag on
    await seedUser("g-po");
    await seedStatus("g-po", { quotaEnforcementEnabled: true, plan: "free", entitlementActive: true });
    const po1 = await createPurchaseOrderAtomic(authedDb("g-po"), "g-po", poInput("po_on_1"), parsePo);
    check("B PO flag-on consumes one slot", po1.serial === 1 && (await usageCount("g-po")) === 1);

    await assertFails(
      setDoc(doc(authedDb("g-po"), "users", "g-po", "purchaseOrders", "po_bare"), {
        userId: "g-po",
        vendorName: "No Usage",
      })
    );
    check("C PO create without usage denied", true);

    await assertFails(
      setDoc(
        doc(authedDb("g-po"), "users", "g-po", "subscription", "usageCurrent"),
        usageDoc(monthNow, 2, "ghost")
      )
    );
    check("D standalone increment denied", true);
    await assertFails(
      setDoc(
        doc(authedDb("g-po"), "users", "g-po", "subscription", "usageCurrent"),
        usageDoc(monthNow, 2, "po_on_1")
      )
    );
    check("D existing-record pointer increment denied", true);

    // Wrong pointer: usage points at pack while creating PO
    await assertFails(
      (() => {
        const db = authedDb("g-po");
        const b = writeBatch(db);
        b.set(doc(db, "users", "g-po", "purchaseOrders", "po_wrong"), {
          userId: "g-po",
          vendorName: "X",
        });
        b.set(
          doc(db, "users", "g-po", "subscription", "usageCurrent"),
          usageDoc(monthNow, 2, "pk_other", "professionalPacks")
        );
        return b.commit();
      })()
    );
    check("D wrong-collection pointer denied", true);

    // Two different records + one usage increment must fail.
    await assertFails(
      (() => {
        const db = authedDb("g-po");
        const b = writeBatch(db);
        b.set(doc(db, "users", "g-po", "purchaseOrders", "po_multi_a"), {
          userId: "g-po",
          vendorName: "A",
        });
        b.set(doc(db, "users", "g-po", "purchaseOrders", "po_multi_b"), {
          userId: "g-po",
          vendorName: "B",
        });
        b.set(
          doc(db, "users", "g-po", "subscription", "usageCurrent"),
          usageDoc(monthNow, 2, "po_multi_a")
        );
        return b.commit();
      })()
    );
    check("D two POs with one usage increment denied", true);

    await assertFails(
      (() => {
        const db = authedDb("g-po");
        const b = writeBatch(db);
        b.set(doc(db, "users", "g-po", "customerCreditRecords", "cr_x"), {
          userId: "g-po",
          customerName: "X",
        });
        b.set(
          doc(db, "users", "g-po", "subscription", "usageCurrent"),
          usageDoc(monthNow, 2, "po_on_1")
        );
        return b.commit();
      })()
    );
    check("D CC create with usage pointing at existing PO denied", true);

    // I. Non-billable PO edit
    await assertSucceeds(
      updateDoc(doc(authedDb("g-po"), "users", "g-po", "purchaseOrders", "po_on_1"), {
        vendorName: "Edited Vendor",
        updatedAt: Date.now(),
      })
    );
    check("I PO edit does not require usage", (await usageCount("g-po")) === 1);

    // G/H replay / ambiguous retry
    const replay = await createPurchaseOrderAtomic(
      authedDb("g-po"),
      "g-po",
      poInput("po_on_1"),
      parsePo
    );
    check("G/H same-id retry returns existing", replay.id === "po_on_1" && replay.serial === 1);
    check("G/H retry does not increment usage", (await usageCount("g-po")) === 1);
    check("G/H retry does not increment serial", (await counterNext("g-po", "purchaseOrder")) === 1);

    // E same-id concurrency
    await seedUser("g-same");
    await seedStatus("g-same", { quotaEnforcementEnabled: true, plan: "free", entitlementActive: true });
    const sameResults = await Promise.allSettled([
      createPurchaseOrderAtomic(authedDb("g-same"), "g-same", poInput("po_same"), parsePo),
      createPurchaseOrderAtomic(authedDb("g-same"), "g-same", poInput("po_same"), parsePo),
    ]);
    const sameOk = sameResults.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<PurchaseOrder>[];
    check(
      "E same-id concurrency at least one returns the record",
      sameOk.length >= 1 && sameOk.every((r) => r.value.id === "po_same" && r.value.serial === 1),
      `fulfilled=${sameOk.length}`
    );
    check("E same-id one quota increment", (await usageCount("g-same")) === 1);
    check("E same-id one serial", (await counterNext("g-same", "purchaseOrder")) === 1);

    // F final-slot concurrency
    await seedUser("g-race");
    await seedStatus("g-race", { quotaEnforcementEnabled: true, plan: "free", entitlementActive: true });
    await seedUsage("g-race", usageDoc(monthNow, 24, "seed"));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", "g-race", "counters", "purchaseOrder"), {
        next: 10,
        updatedAt: Date.now(),
      });
    });
    const firstRace = await createPurchaseOrderAtomic(
      authedDb("g-race"),
      "g-race",
      poInput("po_race_a"),
      parsePo
    );
    check("F sequential winner at final slot", firstRace.id === "po_race_a" && (await usageCount("g-race")) === 25);
    check("F winner serial 11", firstRace.serial === 11);
    let raceLoserKind: string | null = null;
    try {
      await createPurchaseOrderAtomic(authedDb("g-race"), "g-race", poInput("po_race_b"), parsePo);
    } catch (e) {
      raceLoserKind = classifyAtomicCreateError(e);
    }
    check("F sequential loser quota_exhausted", raceLoserKind === "quota_exhausted");
    check("F loser did not increment serial", (await counterNext("g-race", "purchaseOrder")) === 11);
    check(
      "F loser record absent",
      !(await getDoc(doc(authedDb("g-race"), "users", "g-race", "purchaseOrders", "po_race_b"))).exists()
    );
    const replayAtCap = await createPurchaseOrderAtomic(
      authedDb("g-race"),
      "g-race",
      poInput("po_race_a"),
      parsePo
    );
    check(
      "G replay at full quota returns existing",
      replayAtCap.id === "po_race_a" && replayAtCap.serial === 11
    );
    check("G replay at full quota does not increment usage", (await usageCount("g-race")) === 25);
    check(
      "G replay at full quota does not increment serial",
      (await counterNext("g-race", "purchaseOrder")) === 11
    );

    await seedUser("g-race-batch");
    await seedStatus("g-race-batch", {
      quotaEnforcementEnabled: true,
      plan: "free",
      entitlementActive: true,
    });
    await seedUsage("g-race-batch", usageDoc(monthNow, 24, "seed"));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", "g-race-batch", "counters", "purchaseOrder"), {
        next: 10,
        updatedAt: Date.now(),
      });
    });
    function productionPoBatch(uid: string, poId: string, serial: number) {
      const db = authedDb(uid);
      const b = writeBatch(db);
      b.set(doc(db, "users", uid, "counters", "purchaseOrder"), { next: serial, updatedAt: Date.now() });
      b.set(doc(db, "users", uid, "purchaseOrders", poId), {
        userId: uid,
        ueid: "VYD-2026-BILL01",
        serial,
        poNumber: `VYD-PO-${String(serial).padStart(4, "0")}`,
        status: "active",
        vendorName: "Acme Supplies Private Limited",
        buyerName: "Test Buyer",
        items: [{ itemName: "Widget", quantity: 1, rate: 1, amount: 1 }],
        total: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      b.set(doc(db, "users", uid, "subscription", "usageCurrent"), usageDoc(monthNow, 25, poId));
      return b.commit();
    }
    const batchRace = await Promise.allSettled([
      productionPoBatch("g-race-batch", "po_batch_a", 11),
      productionPoBatch("g-race-batch", "po_batch_b", 11),
    ]);
    const batchWins = batchRace.filter((r) => r.status === "fulfilled").length;
    check(
      "F production-shaped concurrent batches: exactly one commit",
      batchWins === 1,
      `fulfilled=${batchWins}`
    );

    // J plan / malformed / missing status
    await seedUser("g-nostatus");
    const legacy = await createPurchaseOrderAtomic(
      authedDb("g-nostatus"),
      "g-nostatus",
      poInput("po_legacy"),
      parsePo
    );
    check("J missing status → enforcement off create", legacy.serial === 1);
    check("J missing status wrote no usage", (await usageCount("g-nostatus")) == null);

    await seedUser("g-malformed-usage");
    await seedStatus("g-malformed-usage", {
      quotaEnforcementEnabled: true,
      plan: "free",
      entitlementActive: true,
    });
    await seedUsage("g-malformed-usage", {
      monthKey: "not-a-month",
      recordsThisMonth: 3,
      lastRecordCollection: "purchaseOrders",
      lastRecordId: "x",
      updatedAt: Date.now(),
    });
    let malformedCode: string | null = null;
    try {
      await createPurchaseOrderAtomic(
        authedDb("g-malformed-usage"),
        "g-malformed-usage",
        poInput("po_bad_usage"),
        parsePo
      );
    } catch (e) {
      malformedCode = e instanceof AppError ? e.code : classifyAtomicCreateError(e);
    }
    check("J malformed usage fails closed", malformedCode === "quota_state_invalid");
    check(
      "J malformed usage did not create record",
      !(
        await getDoc(
          doc(authedDb("g-malformed-usage"), "users", "g-malformed-usage", "purchaseOrders", "po_bad_usage")
        )
      ).exists()
    );
    check(
      "J malformed usage did not allocate serial",
      (await counterNext("g-malformed-usage", "purchaseOrder")) == null
    );

    // K client/server month disagreement
    await seedUser("g-month");
    await seedStatus("g-month", { quotaEnforcementEnabled: true, plan: "free", entitlementActive: true });
    let monthKind: string | null = null;
    try {
      await runAtomicBillableCreate({
        db: authedDb("g-month"),
        userId: "g-month",
        collection: "purchaseOrders",
        recordId: "po_wrong_month",
        serialCounter: "purchaseOrder",
        nowMs: Date.now(),
        monthKey: monthPrev,
        parseExisting: parsePo,
        buildNew: (serial) => {
          const record = buildPurchaseOrderRecord(
            "g-month",
            "po_wrong_month",
            serial ?? 1,
            poInput("po_wrong_month"),
            Date.now()
          );
          const { pdfUri: _omit, ...rest } = record;
          return { record, payload: { ...rest, pdfUri: null } };
        },
      });
    } catch (e) {
      monthKind = classifyAtomicCreateError(e);
    }
    check(
      "K client previous-month key is permission_denied not quota_exhausted",
      monthKind === "permission_denied"
    );

    await seedUser("g-rollover");
    await seedStatus("g-rollover", { quotaEnforcementEnabled: true, plan: "free", entitlementActive: true });
    await seedUsage("g-rollover", usageDoc(monthPrev, 25, "old"));
    const rolled = await createPurchaseOrderAtomic(
      authedDb("g-rollover"),
      "g-rollover",
      poInput("po_rollover"),
      parsePo
    );
    check("K new-month rollover create succeeds", rolled.serial === 1);
    check("K new-month usage resets to 1", (await usageCount("g-rollover")) === 1);

    // L cross-UID
    await assertFails(
      createPurchaseOrderAtomic(authedDb("g-po"), "g-month", poInput("po_xuid"), parsePo)
    );
    check("L cross-UID PO create denied", true);

    // Entries / letterhead remain ungated this round
    await seedUser("g-unlinked");
    await seedStatus("g-unlinked", { quotaEnforcementEnabled: true, plan: "free", entitlementActive: true });
    await assertSucceeds(
      setDoc(doc(authedDb("g-unlinked"), "users", "g-unlinked", "entries", "e1"), {
        userId: "g-unlinked",
        title: "Diary entry",
        createdAt: Date.now(),
      })
    );
    check("entries CREATE still ungated this round", true);
    await assertSucceeds(
      setDoc(doc(authedDb("g-unlinked"), "users", "g-unlinked", "letterheadDocs", "lh1"), {
        userId: "g-unlinked",
        createdAt: Date.now(),
      })
    );
    check("letterheadDocs CREATE still ungated this round", true);

    // B CC + packs flag on
    await seedUser("g-cc");
    await seedStatus("g-cc", { quotaEnforcementEnabled: true, plan: "starter", entitlementActive: true });
    const cr1 = await createCustomerCreditAtomic(
      authedDb("g-cc"),
      "g-cc",
      creditInput("cr_on_1"),
      parseCredit
    );
    check("B CC flag-on consumes one slot", cr1.serial === 1 && (await usageCount("g-cc")) === 1);
    await assertFails(
      setDoc(doc(authedDb("g-cc"), "users", "g-cc", "customerCreditRecords", "cr_bare"), {
        userId: "g-cc",
        customerName: "Bare",
      })
    );
    check("C CC create without usage denied", true);
    const crReplay = await createCustomerCreditAtomic(
      authedDb("g-cc"),
      "g-cc",
      creditInput("cr_on_1"),
      parseCredit
    );
    check("G CC replay no extra serial/usage", crReplay.serial === 1 && (await usageCount("g-cc")) === 1);

    await seedUser("g-pk");
    await seedStatus("g-pk", { quotaEnforcementEnabled: true, plan: "business", entitlementActive: true });
    await seedUsage("g-pk", usageDoc(monthNow, 500, "seed", "professionalPacks"));
    const pk1 = await createProfessionalPackAtomic(authedDb("g-pk"), "g-pk", packInput("pk_on_1"));
    check("B/J pack unlimited still writes usage 501", pk1.id === "pk_on_1" && (await usageCount("g-pk")) === 501);
    const pkReplay = await createProfessionalPackAtomic(authedDb("g-pk"), "g-pk", packInput("pk_on_1"));
    check("G pack replay no extra usage", pkReplay.id === "pk_on_1" && (await usageCount("g-pk")) === 501);

    await assertFails(
      setDoc(doc(authedDb("g-pk"), "users", "g-pk", "professionalPacks", "pk_bare"), {
        userId: "g-pk",
        title: "Bare pack",
      })
    );
    check("C pack create without usage denied", true);

    await assertSucceeds(
      updateDoc(doc(authedDb("g-pk"), "users", "g-pk", "professionalPacks", "pk_on_1"), {
        title: "Edited pack",
        updatedAt: Date.now(),
      })
    );
    check("I pack edit does not consume quota", (await usageCount("g-pk")) === 501);

    // CC payment-shaped update (non-billable)
    await assertSucceeds(
      updateDoc(doc(authedDb("g-cc"), "users", "g-cc", "customerCreditRecords", "cr_on_1"), {
        userId: "g-cc",
        remarks: "payment appended locally in test",
        updatedAt: Date.now(),
      })
    );
    check("I CC update/payment-shaped write does not consume", (await usageCount("g-cc")) === 1);

    // Inactive entitlement uses free cap
    await seedUser("g-lapsed");
    await seedStatus("g-lapsed", {
      quotaEnforcementEnabled: true,
      plan: "starter",
      entitlementActive: false,
    });
    await seedUsage("g-lapsed", usageDoc(monthNow, 25, "seed"));
    let lapsedKind: string | null = null;
    try {
      await createPurchaseOrderAtomic(authedDb("g-lapsed"), "g-lapsed", poInput("po_lapsed"), parsePo);
    } catch (e) {
      lapsedKind = classifyAtomicCreateError(e);
    }
    check("J inactive entitlement exhausts at free 25", lapsedKind === "quota_exhausted");

    await seedUser("g-malformed-plan");
    await seedStatus("g-malformed-plan", {
      quotaEnforcementEnabled: true,
      plan: "proffesional",
      entitlementActive: true,
    });
    await seedUsage("g-malformed-plan", usageDoc(monthNow, 25, "seed"));
    let malformedPlanKind: string | null = null;
    try {
      await createPurchaseOrderAtomic(
        authedDb("g-malformed-plan"),
        "g-malformed-plan",
        poInput("po_bad_plan"),
        parsePo
      );
    } catch (e) {
      malformedPlanKind = classifyAtomicCreateError(e);
    }
    check("J malformed plan fail-closed at free 25", malformedPlanKind === "quota_exhausted");

    await seedUser("g-starter");
    await seedStatus("g-starter", {
      quotaEnforcementEnabled: true,
      plan: "starter",
      entitlementActive: true,
    });
    await seedUsage("g-starter", usageDoc(monthNow, 25, "seed"));
    const starterPo = await createPurchaseOrderAtomic(
      authedDb("g-starter"),
      "g-starter",
      poInput("po_starter_26"),
      parsePo
    );
    check("J starter cap 100 allows create at 26", starterPo.serial === 1 && (await usageCount("g-starter")) === 26);

    // Access budget (N): each document in a transaction is evaluated separately.
    // Per-evaluation get/exists/getAfter (cached same-path reads count once):
    //   PO create: isActiveUser get(users/uid)=1
    //              quotaEnforcementOn exists+get(status)=1
    //              usageConsumedForRecord getAfter(usage)=1 + exists+get(usage)=1
    //              ≈ 4 of the 10 per-request access limit.
    //   usageCurrent update: isActiveUser=1, quotaEnforcementOn=1,
    //              usageLinkedRecordCreatedInBatch exists+existsAfter(record)=2
    //              ≈ 4 of 10.
    //   counter create/update: isActiveUser=1, serial validators use request/resource only
    //              ≈ 1 of 10.
    // _saveLocks is a separate pre-create write, not part of this transaction.
    // These production-shaped PO/CC/pack transactions succeeding is the budget proof;
    // a tiny fixture is not treated as evidence.
    check(
      "N production-shaped PO atomic create succeeded (Rules access budget held)",
      po1.serial === 1
    );
    check(
      "N production-shaped CC atomic create succeeded (Rules access budget held)",
      cr1.serial === 1
    );
    check(
      "N production-shaped pack atomic create succeeded (Rules access budget held)",
      pk1.id === "pk_on_1"
    );

    // Account blocked
    await seedUser("g-blocked", { status: "pending_deletion" });
    await seedStatus("g-blocked", { quotaEnforcementEnabled: false });
    let blockedKind: string | null = null;
    try {
      await createPurchaseOrderAtomic(
        authedDb("g-blocked"),
        "g-blocked",
        poInput("po_blocked"),
        parsePo
      );
    } catch (e) {
      blockedKind = classifyAtomicCreateError(e);
    }
    check("L inactive account create is permission_denied not quota", blockedKind === "permission_denied");
  } finally {
    await testEnv.cleanup();
  }

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }
  console.log("all firestore.rules phase-G quota tests passed");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
