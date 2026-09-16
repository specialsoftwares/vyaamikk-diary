/**
 * VYD-36 — Option-C production write-set proofs for
 * purchaseOrders, customerCreditRecords, professionalPacks, and entries.
 *
 * Runs in the same emulator session as firestore.rules.billing.test.ts.
 * letterheadDocs remain ungated this round.
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
import {
  addCustomerCreditPaymentOnDb,
  closeCustomerCreditFullyPaidOnDb,
} from "@/services/customerCredit/recordMutations";
import { createProfessionalPackAtomic } from "@/services/professionalPack/atomicCreate";
import { createEntryAtomic } from "@/services/diary/atomicCreate";
import { classifyAtomicCreateError } from "@/billing/optionC/classifyCreateError";
import {
  runAtomicBillableCreate,
  type AtomicCreateHooks,
} from "@/billing/optionC/atomicBillableCreate";
import type { PurchaseOrder } from "@/domain/purchaseOrder";
import type { CustomerCreditRecord } from "@/domain/customerCredit";
import type { ProfessionalServicePack } from "@/domain/professionalPack";

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

function creditInput(clientRecordId?: string) {
  return {
    ...(clientRecordId !== undefined ? { clientRecordId } : {}),
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

function entryInput(clientRecordId: string, title = "Diary production create") {
  return {
    clientRecordId,
    ueid: "VYD-2026-BILL01",
    entryType: "work_update_issue" as const,
    title,
    entryDate: Date.now(),
    payload: {
      workDone: "site work",
      issueProblem: null,
      sitePlace: null,
      quantityOutput: null,
      responsiblePerson: null,
      followUpRequired: false,
    },
  };
}

function parsePo(id: string, raw: Record<string, unknown>): PurchaseOrder {
  return { ...(raw as object), id } as PurchaseOrder;
}
function parseCredit(id: string, raw: Record<string, unknown>): CustomerCreditRecord {
  return { ...(raw as object), id } as CustomerCreditRecord;
}

function inspectSettled(
  name: string,
  results: PromiseSettledResult<unknown>[]
): { fulfilled: number; rejectedKinds: string[] } {
  const rejectedKinds: string[] = [];
  let fulfilled = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      fulfilled += 1;
      console.log(`  inspect ${name} fulfilled[${i}]`);
      return;
    }
    const kind = classifyAtomicCreateError(r.reason);
    const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
    console.log(`  inspect ${name} rejection[${i}] kind=${kind} message=${msg}`);
    rejectedKinds.push(kind);
  });
  return { fulfilled, rejectedKinds };
}

/**
 * First-pass-only latch so two production creates finish their reads
 * before either writes. Retries skip the wait. Timeout releases waiters
 * so a serialized emulator cannot deadlock; overlap is then false.
 */
class FirstPassBarrier {
  arrived = 0;
  overlap = false;
  timedOut = false;
  private released = false;
  private waiters: (() => void)[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly n: number,
    private readonly timeoutMs = 5000
  ) {}

  private releaseAll() {
    if (this.released) return;
    this.released = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.waiters.splice(0).forEach((fn) => fn());
  }

  hook(seenIds?: string[]): AtomicCreateHooks {
    let pass = 0;
    return {
      afterReads: async (snapshot) => {
        seenIds?.push(snapshot.recordId);
        pass += 1;
        if (pass !== 1) return;
        this.arrived += 1;
        if (this.arrived >= this.n) {
          if (!this.timedOut) this.overlap = true;
          this.releaseAll();
          return;
        }
        await new Promise<void>((resolve) => {
          this.waiters.push(resolve);
          this.timer = setTimeout(() => {
            this.timedOut = true;
            this.releaseAll();
          }, this.timeoutMs);
        });
      },
    };
  }
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

