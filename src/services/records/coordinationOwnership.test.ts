/**
 * Round 11 — coordination ownership boundaries on production helpers.
 * Boundary: in-process AsyncStorage + session tokens. Not Firestore emulator
 * (see coordinationOwnership.emulator.test.ts), not device.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { __resetCapabilityGuardForTests } from "@/auth/offlineCapabilityGuard";
import {
  captureAdmissionToken,
  syncSessionOwnership,
} from "@/sync/syncSessionOwnership";
import {
  acquireOwnedProcessSaveLock,
  createSaveIdempotencyContext,
  isProcessSaveLockHeld,
  releaseProcessSaveLock,
  setBeginSaveAttemptGateForTests,
  setCompleteSaveAttemptGateForTests,
} from "@/services/records/saveIdempotency";
import {
  attachRecordIdToPersistentLock,
  hasRetiredLeaseIntent,
  markPersistentLockDone,
  markPersistentLockFailed,
  markPersistentLockInFlight,
  readPersistentSaveLock,
  setPersistentLockAfterReadGateForTests,
  setPersistentLockInsideTransactionGateForTests,
  setPersistentLockMutationObserverForTests,
  setPersistentLockNowMsForTests,
  setPersistentLockTouchGateForTests,
  touchPersistentLock,
} from "@/services/records/persistentSaveLock";
import {
  beginCoordinatedSave,
  completeCoordinatedSave,
  failCoordinatedSave,
  retireOwnedReservation,
  runRecordStepIfNeeded,
} from "@/services/records/saveCoordinator";
import {
  appendRecordCompletedStep,
  fetchRecordCompletedSteps,
  setCompletedStepBoundaryHooksForTests,
  setCompletedStepWriteObserverForTests,
  type CompletedStepWriteObservation,
} from "@/services/records/recordCompletedSteps";
import { SAVE_STEP, SaveRetryableError } from "@/services/records/saveLockTypes";

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
    waitUntilEntered: () =>
      new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("test barrier: gate was not entered")), 5000);
        entered.promise.then(
          () => {
            clearTimeout(timer);
            resolve();
          },
          (err) => {
            clearTimeout(timer);
            reject(err);
          }
        );
      }),
    release: () => hold.resolve(),
    gate: async () => {
      entered.resolve();
      await hold.promise;
    },
  };
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

async function main() {
  installAsyncStoragePolyfill();
  const { default: AsyncStorage } = await import("@react-native-async-storage/async-storage");
  await AsyncStorage.clear();
  __resetCapabilityGuardForTests({ isOnline: true, lastValidationAt: Date.now() });

  // A. Local analog: pause after read, retire, no newly issued write.
  syncSessionOwnership.resetForTests();
  syncSessionOwnership.beginSession("u_steps");
  const sessionA = captureAdmissionToken();
  await appendRecordCompletedStep(
    "u_steps",
    "business_entry",
    "en_r11_a",
    SAVE_STEP.BASE_RECORD_CREATED,
    sessionA
  );
  const aHold = barrier();
  const writes: CompletedStepWriteObservation[] = [];
  setCompletedStepWriteObserverForTests((o) => writes.push(o));
  setCompletedStepBoundaryHooksForTests({ beforeFallbackGet: aHold.gate });
  const aAppend = appendRecordCompletedStep(
    "u_steps",
    "business_entry",
    "en_r11_a",
    SAVE_STEP.PDF_GENERATED,
    sessionA
  );
  await aHold.waitUntilEntered();
  syncSessionOwnership.endSession();
  const writesAtRetirement = writes.length;
  aHold.release();
  const afterA = await aAppend;
  assert.deepEqual(afterA, [SAVE_STEP.BASE_RECORD_CREATED]);
  assert.equal(
    writes.length,
    writesAtRetirement,
    "retired session must not issue a completed-step write after the awaited read"
  );
  assert.deepEqual(
    await fetchRecordCompletedSteps("u_steps", "business_entry", "en_r11_a"),
    [SAVE_STEP.BASE_RECORD_CREATED]
  );
  setCompletedStepBoundaryHooksForTests(null);
  setCompletedStepWriteObserverForTests(null);

  // B. Same-millisecond overlapping acquire + stale mutation after newer lease.
  const frozen = 1_700_000_111_000;
  setPersistentLockNowMsForTests(frozen);
  try {
    const [first, second] = await Promise.all([
      markPersistentLockInFlight({
        userId: "u1",
        clientRecordId: "en_r11_lease_ms",
        idempotencyKey: "lease-a",
        recordKind: "business_entry",
      }),
      markPersistentLockInFlight({
        userId: "u1",
        clientRecordId: "en_r11_lease_ms",
        idempotencyKey: "lease-b",
        recordKind: "business_entry",
      }),
    ]);
    assert.notEqual(first.startedAt, second.startedAt, "overlapping same-ms acquires need distinct leases");
    const currentMs = await readPersistentSaveLock("u1", "en_r11_lease_ms");
    const winner = first.startedAt > second.startedAt ? first : second;
    const loser = first.startedAt > second.startedAt ? second : first;
    assert.equal(currentMs?.startedAt, winner.startedAt);
    assert.equal(currentMs?.idempotencyKey, winner.idempotencyKey);

    await touchPersistentLock("u1", "en_r11_lease_ms", loser.startedAt);
    await attachRecordIdToPersistentLock("u1", "en_r11_lease_ms", "stale-record", loser.startedAt);
    await markPersistentLockDone("u1", "en_r11_lease_ms", "stale-record", loser.startedAt);
    await markPersistentLockFailed("u1", "en_r11_lease_ms", "session_retired", loser.startedAt);
    const afterStale = await readPersistentSaveLock("u1", "en_r11_lease_ms");
    assert.equal(afterStale?.startedAt, winner.startedAt);
    assert.equal(afterStale?.status, "in_flight");
    assert.equal(afterStale?.idempotencyKey, winner.idempotencyKey);
    assert.notEqual(afterStale?.recordId, "stale-record");
  } finally {
    setPersistentLockNowMsForTests(null);
  }

  const oldLease = await markPersistentLockInFlight({
    userId: "u1",
    clientRecordId: "en_r11_lease_race",
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
  const staleTouch = touchPersistentLock("u1", "en_r11_lease_race", oldLease.startedAt);
  await raceHold.waitUntilEntered();
  const newerLease = await markPersistentLockInFlight({
    userId: "u1",
    clientRecordId: "en_r11_lease_race",
    idempotencyKey: "new",
    recordKind: "business_entry",
  });
  assert.notEqual(newerLease.startedAt, oldLease.startedAt);
  raceHold.release();
  await staleTouch;
  const afterRace = await readPersistentSaveLock("u1", "en_r11_lease_race");
  assert.equal(afterRace?.startedAt, newerLease.startedAt);
  assert.equal(afterRace?.idempotencyKey, "new");
  setPersistentLockAfterReadGateForTests(null);

  await attachRecordIdToPersistentLock("u1", "en_r11_lease_race", "owned-by-new", newerLease.startedAt);
  await markPersistentLockFailed("u1", "en_r11_lease_race", "session_retired", oldLease.startedAt);
  await markPersistentLockDone("u1", "en_r11_lease_race", "stale-done", oldLease.startedAt);
  const stillNewer = await readPersistentSaveLock("u1", "en_r11_lease_race");
  assert.equal(stillNewer?.startedAt, newerLease.startedAt);
  assert.equal(stillNewer?.status, "in_flight");
  assert.equal(stillNewer?.recordId, "owned-by-new");

  // C. completeSaveAttempt paused, session retired, process lock released by owner only.
  syncSessionOwnership.resetForTests();
  const sessionC = syncSessionOwnership.beginSession("u1");
  const ctxC = createSaveIdempotencyContext({
    userId: "u1",
    recordKind: "business_entry",
    clientRecordId: "en_r11_c",
  });
  const begunC = await beginCoordinatedSave(ctxC, {
    processLockKey: ctxC.idempotencyKey,
    session: sessionC,
  });
  assert.equal(begunC.decision.action, "proceed");
  assert.equal(isProcessSaveLockHeld(ctxC.idempotencyKey), true);
  const ownerC = begunC.processLockOwner;
  assert.ok(ownerC);
  const completeHold = barrier();
  setCompleteSaveAttemptGateForTests(completeHold.gate);
  const completeP = completeCoordinatedSave(begunC.idempotency, "en_r11_c", {
    processLockKey: ctxC.idempotencyKey,
    processLockOwner: ownerC ?? undefined,
    lockLeaseStartedAt: begunC.lockLeaseStartedAt ?? undefined,
    session: sessionC,
  });
  await completeHold.waitUntilEntered();
  syncSessionOwnership.endSession();
  assert.equal(isProcessSaveLockHeld(ctxC.idempotencyKey), true, "in-flight complete still holds until owner cleanup");
  assert.equal(acquireOwnedProcessSaveLock(ctxC.idempotencyKey), null);
  completeHold.release();
  await completeP;
  assert.equal(isProcessSaveLockHeld(ctxC.idempotencyKey), false, "owner must release after retired completeSaveAttempt");
  setCompleteSaveAttemptGateForTests(null);

  const sessionC2 = syncSessionOwnership.beginSession("u1");
  const againC = await beginCoordinatedSave(ctxC, {
    processLockKey: ctxC.idempotencyKey,
    session: sessionC2,
  });
  assert.equal(againC.decision.action, "return_done", "acknowledged base evidence remains for same-ID recovery");
  if (againC.decision.action === "return_done") {
    assert.equal(againC.decision.recordId, "en_r11_c");
  }
  assert.equal(isProcessSaveLockHeld(ctxC.idempotencyKey), false);

  const ownerNewer = acquireOwnedProcessSaveLock(ctxC.idempotencyKey);
  assert.ok(ownerNewer);
  releaseProcessSaveLock(ctxC.idempotencyKey, ownerC ?? undefined);
  assert.equal(isProcessSaveLockHeld(ctxC.idempotencyKey), true, "stale owner must not clear newer reservation");
  releaseProcessSaveLock(ctxC.idempotencyKey, ownerNewer);

  // D. Remote callback must not start after retirement during touchPersistentLock.
  syncSessionOwnership.resetForTests();
  const sessionD = syncSessionOwnership.beginSession("u1");
  const lockD = await markPersistentLockInFlight({
    userId: "u1",
    clientRecordId: "en_r11_d",
    idempotencyKey: "d",
    recordKind: "business_entry",
    recordId: "en_r11_d",
  });
  const touchHold = barrier();
  setPersistentLockTouchGateForTests(touchHold.gate);
  let remoteStarted = false;
  const remoteP = runRecordStepIfNeeded(
    {
      userId: "u1",
      recordKind: "business_entry",
      recordId: "en_r11_d",
      step: SAVE_STEP.INSIGHTS_INDEXED,
      completedSteps: [],
      clientRecordId: "en_r11_d",
      lockLeaseStartedAt: lockD.startedAt,
      session: sessionD,
    },
    async () => {
      remoteStarted = true;
      return "insights";
    }
  );
  await touchHold.waitUntilEntered();
  syncSessionOwnership.endSession();
  touchHold.release();
  const remoteResult = await remoteP;
  assert.equal(remoteStarted, false, "remote insight callback must not start after retirement");
  assert.equal(remoteResult.ran, false);
  assert.equal(
    hasCompletedInsight(await fetchRecordCompletedSteps("u1", "business_entry", "en_r11_d")),
    false
  );
  setPersistentLockTouchGateForTests(null);

  syncSessionOwnership.beginSession("u1");
  const sessionLocal = captureAdmissionToken();
  const lockLocal = await markPersistentLockInFlight({
    userId: "u1",
    clientRecordId: "en_r11_d_pdf",
    idempotencyKey: "d-pdf",
    recordKind: "business_entry",
    recordId: "en_r11_d_pdf",
  });
  const pdfHold = barrier();
  setPersistentLockTouchGateForTests(pdfHold.gate);
  let pdfStarted = false;
  const pdfP = runRecordStepIfNeeded(
    {
      userId: "u1",
      recordKind: "business_entry",
      recordId: "en_r11_d_pdf",
      step: SAVE_STEP.PDF_GENERATED,
      completedSteps: [],
      clientRecordId: "en_r11_d_pdf",
      lockLeaseStartedAt: lockLocal.startedAt,
      session: sessionLocal,
      issuesRemoteWork: false,
    },
    async () => {
      pdfStarted = true;
      return { uri: "file:///tmp/r11-local.pdf", fileName: "x.pdf" };
    }
  );
  await pdfHold.waitUntilEntered();
  syncSessionOwnership.endSession();
  pdfHold.release();
  const pdfResult = await pdfP;
  assert.equal(pdfStarted, true, "local PDF recovery may run after retirement");
  assert.equal(pdfResult.ran, true);
  assert.equal(pdfResult.result?.uri, "file:///tmp/r11-local.pdf");
  assert.equal(
    (await fetchRecordCompletedSteps("u1", "business_entry", "en_r11_d_pdf")).includes(
      SAVE_STEP.PDF_GENERATED
    ),
    false,
    "retired session must not append PDF_GENERATED remotely"
  );
  setPersistentLockTouchGateForTests(null);

  // beginCoordinatedSave: awaited admission must not return ownership after retirement.
  syncSessionOwnership.resetForTests();
  const sessionBegin = syncSessionOwnership.beginSession("u1");
  const ctxBegin = createSaveIdempotencyContext({
    userId: "u1",
    recordKind: "business_entry",
    clientRecordId: "en_r11_begin",
  });
  const beginHold = barrier();
  setBeginSaveAttemptGateForTests(beginHold.gate);
  const beginP = beginCoordinatedSave(ctxBegin, {
    processLockKey: ctxBegin.idempotencyKey,
    session: sessionBegin,
  });
  await beginHold.waitUntilEntered();
  assert.equal(isProcessSaveLockHeld(ctxBegin.idempotencyKey), true);
  syncSessionOwnership.endSession();
  beginHold.release();
  await assert.rejects(beginP, (e: unknown) => {
    return e instanceof SaveRetryableError && e.failureCode === "session_retired";
  });
  assert.equal(isProcessSaveLockHeld(ctxBegin.idempotencyKey), false);
  const loginAgain = syncSessionOwnership.beginSession("u1");
  assert.equal(loginAgain.generation === sessionBegin.generation, false);
  const lockAfterNewLogin = await readPersistentSaveLock("u1", "en_r11_begin");
  assert.equal(
    lockAfterNewLogin?.status === "in_flight",
    false,
    "retired begin must not leave a lease that a new login can inherit"
  );
  setBeginSaveAttemptGateForTests(null);

  // Operation-owned process lock is released when completeSaveAttempt throws.
  syncSessionOwnership.resetForTests();
  const sessionThrow = syncSessionOwnership.beginSession("u1");
  const ctxThrow = createSaveIdempotencyContext({
    userId: "u1",
    recordKind: "business_entry",
    clientRecordId: "en_r12_lock_throw",
  });
  const begunThrow = await beginCoordinatedSave(ctxThrow, {
    processLockKey: ctxThrow.idempotencyKey,
    session: sessionThrow,
  });
  assert.equal(begunThrow.decision.action, "proceed");
  setCompleteSaveAttemptGateForTests(async () => {
    throw new Error("complete_attempt_boom");
  });
  await assert.rejects(
    () =>
      completeCoordinatedSave(begunThrow.idempotency, "en_r12_lock_throw", {
        processLockKey: ctxThrow.idempotencyKey,
        processLockOwner: begunThrow.processLockOwner ?? undefined,
        lockLeaseStartedAt: begunThrow.lockLeaseStartedAt ?? undefined,
        session: sessionThrow,
      }),
    /complete_attempt_boom/
  );
  assert.equal(
    isProcessSaveLockHeld(ctxThrow.idempotencyKey),
    false,
    "owner must release the process lock when completeSaveAttempt throws"
  );
  setCompleteSaveAttemptGateForTests(null);

  // Round 13 — session authority inside lock transitions (local serialized analog).
  syncSessionOwnership.resetForTests();
  const sessionLockA = syncSessionOwnership.beginSession("u1");
  const lockAuth = await markPersistentLockInFlight({
    userId: "u1",
    clientRecordId: "en_r13_lock_auth",
    idempotencyKey: "lock-a",
    recordKind: "business_entry",
    session: sessionLockA,
  });
  const lockMutations: { startedAt: number; status: string }[] = [];
  setPersistentLockMutationObserverForTests((info) => {
    lockMutations.push({ startedAt: info.startedAt, status: info.status });
  });
  const lockHold = barrier();
  setPersistentLockInsideTransactionGateForTests(lockHold.gate);
  const staleAuthTouch = touchPersistentLock(
    "u1",
    "en_r13_lock_auth",
    lockAuth.startedAt,
    sessionLockA
  );
  await lockHold.waitUntilEntered();
  const sessionLockB = syncSessionOwnership.beginSession("u1");
  assert.notEqual(sessionLockB.generation, sessionLockA.generation);
  const mutationsAtSwitch = lockMutations.length;
  lockHold.release();
  await staleAuthTouch;
  assert.equal(lockMutations.length, mutationsAtSwitch, "A->B must not queue a lock mutation");
  const afterAB = await readPersistentSaveLock("u1", "en_r13_lock_auth");
  assert.equal(afterAB?.startedAt, lockAuth.startedAt);
  assert.equal(afterAB?.updatedAt, lockAuth.updatedAt);
  assert.equal(afterAB?.idempotencyKey, "lock-a");
  setPersistentLockInsideTransactionGateForTests(null);

  syncSessionOwnership.resetForTests();
  const sessionReloginA = syncSessionOwnership.beginSession("u1");
  const lockRelogin = await markPersistentLockInFlight({
    userId: "u1",
    clientRecordId: "en_r13_lock_relogin",
    idempotencyKey: "lock-relogin",
    recordKind: "business_entry",
    session: sessionReloginA,
  });
  const reloginMutations: number[] = [];
  setPersistentLockMutationObserverForTests((info) => {
    reloginMutations.push(info.startedAt);
  });
  const reloginHold = barrier();
  setPersistentLockInsideTransactionGateForTests(reloginHold.gate);
  const staleDone = markPersistentLockDone(
    "u1",
    "en_r13_lock_relogin",
    "stolen",
    lockRelogin.startedAt,
    sessionReloginA
  );
  await reloginHold.waitUntilEntered();
  syncSessionOwnership.endSession();
  const sessionReloginA2 = syncSessionOwnership.beginSession("u1");
  assert.notEqual(sessionReloginA2.generation, sessionReloginA.generation);
  const mutationsAtRelogin = reloginMutations.length;
  reloginHold.release();
  await staleDone;
  assert.equal(reloginMutations.length, mutationsAtRelogin, "A->logout->A must not adopt the new login");
  const afterRelogin = await readPersistentSaveLock("u1", "en_r13_lock_relogin");
  assert.equal(afterRelogin?.status, "in_flight");
  assert.notEqual(afterRelogin?.recordId, "stolen");
  setPersistentLockInsideTransactionGateForTests(null);

  await touchPersistentLock("u1", "en_r13_lock_relogin", lockRelogin.startedAt);
  const compatible = await readPersistentSaveLock("u1", "en_r13_lock_relogin");
  assert.ok((compatible?.updatedAt ?? 0) >= (lockRelogin.updatedAt ?? 0));
  assert.equal(compatible?.startedAt, lockRelogin.startedAt, "callers without session remain compatible");
  setPersistentLockMutationObserverForTests(null);

  // Round 13 — retire releases process lock without waiting for remote cleanup.
  syncSessionOwnership.resetForTests();
  const sessionRetire = syncSessionOwnership.beginSession("u1");
  const ctxRetire = createSaveIdempotencyContext({
    userId: "u1",
    recordKind: "business_entry",
    clientRecordId: "en_r13_retire",
  });
  const begunRetire = await beginCoordinatedSave(ctxRetire, {
    processLockKey: ctxRetire.idempotencyKey,
    session: sessionRetire,
  });
  assert.equal(begunRetire.decision.action, "proceed");
  await attachRecordIdToPersistentLock(
    "u1",
    "en_r13_retire",
    "en_r13_retire",
    begunRetire.lockLeaseStartedAt ?? undefined,
    sessionRetire
  );
  const pendingHold = barrier();
  setPersistentLockInsideTransactionGateForTests(pendingHold.gate);
  const retirePending = retireOwnedReservation({
    userId: "u1",
    clientRecordId: "en_r13_retire",
    processLockKey: ctxRetire.idempotencyKey,
    processLockOwner: begunRetire.processLockOwner ?? undefined,
    lockLeaseStartedAt: begunRetire.lockLeaseStartedAt ?? undefined,
    session: sessionRetire,
  });
  await pendingHold.waitUntilEntered();
  assert.equal(
    isProcessSaveLockHeld(ctxRetire.idempotencyKey),
    false,
    "process reservation must drop while remote cleanup is still pending"
  );
  pendingHold.release();
  await retirePending;
  setPersistentLockInsideTransactionGateForTests(null);

  syncSessionOwnership.resetForTests();
  const sessionReject = syncSessionOwnership.beginSession("u1");
  const ctxReject = createSaveIdempotencyContext({
    userId: "u1",
    recordKind: "business_entry",
    clientRecordId: "en_r13_reject",
  });
  const begunReject = await beginCoordinatedSave(ctxReject, {
    processLockKey: ctxReject.idempotencyKey,
    session: sessionReject,
  });
  setPersistentLockInsideTransactionGateForTests(async () => {
    throw new Error("remote_cleanup_rejected");
  });
  await retireOwnedReservation({
    userId: "u1",
    clientRecordId: "en_r13_reject",
    processLockKey: ctxReject.idempotencyKey,
    processLockOwner: begunReject.processLockOwner ?? undefined,
    lockLeaseStartedAt: begunReject.lockLeaseStartedAt ?? undefined,
    session: sessionReject,
  });
  assert.equal(isProcessSaveLockHeld(ctxReject.idempotencyKey), false);
  setPersistentLockInsideTransactionGateForTests(null);

  syncSessionOwnership.resetForTests();
  const sessionFail = syncSessionOwnership.beginSession("u1");
  const ctxFail = createSaveIdempotencyContext({
    userId: "u1",
    recordKind: "business_entry",
    clientRecordId: "en_r13_fail_caller",
  });
  const begunFail = await beginCoordinatedSave(ctxFail, {
    processLockKey: ctxFail.idempotencyKey,
    session: sessionFail,
  });
  syncSessionOwnership.endSession();
  await failCoordinatedSave(ctxFail, "session_retired", {
    processLockKey: ctxFail.idempotencyKey,
    processLockOwner: begunFail.processLockOwner ?? undefined,
    lockLeaseStartedAt: begunFail.lockLeaseStartedAt ?? undefined,
    session: sessionFail,
  });
  assert.equal(isProcessSaveLockHeld(ctxFail.idempotencyKey), false);
  assert.equal(
    await hasRetiredLeaseIntent("u1", "en_r13_fail_caller", begunFail.lockLeaseStartedAt ?? 0),
    true
  );

  syncSessionOwnership.resetForTests();
  const sessionRecover = syncSessionOwnership.beginSession("u1");
  const ctxRecover = createSaveIdempotencyContext({
    userId: "u1",
    recordKind: "business_entry",
    clientRecordId: "en_r13_recover",
  });
  const begunRecover = await beginCoordinatedSave(ctxRecover, {
    processLockKey: ctxRecover.idempotencyKey,
    session: sessionRecover,
  });
  await attachRecordIdToPersistentLock(
    "u1",
    "en_r13_recover",
    "en_r13_recover",
    begunRecover.lockLeaseStartedAt ?? undefined,
    sessionRecover
  );
  syncSessionOwnership.endSession();
  await retireOwnedReservation({
    userId: "u1",
    clientRecordId: "en_r13_recover",
    processLockKey: ctxRecover.idempotencyKey,
    processLockOwner: begunRecover.processLockOwner ?? undefined,
    lockLeaseStartedAt: begunRecover.lockLeaseStartedAt ?? undefined,
    session: sessionRecover,
  });
  const lockAfterRetire = await readPersistentSaveLock("u1", "en_r13_recover");
  assert.equal(lockAfterRetire?.status, "in_flight", "retired remote cleanup must not run under a later session");
  assert.equal(lockAfterRetire?.recordId, "en_r13_recover");
  const sessionFresh = syncSessionOwnership.beginSession("u1");
  const recovered = await beginCoordinatedSave(ctxRecover, {
    processLockKey: ctxRecover.idempotencyKey,
    session: sessionFresh,
  });
  assert.equal(recovered.decision.action, "resume");
  if (recovered.decision.action === "resume") {
    assert.equal(recovered.decision.recordId, "en_r13_recover");
  }
  assert.equal(isProcessSaveLockHeld(ctxRecover.idempotencyKey), true);
  releaseProcessSaveLock(ctxRecover.idempotencyKey, recovered.processLockOwner ?? undefined);

  const newerOwner = acquireOwnedProcessSaveLock(ctxRecover.idempotencyKey);
  assert.ok(newerOwner);
  await retireOwnedReservation({
    userId: "u1",
    clientRecordId: "en_r13_recover",
    processLockKey: ctxRecover.idempotencyKey,
    processLockOwner: begunRecover.processLockOwner ?? undefined,
    lockLeaseStartedAt: begunRecover.lockLeaseStartedAt ?? undefined,
    session: sessionRecover,
  });
  assert.equal(
    isProcessSaveLockHeld(ctxRecover.idempotencyKey),
    true,
    "retired owner must not clear a newer process reservation"
  );
  const replacementLease = await markPersistentLockInFlight({
    userId: "u1",
    clientRecordId: "en_r13_recover",
    idempotencyKey: "newer-owner",
    recordKind: "business_entry",
  });
  await retireOwnedReservation({
    userId: "u1",
    clientRecordId: "en_r13_recover",
    lockLeaseStartedAt: begunRecover.lockLeaseStartedAt ?? undefined,
    session: sessionRecover,
  });
  const stillNewerLease = await readPersistentSaveLock("u1", "en_r13_recover");
  assert.equal(stillNewerLease?.startedAt, replacementLease.startedAt);
  assert.equal(stillNewerLease?.idempotencyKey, "newer-owner");
  releaseProcessSaveLock(ctxRecover.idempotencyKey, newerOwner);

  const composerSrc = fs.readFileSync(
    path.join(import.meta.dirname, "../diary/saveComposerEntry.ts"),
    "utf8"
  );
  assert.equal(composerSrc.includes("session,"), true);
  assert.equal(composerSrc.includes("issuesRemoteWork: false"), true);
  assert.equal(composerSrc.includes("SAVE_STEP.INSIGHTS_INDEXED"), true);
  assert.equal(composerSrc.includes('await import("@/services/insights/insightSync")'), true);
  const insightStart = composerSrc.indexOf("SAVE_STEP.INSIGHTS_INDEXED");
  const insightSlice = composerSrc.slice(insightStart, insightStart + 900);
  const importAt = insightSlice.indexOf('await import("@/services/insights/insightSync")');
  const recheckAt = insightSlice.lastIndexOf("mayIssueRemoteWork(session, userId)");
  assert.ok(importAt >= 0, "composer insight callback must await insightSync import");
  assert.ok(
    recheckAt > importAt,
    "original session must be rechecked after the awaited insight import"
  );
  assert.equal(composerSrc.includes("completeCoordinatedSave"), true);

  console.log("coordinationOwnership.test.ts: ok");
}

function hasCompletedInsight(steps: string[]): boolean {
  return steps.includes(SAVE_STEP.INSIGHTS_INDEXED);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
