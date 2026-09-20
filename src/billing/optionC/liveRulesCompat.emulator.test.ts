/**
 * LIVE_RULES_COMPAT — exported live Firestore Rules vs proposed billing-off patch.
 *
 * Canonical quota suite remains firestore.rules.test.ts / phaseG / letterheadQuota.
 * This file never deploys. Enforcement-true ordinary CREATE is recorded as
 * outside the minimal compatibility configuration.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, type Firestore } from "firebase/firestore";

import { __resetCapabilityGuardForTests } from "@/auth/offlineCapabilityGuard";
import { classifyAtomicCreateError } from "@/billing/optionC/classifyCreateError";
import { createCustomerCreditAtomic } from "@/services/customerCredit/atomicCreate";
import { createEntryAtomic } from "@/services/diary/atomicCreate";
import { createLetterheadDocumentAtomic } from "@/services/letterhead/atomicCreate";
import type { LetterheadDocumentCreateInput } from "@/services/letterhead/types";
import { createProfessionalPackAtomic } from "@/services/professionalPack/atomicCreate";
import { createPurchaseOrderAtomic } from "@/services/purchaseOrder/atomicCreate";
import {
  completeCoordinatedSave,
  beginCoordinatedSave,
} from "@/services/records/saveCoordinator";
import { createSaveIdempotencyContext } from "@/services/records/saveIdempotency";
import {
  markPersistentLockInFlight,
  readPersistentSaveLock,
  setPersistentLockFirestoreForTests,
} from "@/services/records/persistentSaveLock";
import { setCompletedStepsFirestoreForTests } from "@/services/records/recordCompletedSteps";
import { captureAdmissionToken, syncSessionOwnership } from "@/sync/syncSessionOwnership";
import type { CustomerCreditRecord } from "@/domain/customerCredit";
import type { PurchaseOrder } from "@/domain/purchaseOrder";
import {
  installCompatSaveSeams,
  runCompatProductionSaves,
  uninstallCompatSaveSeams,
} from "./liveRulesCompat.fullSave";

const BASELINE = resolve(process.cwd(), "docs/release/rules-compat/baseline/firestore.rules");
const PROPOSED = resolve(process.cwd(), "docs/release/rules-compat/proposed/firestore.rules");
const EXPECTED_LIVE =
  "d8ee0abcd5a8f217f1fbe60af9651e5b4253b07cac72d0746c4e781a48052aa2";
const EXPECTED_PROPOSED =
  "b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c";

let failures = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) console.log(`  ok - ${name}`);
  else {
    failures += 1;
    console.error(`  FAIL - ${name}${detail ? ` (${detail})` : ""}`);
  }
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

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
      clear: () => mem.clear(),
      get length() {
        return mem.size;
      },
      key: (i: number) => [...mem.keys()][i] ?? null,
    } as Storage,
  };
}

async function seedUser(env: RulesTestEnvironment, uid: string): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "users", uid), {
      uid,
      ueid: "VYD-2026-BILL01",
      phoneE164: "+919999999991",
      status: "active",
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      displayName: "Compat User",
    });
  });
}

function entryInput(clientRecordId: string) {
  return {
    clientRecordId,
    ueid: "VYD-2026-BILL01",
    entryType: "work_update_issue" as const,
    title: "Compat diary",
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

function lhInput(clientRecordId: string): LetterheadDocumentCreateInput {
  return {
    clientRecordId,
    ueid: "VYD-2026-BILL01",
    title: "Letterhead compat",
    input: {
      title: "Letterhead compat",
      date: Date.now(),
      subject: "Subject",
      body: "Body of the letter.",
      closing: "Yours faithfully",
      name: "Owner",
      designation: "Proprietor",
      place: "Delhi",
    },
    templateRefUpdatedAt: null,
    pdfUri: null,
    saved: true,
  };
}

function parsePo(id: string, raw: Record<string, unknown>): PurchaseOrder {
  return { ...(raw as object), id } as PurchaseOrder;
}
function parseCredit(id: string, raw: Record<string, unknown>): CustomerCreditRecord {
  return { ...(raw as object), id } as CustomerCreditRecord;
}

async function classifyCreate(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "ok";
  } catch (e) {
    return classifyAtomicCreateError(e);
  }
}

async function runPhase(label: string, rulesPath: string, patched: boolean): Promise<void> {
  console.log(`LIVE_RULES_COMPAT ${label}`);
  const rules = readFileSync(rulesPath, "utf8");
  const env = await initializeTestEnvironment({
    projectId: patched ? "vyd-live-rules-compat-after" : "vyd-live-rules-compat-before",
    firestore: { rules },
  });
  const uid = patched ? "compat-after" : "compat-before";
  try {
    await env.clearFirestore();
    await seedUser(env, uid);
    const db = env.authenticatedContext(uid).firestore() as unknown as Firestore;
    const other = env.authenticatedContext("mallory").firestore();
    const anon = env.unauthenticatedContext().firestore();
    setPersistentLockFirestoreForTests(db);
    setCompletedStepsFirestoreForTests(db);
    __resetCapabilityGuardForTests({ isOnline: true, lastValidationAt: Date.now() });
    syncSessionOwnership.resetForTests();
    syncSessionOwnership.beginSession(uid);
    const session = captureAdmissionToken();

    const statusRef = doc(db, "users", uid, "subscription", "status");
    const usageRef = doc(db, "users", uid, "subscription", "usageCurrent");
    const missingStatus = await getDoc(statusRef)
      .then((s) => (s.exists() ? "exists" : "missing-ok"))
      .catch(() => "denied");
    const missingUsage = await getDoc(usageRef)
      .then((s) => (s.exists() ? "exists" : "missing-ok"))
      .catch(() => "denied");

    if (!patched) {
      check("before: missing status get is permission-denied", missingStatus === "denied");
      check("before: missing usage get is permission-denied", missingUsage === "denied");
    } else {
      check("after: missing status get is allowed (empty)", missingStatus === "missing-ok");
      check("after: missing usage get is allowed (empty)", missingUsage === "missing-ok");
    }

    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", uid, "subscription", "status"), {
        plan: "free",
        billingStatus: "expired",
        entitlementActive: false,
        entitlementReason: "neverSubscribed",
        quotaEnforcementEnabled: false,
        updatedAt: Date.now(),
        updatedBy: "admin",
      });
    });
    const seededOff = await getDoc(statusRef)
      .then((s) => (s.exists() ? "ok" : "missing"))
      .catch(() => "denied");
    check(
      `${label}: seeded enforcement-false status read`,
      patched ? seededOff === "ok" : seededOff === "denied"
    );

    check(
      `${label}: unauthenticated status denied`,
      await getDoc(doc(anon, "users", uid, "subscription", "status"))
        .then(() => false)
        .catch(() => true)
    );
    check(
      `${label}: cross-user status denied`,
      await getDoc(doc(other, "users", uid, "subscription", "status"))
        .then(() => false)
        .catch(() => true)
    );
    await assertFails(
      setDoc(statusRef, {
        plan: "business",
        entitlementActive: true,
        quotaEnforcementEnabled: true,
      })
    );
    check(`${label}: client status write denied`, true);
    await assertFails(
      setDoc(usageRef, {
        monthKey: "2026-09",
        recordsThisMonth: 1,
        lastRecordCollection: "entries",
        lastRecordId: "x",
        updatedAt: Date.now(),
      })
    );
    check(`${label}: client usage write denied`, true);

    const lockId = `lock_${label}`;
    const missingLock = await readPersistentSaveLock(uid, lockId);
    if (!patched) {
      check("before: missing lock helper cannot treat Null as readable", missingLock === null);
    } else {
      check("after: missing lock helper returns null without throwing", missingLock === null);
    }

    let acquireKind = "ok";
    try {
      await markPersistentLockInFlight({
        userId: uid,
        clientRecordId: lockId,
        idempotencyKey: `idem-${label}`,
        recordKind: "business_entry",
        expectedLeaseStartedAt: null,
        session,
      });
    } catch {
      acquireKind = "denied";
    }
    check(
      `${label}: first lock acquire`,
      patched ? acquireKind === "ok" : acquireKind === "denied"
    );

    const diaryKind = await classifyCreate(() => createEntryAtomic(db, uid, entryInput(`en_${label}`)));
    const poKind = await classifyCreate(() =>
      createPurchaseOrderAtomic(db, uid, poInput(`po_${label}`), parsePo)
    );
    const ccKind = await classifyCreate(() =>
      createCustomerCreditAtomic(db, uid, creditInput(`cr_${label}`), parseCredit)
    );
    const pkKind = await classifyCreate(() =>
      createProfessionalPackAtomic(db, uid, packInput(`pk_${label}`))
    );
    const lhKind = await classifyCreate(() =>
      createLetterheadDocumentAtomic(db, uid, lhInput(`lh_${label}`))
    );

    if (!patched) {
      check("before: ordinary diary CREATE denied on status read", diaryKind === "permission_denied");
      check("before: ordinary PO CREATE denied on status read", poKind === "permission_denied");
      check("before: ordinary CC CREATE denied on status read", ccKind === "permission_denied");
      check("before: ordinary pack CREATE denied on status read", pkKind === "permission_denied");
      check("before: letterhead CREATE compatible (no status read)", lhKind === "ok");
    } else {
      check("after: diary CREATE allowed (enforcement off / missing usage)", diaryKind === "ok");
      check("after: PO CREATE allowed", poKind === "ok");
      check("after: CC CREATE allowed", ccKind === "ok");
      check("after: pack CREATE allowed", pkKind === "ok");
      check("after: letterhead CREATE allowed", lhKind === "ok");
    }

    const saveCtx = createSaveIdempotencyContext({
      userId: uid,
      recordKind: "business_entry",
      clientRecordId: `save_${label}`,
    });
    let beginDecision = "threw";
    let beginError = "";
    let begunSave: Awaited<ReturnType<typeof beginCoordinatedSave>> | null = null;
    try {
      begunSave = await beginCoordinatedSave(saveCtx, { session, route: "compat" });
      beginDecision = begunSave.decision.action;
    } catch (e) {
      beginError = e instanceof Error ? e.message : String(e);
      beginDecision = "blocked";
    }
    if (!patched) {
      check(
        "before: production beginCoordinatedSave blocked by missing lock read",
        beginDecision === "blocked",
        beginError
      );
    } else {
      check("after: production beginCoordinatedSave proceeds", beginDecision === "proceed" && begunSave != null, beginError);
      const begun = begunSave!;
      const created = await createEntryAtomic(db, uid, entryInput(`save_${label}`));
      await completeCoordinatedSave(begun.idempotency, created.id, {
        session,
        processLockKey: saveCtx.idempotencyKey,
        processLockOwner: begun.processLockOwner ?? undefined,
        lockLeaseStartedAt: begun.lockLeaseStartedAt ?? undefined,
      });
      const replay = await beginCoordinatedSave(begun.idempotency, { session, route: "compat-replay" });
      check(
        "after: same-ID beginCoordinatedSave returns done (no new lease)",
        replay.decision.action === "return_done" &&
          "recordId" in replay.decision &&
          replay.decision.recordId === created.id
      );
      check("after: done-lock replay does not require done→in_flight", replay.lockLeaseStartedAt == null);

      const statusAfter = await getDoc(statusRef);
      const usageAfter = await getDoc(usageRef);
      check(
        "after: pending-secondary recovery reads (status/usage) are allowed",
        statusAfter.exists() && usageAfter.exists() === false
      );
    }

    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", uid, "subscription", "status"), {
        plan: "free",
        billingStatus: "active",
        entitlementActive: true,
        entitlementReason: "neverSubscribed",
        quotaEnforcementEnabled: true,
        updatedAt: Date.now(),
        updatedBy: "admin",
      });
    });
    const enfTrueKind = await classifyCreate(() =>
      createEntryAtomic(db, uid, entryInput(`enf_${label}`))
    );
    check(
      `${label}: enforcement-true ordinary CREATE is outside billing-off compat (not silently allowed via usage writes)`,
      patched ? enfTrueKind === "permission_denied" : enfTrueKind === "permission_denied"
    );

    if (patched) {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "users", uid, "subscription", "status"), {
          plan: "free",
          billingStatus: "expired",
          entitlementActive: false,
          entitlementReason: "neverSubscribed",
          quotaEnforcementEnabled: false,
          updatedAt: Date.now(),
          updatedBy: "admin",
        });
        const startedAt = Date.now() - 60_000;
        await setDoc(doc(ctx.firestore(), "users", uid, "_saveLocks", "done_lock"), {
          userId: uid,
          clientRecordId: "done_lock",
          idempotencyKey: "done",
          recordKind: "business_entry",
          status: "done",
          recordId: "already-saved",
          startedAt,
          updatedAt: startedAt,
          expiresAt: startedAt + 15 * 60_000,
          completedAt: startedAt + 1_000,
        });
      });
      const doneCtx = createSaveIdempotencyContext({
        userId: uid,
        recordKind: "business_entry",
        clientRecordId: "done_lock",
      });
      const doneBegin = await beginCoordinatedSave(doneCtx, { session, route: "done" });
      check(
        "after: existing done lock returns return_done with zero new lease",
        doneBegin.decision.action === "return_done" && doneBegin.lockLeaseStartedAt == null
      );

      try {
        await installCompatSaveSeams({ db, parsePo, parseCredit });
        await runCompatProductionSaves({
          uid,
          db,
          check,
          entryInput,
          poInput,
          creditInput,
          packInput,
        });
      } finally {
        uninstallCompatSaveSeams();
      }
    }

    await assertFails(updateDoc(doc(db, "users", uid), { uid: "hijack" }));
    check(`${label}: identity uid mutation denied`, true);
  } finally {
    setPersistentLockFirestoreForTests(null);
    setCompletedStepsFirestoreForTests(null);
    await env.cleanup();
  }
}

async function main() {
  installAsyncStoragePolyfill();
  const live = readFileSync(BASELINE, "utf8");
  const proposed = readFileSync(PROPOSED, "utf8");
  check("baseline sha256 matches live export", sha256(live) === EXPECTED_LIVE);
  check("proposed sha256 matches documented artifact", sha256(proposed) === EXPECTED_PROPOSED);
  check("proposed does not mention request.appCheck", !proposed.includes("appCheck"));
  check("proposed keeps client status writes denied", proposed.includes("match /subscription/status"));

  await runPhase("BEFORE live baseline", BASELINE, false);
  await runPhase("AFTER proposed patch", PROPOSED, true);

  if (failures > 0) {
    console.error(`LIVE_RULES_COMPAT FAIL ${failures}`);
    process.exit(1);
  }
  console.log("LIVE_RULES_COMPAT PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