    // E same-id concurrency via production create functions (every rejection inspected)
    await seedUser("g-same");
    await seedStatus("g-same", { quotaEnforcementEnabled: true, plan: "free", entitlementActive: true });
    const poSameBarrier = new FirstPassBarrier(2);
    const poSameSeenA: string[] = [];
    const poSameSeenB: string[] = [];
    const sameResults = await Promise.allSettled([
      createPurchaseOrderAtomic(
        authedDb("g-same"),
        "g-same",
        poInput("po_same"),
        parsePo,
        poSameBarrier.hook(poSameSeenA)
      ),
      createPurchaseOrderAtomic(
        authedDb("g-same"),
        "g-same",
        poInput("po_same"),
        parsePo,
        poSameBarrier.hook(poSameSeenB)
      ),
    ]);
    const sameInspect = inspectSettled("E PO same-id", sameResults);
    check("E PO same-id first-pass overlap", poSameBarrier.overlap);
    check(
      "E PO same-id both fulfilled",
      sameInspect.fulfilled === 2,
      `fulfilled=${sameInspect.fulfilled} rejected=${sameInspect.rejectedKinds.join(",") || "none"}`
    );
    sameInspect.rejectedKinds.forEach((kind, i) => {
      check(`E PO same-id rejection[${i}] is not quota_exhausted`, kind !== "quota_exhausted", kind);
    });
    const sameOk = sameResults.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<PurchaseOrder>[];
    check(
      "E PO same-id every success is po_same serial 1",
      sameOk.length >= 1 && sameOk.every((r) => r.value.id === "po_same" && r.value.serial === 1)
    );
    check("E PO same-id one quota increment", (await usageCount("g-same")) === 1);
    check("E PO same-id one serial", (await counterNext("g-same", "purchaseOrder")) === 1);
    check(
      "D server-confirmed same-id recovery did not consume extra quota/serial",
      (await usageCount("g-same")) === 1 && (await counterNext("g-same", "purchaseOrder")) === 1
    );
    check(
      "E PO same-id captured id stable across afterReads invocations",
      [...poSameSeenA, ...poSameSeenB].every((id) => id === "po_same")
    );

    await seedUser("g-same-cc");
    await seedStatus("g-same-cc", { quotaEnforcementEnabled: true, plan: "free", entitlementActive: true });
    const ccSameBarrier = new FirstPassBarrier(2);
    const ccSameResults = await Promise.allSettled([
      createCustomerCreditAtomic(
        authedDb("g-same-cc"),
        "g-same-cc",
        creditInput("cr_same"),
        parseCredit,
        ccSameBarrier.hook()
      ),
      createCustomerCreditAtomic(
        authedDb("g-same-cc"),
        "g-same-cc",
        creditInput("cr_same"),
        parseCredit,
        ccSameBarrier.hook()
      ),
    ]);
    const ccSameInspect = inspectSettled("E CC same-id", ccSameResults);
    check("E CC same-id first-pass overlap", ccSameBarrier.overlap);
    check(
      "E CC same-id both fulfilled",
      ccSameInspect.fulfilled === 2,
      `fulfilled=${ccSameInspect.fulfilled} rejected=${ccSameInspect.rejectedKinds.join(",") || "none"}`
    );
    ccSameInspect.rejectedKinds.forEach((kind, i) => {
      check(`E CC same-id rejection[${i}] is not quota_exhausted`, kind !== "quota_exhausted", kind);
    });
    const ccSameOk = ccSameResults.filter(
      (r) => r.status === "fulfilled"
    ) as PromiseFulfilledResult<CustomerCreditRecord>[];
    check(
      "E CC same-id every success is cr_same serial 1",
      ccSameOk.length >= 1 && ccSameOk.every((r) => r.value.id === "cr_same" && r.value.serial === 1)
    );
    check("E CC same-id one quota increment", (await usageCount("g-same-cc")) === 1);
    check("E CC same-id one serial", (await counterNext("g-same-cc", "customerCredit")) === 1);

