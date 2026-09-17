/**
 * Round 11 — Firestore emulator ownership boundaries.
 * Boundary: Rules unit-testing emulator. Not MemorySqlite, not device.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, type Firestore } from "firebase/firestore";

import { createEntryAtomic } from "@/services/diary/atomicCreate";
import {
  appendRecordCompletedStep,
  setCompletedStepBoundaryHooksForTests,
  setCompletedStepWriteObserverForTests,
  setCompletedStepsFirestoreForTests,
  type CompletedStepWriteObservation,
} from "@/services/records/recordCompletedSteps";
import {
  attachRecordIdToPersistentLock,
  markPersistentLockDone,
  markPersistentLockFailed,
  markPersistentLockInFlight,
  readPersistentSaveLock,
  setPersistentLockAfterReadGateForTests,
  setPersistentLockFirestoreForTests,
  touchPersistentLock,
} from "@/services/records/persistentSaveLock";
import { SAVE_STEP } from "@/services/records/saveLockTypes";
import { captureAdmissionToken, syncSessionOwnership } from "@/sync/syncSessionOwnership";

const PROJECT_ID = "vyaamikk-diary-coord-own-test";
const RULES_PATH = resolve(process.cwd(), "firestore.rules");

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function barrier() {
  const entered = deferred();
  const hold = deferred();
  return {
    waitUntilEntered: () => entered.promise,
    release: () => hold.resolve(),
    gate: async () => {
      entered.resolve();
      await hold.promise;
    },
  };
}

function entryInput(clientRecordId: string) {
  return {
    clientRecordId,
    ueid: "VYD-2026-BILL01",
    entryType: "work_update_issue" as const,
    title: "Coordination ownership",
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

async function main() {
  const rules = readFileSync(RULES_PATH, "utf8");
  const testEnv: RulesTestEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules },
  });
  const uid = "coord-own-user";
  try {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", uid), {
        uid,
        ueid: "VYD-2026-BILL01",
        phoneE164: "+919999999998",
        status: "active",
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
        displayName: "Coord User",
      });
      await setDoc(doc(ctx.firestore(), "users", uid, "subscription", "status"), {
        plan: "free",
        billingStatus: "active",
        entitlementActive: true,
        entitlementReason: "neverSubscribed",
        quotaEnforcementEnabled: false,
        updatedAt: Date.now(),
        updatedBy: "admin",
      });
    });
    const db = testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
    setCompletedStepsFirestoreForTests(db);
    setPersistentLockFirestoreForTests(db);

    const created = await createEntryAtomic(db, uid, entryInput("en_r11_em_a"));
    await appendRecordCompletedStep(
      uid,
      "business_entry",
      created.id,
      SAVE_STEP.BASE_RECORD_CREATED
    );

    // A. Primary update starts, fails; pause fallback getDoc; retire; no fallback write.
    syncSessionOwnership.resetForTests();
    syncSessionOwnership.beginSession(uid);
    const session = captureAdmissionToken();
    const writes: CompletedStepWriteObservation[] = [];
    setCompletedStepWriteObserverForTests((o) => writes.push(o));
    const getHold = barrier();
    setCompletedStepBoundaryHooksForTests({
      failPrimaryUpdate: true,
      beforeFallbackGet: getHold.gate,
    });
    const appendP = appendRecordCompletedStep(
      uid,
      "business_entry",
      created.id,
      SAVE_STEP.PDF_GENERATED,
      session
    );
    await getHold.waitUntilEntered();
    const primaryPhases = writes.filter((w) => w.phase === "primary_update" && w.step === SAVE_STEP.PDF_GENERATED);
    if (primaryPhases.length !== 1) {
      throw new Error(`expected one started primary update, got ${primaryPhases.length}`);
    }
    syncSessionOwnership.endSession();
    getHold.release();
    const afterFallback = await appendP;
    if (afterFallback.includes(SAVE_STEP.PDF_GENERATED)) {
      throw new Error("retired fallback must not append PDF_GENERATED");
    }
    if (writes.some((w) => w.phase === "fallback_write")) {
      throw new Error("fallback setDoc/transaction must not be newly issued after retirement");
    }
    const snap = await getDoc(doc(db, "users", uid, "entries", created.id));
    const steps = (snap.data()?.completedSteps as string[]) ?? [];
    if (steps.includes(SAVE_STEP.PDF_GENERATED)) {
      throw new Error("remote completedSteps must not gain PDF_GENERATED from retired fallback");
    }
    setCompletedStepBoundaryHooksForTests(null);

    // Stale merge must not drop a concurrently arrayUnion'd step.
    const createdMerge = await createEntryAtomic(db, uid, entryInput("en_r11_em_merge"));
    await appendRecordCompletedStep(
      uid,
      "business_entry",
      createdMerge.id,
      SAVE_STEP.BASE_RECORD_CREATED
    );
    const mergeHold = barrier();
    setCompletedStepBoundaryHooksForTests({
      failPrimaryUpdate: true,
      beforeFallbackGet: mergeHold.gate,
    });
    syncSessionOwnership.resetForTests();
    const mergeSession = syncSessionOwnership.beginSession(uid);
    const mergeP = appendRecordCompletedStep(
      uid,
      "business_entry",
      createdMerge.id,
      SAVE_STEP.INSIGHTS_INDEXED,
      mergeSession
    );
    await mergeHold.waitUntilEntered();
    await appendRecordCompletedStep(
      uid,
      "business_entry",
      createdMerge.id,
      SAVE_STEP.PDF_GENERATED
    );
    mergeHold.release();
    const merged = await mergeP;
    if (!merged.includes(SAVE_STEP.BASE_RECORD_CREATED)) {
      throw new Error("BASE missing after fallback");
    }
    if (!merged.includes(SAVE_STEP.PDF_GENERATED)) {
      throw new Error("concurrent arrayUnion PDF_GENERATED must survive fallback");
    }
    if (!merged.includes(SAVE_STEP.INSIGHTS_INDEXED)) {
      throw new Error("fallback must still add INSIGHTS_INDEXED via atomic arrayUnion");
    }
    setCompletedStepBoundaryHooksForTests(null);
    setCompletedStepWriteObserverForTests(null);

    // B. Concurrent lease replacement + stale owner writes.
    const [leaseA, leaseB] = await Promise.all([
      markPersistentLockInFlight({
        userId: uid,
        clientRecordId: "en_r11_em_lease",
        idempotencyKey: "em-a",
        recordKind: "business_entry",
      }),
      markPersistentLockInFlight({
        userId: uid,
        clientRecordId: "en_r11_em_lease",
        idempotencyKey: "em-b",
        recordKind: "business_entry",
      }),
    ]);
    if (leaseA.startedAt === leaseB.startedAt) {
      throw new Error("concurrent emulator acquires must mint distinct startedAt");
    }
    const current = await readPersistentSaveLock(uid, "en_r11_em_lease");
    const winner = leaseA.startedAt > leaseB.startedAt ? leaseA : leaseB;
    const loser = leaseA.startedAt > leaseB.startedAt ? leaseB : leaseA;
    if (current?.startedAt !== winner.startedAt) {
      throw new Error("current lease must be the later startedAt");
    }

    const old = await markPersistentLockInFlight({
      userId: uid,
      clientRecordId: "en_r11_em_lease2",
      idempotencyKey: "old",
      recordKind: "business_entry",
    });
    const raceHold = barrier();
    let pausedOnce = false;
    setPersistentLockAfterReadGateForTests(async () => {
      if (pausedOnce) return;
      pausedOnce = true;
      await raceHold.gate();
    });
    const staleTouch = touchPersistentLock(uid, "en_r11_em_lease2", old.startedAt);
    await raceHold.waitUntilEntered();
    const newer = await markPersistentLockInFlight({
      userId: uid,
      clientRecordId: "en_r11_em_lease2",
      idempotencyKey: "new",
      recordKind: "business_entry",
    });
    raceHold.release();
    await staleTouch;
    await attachRecordIdToPersistentLock(uid, "en_r11_em_lease2", "stale", old.startedAt);
    await markPersistentLockDone(uid, "en_r11_em_lease2", "stale", old.startedAt);
    await markPersistentLockFailed(uid, "en_r11_em_lease2", "session_retired", old.startedAt);
    const after = await readPersistentSaveLock(uid, "en_r11_em_lease2");
    if (after?.startedAt !== newer.startedAt || after.status !== "in_flight" || after.idempotencyKey !== "new") {
      throw new Error(
        `newer lease mutated: ${JSON.stringify({ startedAt: after?.startedAt, status: after?.status, key: after?.idempotencyKey })}`
      );
    }
    if (after.recordId === "stale") {
      throw new Error("stale attach must not write the newer lease");
    }
    setPersistentLockAfterReadGateForTests(null);

    await touchPersistentLock(uid, "en_r11_em_lease", loser.startedAt);
    await markPersistentLockFailed(uid, "en_r11_em_lease", "session_retired", loser.startedAt);
    const stillWinner = await readPersistentSaveLock(uid, "en_r11_em_lease");
    if (stillWinner?.startedAt !== winner.startedAt || stillWinner.status !== "in_flight") {
      throw new Error("loser mutations must leave the winner unchanged");
    }

    // Canonical Customer Credit collection + session recheck inside transaction retries.
    const ccId = "cr_r12_canonical";
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", uid, "customerCreditRecords", ccId), {
        userId: uid,
        clientRecordId: ccId,
        saleDate: 1_700_000_000_000,
        mode: "credit",
        customerName: "Coord CC",
        saleAmount: 100,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      });
    });
    syncSessionOwnership.resetForTests();
    const ccSession = syncSessionOwnership.beginSession(uid);
    await appendRecordCompletedStep(uid, "customer_credit", ccId, SAVE_STEP.BASE_RECORD_CREATED, ccSession);
    const ccSnap = await getDoc(doc(db, "users", uid, "customerCreditRecords", ccId));
    const ccSteps = (ccSnap.data()?.completedSteps as string[]) ?? [];
    if (!ccSteps.includes(SAVE_STEP.BASE_RECORD_CREATED)) {
      throw new Error("customer credit completedSteps must land on customerCreditRecords");
    }
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const wrongSnap = await getDoc(doc(ctx.firestore(), "users", uid, "customerCredits", ccId));
      if (wrongSnap.exists()) {
        throw new Error("completedSteps must not write the non-canonical customerCredits collection");
      }
    });

    const txHold = barrier();
    setCompletedStepBoundaryHooksForTests({
      failPrimaryUpdate: true,
      insideTransactionCallback: txHold.gate,
    });
    const txAppend = appendRecordCompletedStep(
      uid,
      "customer_credit",
      ccId,
      SAVE_STEP.PDF_GENERATED,
      ccSession
    );
    await txHold.waitUntilEntered();
    syncSessionOwnership.endSession();
    txHold.release();
    const afterTx = await txAppend;
    if (afterTx.includes(SAVE_STEP.PDF_GENERATED)) {
      throw new Error("retired transaction callback must not append PDF_GENERATED");
    }
    const ccAfter = await getDoc(doc(db, "users", uid, "customerCreditRecords", ccId));
    const ccAfterSteps = (ccAfter.data()?.completedSteps as string[]) ?? [];
    if (ccAfterSteps.includes(SAVE_STEP.PDF_GENERATED)) {
      throw new Error("session check inside transaction retry must skip the write");
    }
    setCompletedStepBoundaryHooksForTests(null);
    setCompletedStepWriteObserverForTests(null);

    console.log("coordinationOwnership.emulator.test.ts: ok (Firestore emulator)");
  } finally {
    setCompletedStepsFirestoreForTests(null);
    setPersistentLockFirestoreForTests(null);
    setCompletedStepBoundaryHooksForTests(null);
    setCompletedStepWriteObserverForTests(null);
    setPersistentLockAfterReadGateForTests(null);
    await testEnv.cleanup();
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