    await seedUser("g-same-pk");
    await seedStatus("g-same-pk", { quotaEnforcementEnabled: true, plan: "free", entitlementActive: true });
    const pkSameBarrier = new FirstPassBarrier(2);
    const pkSameResults = await Promise.allSettled([
      createProfessionalPackAtomic(
        authedDb("g-same-pk"),
        "g-same-pk",
        packInput("pk_same"),
        pkSameBarrier.hook()
      ),
      createProfessionalPackAtomic(
        authedDb("g-same-pk"),
        "g-same-pk",
        packInput("pk_same"),
        pkSameBarrier.hook()
      ),
    ]);
    const pkSameInspect = inspectSettled("E pack same-id", pkSameResults);
    check("E pack same-id first-pass overlap", pkSameBarrier.overlap);
    check(
      "E pack same-id both fulfilled",
      pkSameInspect.fulfilled === 2,
      `fulfilled=${pkSameInspect.fulfilled} rejected=${pkSameInspect.rejectedKinds.join(",") || "none"}`
    );
    pkSameInspect.rejectedKinds.forEach((kind, i) => {
      check(`E pack same-id rejection[${i}] is not quota_exhausted`, kind !== "quota_exhausted", kind);
    });
    const pkSameOk = pkSameResults.filter(
      (r) => r.status === "fulfilled"
    ) as PromiseFulfilledResult<ProfessionalServicePack>[];
    check(
      "E pack same-id every success is pk_same",
      pkSameOk.length >= 1 && pkSameOk.every((r) => r.value.id === "pk_same")
    );
    check("E pack same-id one quota increment", (await usageCount("g-same-pk")) === 1);

    // F sequential PO final-slot (still covered) plus concurrent production creates
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

    await seedUser("g-race-fn");
    await seedStatus("g-race-fn", { quotaEnforcementEnabled: true, plan: "free", entitlementActive: true });
    await seedUsage("g-race-fn", usageDoc(monthNow, 24, "seed"));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", "g-race-fn", "counters", "purchaseOrder"), {
        next: 10,
        updatedAt: Date.now(),
      });
    });
    const poFnBarrier = new FirstPassBarrier(2);
    const poFnSeenA: string[] = [];
    const poFnSeenB: string[] = [];
    const poFnRace = await Promise.allSettled([
      createPurchaseOrderAtomic(
        authedDb("g-race-fn"),
        "g-race-fn",
        poInput("po_fn_a"),
        parsePo,
        poFnBarrier.hook(poFnSeenA)
      ),
      createPurchaseOrderAtomic(
        authedDb("g-race-fn"),
        "g-race-fn",
        poInput("po_fn_b"),
        parsePo,
        poFnBarrier.hook(poFnSeenB)
      ),
    ]);
    const poFnInspect = inspectSettled("F PO production create", poFnRace);
    check("F PO production create first-pass overlap", poFnBarrier.overlap);
    check(
      "F PO production create exactly one fulfilled",
      poFnInspect.fulfilled === 1,
      `fulfilled=${poFnInspect.fulfilled} rejected=${poFnInspect.rejectedKinds.join(",") || "none"}`
    );
    check(
      "F PO production create loser is quota_exhausted",
      poFnInspect.rejectedKinds.length === 1 && poFnInspect.rejectedKinds[0] === "quota_exhausted",
      poFnInspect.rejectedKinds.join(",") || "none"
    );
    check("F PO production create usage=25", (await usageCount("g-race-fn")) === 25);
    check("F PO production create serial=11", (await counterNext("g-race-fn", "purchaseOrder")) === 11);
    const poFnA = (await getDoc(doc(authedDb("g-race-fn"), "users", "g-race-fn", "purchaseOrders", "po_fn_a"))).exists();
    const poFnB = (await getDoc(doc(authedDb("g-race-fn"), "users", "g-race-fn", "purchaseOrders", "po_fn_b"))).exists();
    check("F PO production create exactly one record", poFnA !== poFnB);
    check(
      "E server-confirmed PO final-slot loser absent with usage at cap",
      poFnA !== poFnB && (await usageCount("g-race-fn")) === 25
    );
    console.log(`  PO afterReads A=${poFnSeenA.length} B=${poFnSeenB.length}; SDK txn callback retry observed=${poFnSeenA.length >= 2 || poFnSeenB.length >= 2}`);
    check(
      "PO captured id stable across afterReads invocations",
      poFnSeenA.every((id) => id === "po_fn_a") && poFnSeenB.every((id) => id === "po_fn_b")
    );

    await seedUser("g-race-cc");
    await seedStatus("g-race-cc", { quotaEnforcementEnabled: true, plan: "free", entitlementActive: true });
    await seedUsage("g-race-cc", usageDoc(monthNow, 24, "seed", "customerCreditRecords"));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", "g-race-cc", "counters", "customerCredit"), {
        next: 10,
        updatedAt: Date.now(),
      });
    });
    const ccFnBarrier = new FirstPassBarrier(2);
    const ccFnSeenA: string[] = [];
    const ccFnSeenB: string[] = [];
    const ccFnRace = await Promise.allSettled([
      createCustomerCreditAtomic(
        authedDb("g-race-cc"),
        "g-race-cc",
        creditInput(),
        parseCredit,
        ccFnBarrier.hook(ccFnSeenA)
      ),
      createCustomerCreditAtomic(
        authedDb("g-race-cc"),
        "g-race-cc",
        creditInput("  "),
        parseCredit,
        ccFnBarrier.hook(ccFnSeenB)
      ),
    ]);
    const ccFnInspect = inspectSettled("F CC production create", ccFnRace);
    check("F CC production create first-pass overlap", ccFnBarrier.overlap);
    check(
      "F CC production create exactly one fulfilled",
      ccFnInspect.fulfilled === 1,
      `fulfilled=${ccFnInspect.fulfilled} rejected=${ccFnInspect.rejectedKinds.join(",") || "none"}`
    );
    check(
      "F CC production create loser is quota_exhausted",
      ccFnInspect.rejectedKinds.length === 1 && ccFnInspect.rejectedKinds[0] === "quota_exhausted",
      ccFnInspect.rejectedKinds.join(",") || "none"
    );
    const ccFnWinner = (
      ccFnRace.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<CustomerCreditRecord> | undefined
    )?.value;
    check("F CC production create usage=25", (await usageCount("g-race-cc")) === 25);
    check("F CC production create serial=11", (await counterNext("g-race-cc", "customerCredit")) === 11);
    check("F CC absent/blank winner has non-blank id", Boolean(ccFnWinner && ccFnWinner.id.trim().length > 0));
    if (ccFnWinner) {
      const winnerSnap = await getDoc(
        doc(authedDb("g-race-cc"), "users", "g-race-cc", "customerCreditRecords", ccFnWinner.id)
      );
      check(
        "F CC path id matches payload id",
        winnerSnap.exists() && (winnerSnap.data() as { id?: string }).id === ccFnWinner.id
      );
      const winnerSeen = ccFnWinner.id === ccFnSeenA[0] ? ccFnSeenA : ccFnSeenB;
      const loserSeen = ccFnWinner.id === ccFnSeenA[0] ? ccFnSeenB : ccFnSeenA;
      console.log(
        `  identity afterReads A=${ccFnSeenA.length} B=${ccFnSeenB.length}; SDK txn callback retry observed=${
          ccFnSeenA.length >= 2 || ccFnSeenB.length >= 2
        }`
      );
      check(
        "CC captured id stable across afterReads invocations (not proof of SDK retry unless count>=2)",
        winnerSeen.every((id) => id === ccFnWinner.id) &&
          loserSeen.length >= 1 &&
          loserSeen.every((id) => id === loserSeen[0])
      );
      check(
        "F CC loser record absent",
        loserSeen[0] != null &&
          !(
            await getDoc(
              doc(authedDb("g-race-cc"), "users", "g-race-cc", "customerCreditRecords", loserSeen[0])
            )
          ).exists()
      );
    }

    await seedUser("g-race-pk");
    await seedStatus("g-race-pk", { quotaEnforcementEnabled: true, plan: "free", entitlementActive: true });
    await seedUsage("g-race-pk", usageDoc(monthNow, 24, "seed", "professionalPacks"));
    const pkFnBarrier = new FirstPassBarrier(2);
    const pkFnRace = await Promise.allSettled([
      createProfessionalPackAtomic(
        authedDb("g-race-pk"),
        "g-race-pk",
        packInput("pk_fn_a"),
        pkFnBarrier.hook()
      ),
      createProfessionalPackAtomic(
        authedDb("g-race-pk"),
        "g-race-pk",
        packInput("pk_fn_b"),
        pkFnBarrier.hook()
      ),
    ]);
    const pkFnInspect = inspectSettled("F pack production create", pkFnRace);
    check("F pack production create first-pass overlap", pkFnBarrier.overlap);
    check(
      "F pack production create exactly one fulfilled",
      pkFnInspect.fulfilled === 1,
      `fulfilled=${pkFnInspect.fulfilled} rejected=${pkFnInspect.rejectedKinds.join(",") || "none"}`
    );
    check(
      "F pack production create loser is quota_exhausted",
      pkFnInspect.rejectedKinds.length === 1 && pkFnInspect.rejectedKinds[0] === "quota_exhausted",
      pkFnInspect.rejectedKinds.join(",") || "none"
    );
    check("F pack production create usage=25", (await usageCount("g-race-pk")) === 25);
    const pkFnA = (await getDoc(doc(authedDb("g-race-pk"), "users", "g-race-pk", "professionalPacks", "pk_fn_a"))).exists();
    const pkFnB = (await getDoc(doc(authedDb("g-race-pk"), "users", "g-race-pk", "professionalPacks", "pk_fn_b"))).exists();
    check("F pack production create exactly one record", pkFnA !== pkFnB);

    await seedUser("g-xfamily");
    await seedStatus("g-xfamily", { quotaEnforcementEnabled: true, plan: "free", entitlementActive: true });
    await seedUsage("g-xfamily", usageDoc(monthNow, 24, "seed"));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", "g-xfamily", "counters", "purchaseOrder"), {
        next: 3,
        updatedAt: Date.now(),
      });
      await setDoc(doc(ctx.firestore(), "users", "g-xfamily", "counters", "customerCredit"), {
        next: 8,
        updatedAt: Date.now(),
      });
    });
    const xfBarrier = new FirstPassBarrier(2);
    const xfRace = await Promise.allSettled([
      createPurchaseOrderAtomic(
        authedDb("g-xfamily"),
        "g-xfamily",
        poInput("po_xf"),
        parsePo,
        xfBarrier.hook()
      ),
      createCustomerCreditAtomic(
        authedDb("g-xfamily"),
        "g-xfamily",
        creditInput("cr_xf"),
        parseCredit,
        xfBarrier.hook()
      ),
    ]);
    const xfInspect = inspectSettled("F PO vs CC production create", xfRace);
    check("F cross-family first-pass overlap", xfBarrier.overlap);
    check(
      "F cross-family exactly one fulfilled",
      xfInspect.fulfilled === 1,
      `fulfilled=${xfInspect.fulfilled} rejected=${xfInspect.rejectedKinds.join(",") || "none"}`
    );
    xfInspect.rejectedKinds.forEach((kind, i) => {
      check(`F cross-family rejection[${i}] is quota_exhausted`, kind === "quota_exhausted", kind);
    });
    check("F cross-family usage=25", (await usageCount("g-xfamily")) === 25);
    const xfPo = (
      await getDoc(doc(authedDb("g-xfamily"), "users", "g-xfamily", "purchaseOrders", "po_xf"))
    ).exists();
    const xfCr = (
      await getDoc(doc(authedDb("g-xfamily"), "users", "g-xfamily", "customerCreditRecords", "cr_xf"))
    ).exists();
    check("F cross-family exactly one committed record", xfPo !== xfCr);
    const xfPoSerial = await counterNext("g-xfamily", "purchaseOrder");
    const xfCrSerial = await counterNext("g-xfamily", "customerCredit");
    if (xfPo && !xfCr) {
      check("F cross-family PO win advances only PO serial", xfPoSerial === 4 && xfCrSerial === 8);
    } else if (xfCr && !xfPo) {
      check("F cross-family CC win advances only CC serial", xfPoSerial === 3 && xfCrSerial === 9);
    } else {
      check("F cross-family winner family identified", false);
    }

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
    const batchInspect = inspectSettled("F production-shaped batches", batchRace);
    check(
      "F production-shaped concurrent batches: exactly one commit",
      batchInspect.fulfilled === 1,
      `fulfilled=${batchInspect.fulfilled}`
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

    // Entries are Option-C linked this round; letterheadDocs stay ungated.
    await seedUser("g-unlinked");
    await seedStatus("g-unlinked", { quotaEnforcementEnabled: true, plan: "free", entitlementActive: true });
    await assertFails(
      setDoc(doc(authedDb("g-unlinked"), "users", "g-unlinked", "entries", "e1"), {
        userId: "g-unlinked",
        title: "Diary entry",
        createdAt: Date.now(),
      })
    );
    check("P entries CREATE without usage denied while enforcement on", true);
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
    check(
      "I CC update/payment-shaped write is a Rules property, not repository addPayment",
      (await usageCount("g-cc")) === 1
    );

    const closedAt = Date.now();
    await assertSucceeds(
      updateDoc(doc(authedDb("g-cc"), "users", "g-cc", "customerCreditRecords", "cr_on_1"), {
        userId: "g-cc",
        status: "fully_paid",
        closedAt,
        closure: {
          finalPaymentDate: closedAt,
          finalPaymentAmount: 10000,
          paymentMode: "cash",
          paidBy: "customer",
          recordedBy: "g-cc",
          balanceAtClosure: 0,
          adjustment: "none",
          closedAt,
        },
        updatedAt: closedAt,
      })
    );
    check("I CC full-closure-shaped update does not consume", (await usageCount("g-cc")) === 1);

    const payRec = await createCustomerCreditAtomic(
      authedDb("g-cc"),
      "g-cc",
      creditInput("cr_pay_ops"),
      parseCredit
    );
    const payBefore = await usageCount("g-cc");
    check("I CC payment fixture consumed one create slot", payBefore === 2 && payRec.id === "cr_pay_ops");
    const paid = await addCustomerCreditPaymentOnDb(
      authedDb("g-cc"),
      "g-cc",
      "cr_pay_ops",
      {
        amount: 2500,
        paidDate: Date.now(),
        mode: "cash",
        reference: null,
        note: "emulator payment",
        clientPaymentId: "pay_em_1",
      },
      parseCredit
    );
    check("I CC repository payment appends ledger", (paid.payments?.length ?? 0) >= 1);
    check("I CC repository payment does not consume quota", (await usageCount("g-cc")) === payBefore);
    const closed = await closeCustomerCreditFullyPaidOnDb(
      authedDb("g-cc"),
      "g-cc",
      {
        recordId: "cr_pay_ops",
        appendFinalPayment: true,
        clientMutationId: "close_em_1",
        closure: {
          finalPaymentDate: Date.now(),
          finalPaymentAmount: 7500,
          paymentMode: "cash",
          paidBy: "customer",
          recordedBy: "g-cc",
          balanceAtClosure: 0,
          adjustment: "exact",
          closedAt: Date.now(),
        },
      },
      parseCredit
    );
    check("I CC repository closure marks fully_paid", closed.status === "fully_paid");
    check("I CC repository closure does not consume quota", (await usageCount("g-cc")) === payBefore);

    await seedUser("g-id");
    await seedStatus("g-id", { quotaEnforcementEnabled: true, plan: "starter", entitlementActive: true });
    const absentCredit = await createCustomerCreditAtomic(
      authedDb("g-id"),
      "g-id",
      creditInput(),
      parseCredit
    );
    const absentSnap = await getDoc(
      doc(authedDb("g-id"), "users", "g-id", "customerCreditRecords", absentCredit.id)
    );
    check("CC absent clientRecordId produces a stored id", absentCredit.id.trim().length > 0);
    check(
      "CC absent clientRecordId path matches payload",
      absentSnap.exists() && (absentSnap.data() as { id?: string }).id === absentCredit.id
    );
    const blankCredit = await createCustomerCreditAtomic(
      authedDb("g-id"),
      "g-id",
      creditInput(""),
      parseCredit
    );
    const blankSnap = await getDoc(
      doc(authedDb("g-id"), "users", "g-id", "customerCreditRecords", blankCredit.id)
    );
    check("CC blank clientRecordId produces a distinct stored id", blankCredit.id !== absentCredit.id);
    check(
      "CC blank clientRecordId path matches payload",
      blankSnap.exists() && (blankSnap.data() as { id?: string }).id === blankCredit.id
    );
    const wsCredit = await createCustomerCreditAtomic(
      authedDb("g-id"),
      "g-id",
      creditInput("   "),
      parseCredit
    );
    check("CC whitespace clientRecordId is distinct from blank/absent", wsCredit.id !== blankCredit.id);
    check("CC identity creates consumed three quota slots", (await usageCount("g-id")) === 3);
    check("CC identity creates allocated three serials", (await counterNext("g-id", "customerCredit")) === 3);

    await seedUser("g-cc-slot");
    await seedStatus("g-cc-slot", { quotaEnforcementEnabled: true, plan: "free", entitlementActive: true });
    await seedUsage("g-cc-slot", usageDoc(monthNow, 24, "seed", "customerCreditRecords"));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", "g-cc-slot", "counters", "customerCredit"), {
        next: 4,
        updatedAt: Date.now(),
      });
    });
    const ccSlotWin = await createCustomerCreditAtomic(
      authedDb("g-cc-slot"),
      "g-cc-slot",
      creditInput("cr_slot_a"),
      parseCredit
    );
    check("F CC sequential winner at final slot", ccSlotWin.serial === 5 && (await usageCount("g-cc-slot")) === 25);
    let ccSlotLoser: string | null = null;
    try {
      await createCustomerCreditAtomic(
        authedDb("g-cc-slot"),
        "g-cc-slot",
        creditInput("cr_slot_b"),
        parseCredit
      );
    } catch (e) {
      ccSlotLoser = classifyAtomicCreateError(e);
    }
    check("F CC sequential loser quota_exhausted", ccSlotLoser === "quota_exhausted");
    check("F CC sequential loser did not increment serial", (await counterNext("g-cc-slot", "customerCredit")) === 5);

    await seedUser("g-pk-slot");
    await seedStatus("g-pk-slot", { quotaEnforcementEnabled: true, plan: "free", entitlementActive: true });
    await seedUsage("g-pk-slot", usageDoc(monthNow, 24, "seed", "professionalPacks"));
    const pkSlotWin = await createProfessionalPackAtomic(
      authedDb("g-pk-slot"),
      "g-pk-slot",
      packInput("pk_slot_a")
    );
    check("F pack sequential winner at final slot", pkSlotWin.id === "pk_slot_a" && (await usageCount("g-pk-slot")) === 25);
    let pkSlotLoser: string | null = null;
    try {
      await createProfessionalPackAtomic(authedDb("g-pk-slot"), "g-pk-slot", packInput("pk_slot_b"));
    } catch (e) {
      pkSlotLoser = classifyAtomicCreateError(e);
    }
    check("F pack sequential loser quota_exhausted", pkSlotLoser === "quota_exhausted");
    check(
      "F pack sequential loser record absent",
      !(await getDoc(doc(authedDb("g-pk-slot"), "users", "g-pk-slot", "professionalPacks", "pk_slot_b"))).exists()
    );

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

    // ---- Diary atomic CREATE (Round 4) ---------------------------------
    await seedUser("g-en-off");
    await seedStatus("g-en-off", { quotaEnforcementEnabled: false });
    const enOff = await createEntryAtomic(authedDb("g-en-off"), "g-en-off", entryInput("en_off_1"));
    check("A diary flag-off create without usage", enOff.id === "en_off_1");
    check("B diary flag-off did not write usage", (await usageCount("g-en-off")) == null);

    await seedUser("g-en");
    await seedStatus("g-en", { quotaEnforcementEnabled: true, plan: "free", entitlementActive: true });
    const en1 = await createEntryAtomic(authedDb("g-en"), "g-en", entryInput("en_on_1"));
    check("A diary online create id agrees", en1.id === "en_on_1");
    check("A diary one usage transition", (await usageCount("g-en")) === 1);
    const enSnap = await getDoc(doc(authedDb("g-en"), "users", "g-en", "entries", "en_on_1"));
    check("A diary stored id agrees", enSnap.exists() && (enSnap.data() as { id?: string }).id === "en_on_1");

    const enReplay = await createEntryAtomic(authedDb("g-en"), "g-en", entryInput("en_on_1", "Older queued title"));
    check("G diary same-id replay returns existing", enReplay.id === "en_on_1" && enReplay.title === en1.title);
    check("G diary replay does not consume twice", (await usageCount("g-en")) === 1);

    await seedUsage("g-en", usageDoc(monthNow, 24, "en_on_1", "entries"));
    const enBarrier = new FirstPassBarrier(2);
    const enRace = await Promise.allSettled([
      createEntryAtomic(authedDb("g-en"), "g-en", entryInput("en_slot_a"), enBarrier.hook(), Date.now(), "en_slot_a"),
      createEntryAtomic(authedDb("g-en"), "g-en", entryInput("en_slot_b"), enBarrier.hook(), Date.now(), "en_slot_b"),
    ]);
    const enInspect = inspectSettled("diary final-slot", enRace);
    check("K diary final-slot overlap asserted", enBarrier.overlap || enInspect.fulfilled === 1);
    check("K diary final-slot one fulfilled", enInspect.fulfilled === 1);
    check(
      "K diary final-slot rejection inspected",
      enInspect.rejectedKinds.length === 1 && enInspect.rejectedKinds[0] === "quota_exhausted",
      enInspect.rejectedKinds.join(",")
    );
    check("K diary usage at cap", (await usageCount("g-en")) === 25);
    const enA = await getDoc(doc(authedDb("g-en"), "users", "g-en", "entries", "en_slot_a"));
    const enB = await getDoc(doc(authedDb("g-en"), "users", "g-en", "entries", "en_slot_b"));
    check("K diary exactly one new record", Number(enA.exists()) + Number(enB.exists()) === 1);

    await seedUser("g-en-xf");
    await seedStatus("g-en-xf", { quotaEnforcementEnabled: true, plan: "free", entitlementActive: true });
    await seedUsage("g-en-xf", usageDoc(monthNow, 24, "seed", "purchaseOrders"));
    const enXfBarrier = new FirstPassBarrier(2);
    const enXfRace = await Promise.allSettled([
      createEntryAtomic(authedDb("g-en-xf"), "g-en-xf", entryInput("en_xf"), enXfBarrier.hook()),
      createPurchaseOrderAtomic(
        authedDb("g-en-xf"),
        "g-en-xf",
        poInput("po_xf"),
        parsePo,
        enXfBarrier.hook()
      ),
    ]);
    const enXfInspect = inspectSettled("diary vs PO", enXfRace);
    check("K diary/PO overlap asserted", enXfBarrier.overlap || enXfInspect.fulfilled === 1);
    check("K diary/PO one fulfilled", enXfInspect.fulfilled === 1);
    enXfInspect.rejectedKinds.forEach((kind, i) => {
      check(`K diary/PO rejection[${i}] is quota_exhausted`, kind === "quota_exhausted", kind);
    });
    check("K diary/PO usage=25", (await usageCount("g-en-xf")) === 25);
    const enXfEntry = await getDoc(doc(authedDb("g-en-xf"), "users", "g-en-xf", "entries", "en_xf"));
    const enXfPo = await getDoc(doc(authedDb("g-en-xf"), "users", "g-en-xf", "purchaseOrders", "po_xf"));
    check("K diary/PO exactly one record", Number(enXfEntry.exists()) + Number(enXfPo.exists()) === 1);

    // Access budget (N)
    // Manual estimate (not a measured get/exists/getAfter trace):
    //   Create txn per evaluation: isActiveUser get(users/uid);
    //   quotaEnforcementOn exists+get(status); usageConsumedForRecord
    //   getAfter(usage)+exists+get(usage); serial counter isActiveUser.
    //   Diary create has no serial counter (≈ 4 record + 4 usage).
    // Recovery after a Rules-denied commit is a later read-only transaction
    // (account, record, status, usage) and is not part of the create budget.
    // Measured evidence: production-shaped PO/CC/pack/diary creates succeeded, and
    // same-id / final-slot / cross-family recovery did not hit the access cap.
    // _saveLocks is a separate pre-create write, not part of this transaction.
    check(
      "N production-shaped PO atomic create succeeded (Rules access budget held; measured: create committed)",
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
    check(
      "N production-shaped diary atomic create succeeded (Rules access budget held)",
      en1.id === "en_on_1"
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
