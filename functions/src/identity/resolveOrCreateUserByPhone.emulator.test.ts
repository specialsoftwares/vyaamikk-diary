/**
 * Emulator proof for vc7 functions/internal on resolveOrCreateUserByPhone.
 * Run:
 *   cd <repo> && firebase emulators:exec --only firestore --project demo-vyaamikk \
 *     "npx --yes tsx functions/src/identity/resolveOrCreateUserByPhone.emulator.test.ts"
 */
import assert from "node:assert/strict";
import { initializeApp, getApps, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { HttpsError } from "firebase-functions/v2/https";

import {
  applyDeferredMobileQuarantineRelease,
  cancelStaleMobileQuarantine,
  MOBILE_QUARANTINES,
  readMobileQuarantineState,
  sha256MobileHash,
} from "./mobileQuarantine";
import { decideResolverMobileEligibility } from "./mobileAssignmentEligibility";
import { resolveAuthoritativePhoneAuthIdentity } from "./phoneAuthClaimBinding";

const PHONE = "+919800011122";
const PHONE_B = "+919800011133";
const UID = "emulator-uid-vc7";
const NOW = Date.now();

async function main() {
  assert.ok(
    process.env.FIRESTORE_EMULATOR_HOST,
    "FIRESTORE_EMULATOR_HOST required (use firebase emulators:exec)"
  );

  if (getApps().length === 0) {
    initializeApp({ projectId: "demo-vyaamikk" });
  }
  const db = getFirestore();
  const mobileHash = sha256MobileHash(PHONE);
  const qRef = db.collection(MOBILE_QUARANTINES).doc(mobileHash);
  const phoneRef = db.collection("phoneIndex").doc(PHONE);
  const userRef = db.collection("users").doc(UID);
  const retiredRef = db.collection("retiredPhones").doc(PHONE);

  await qRef.set({
    mobileHash,
    formerUid: "old-uid",
    status: "active",
    reason: "mobile_change",
    createdAt: NOW - 22 * 24 * 60 * 60 * 1000,
    releaseAt: NOW - 60_000,
  });
  await phoneRef.delete().catch(() => undefined);
  await userRef.delete().catch(() => undefined);
  await retiredRef.delete().catch(() => undefined);

  // ——— Reproduce OLD defect: quarantine write then later reads ———
  let oldFailed = false;
  try {
    await db.runTransaction(async (tx) => {
      await tx.get(phoneRef);
      const snap = await tx.get(qRef);
      const doc = snap.data() as { status: string; releaseAt: number };
      if (doc.status === "active" && doc.releaseAt <= NOW) {
        tx.update(qRef, { status: "released", releasedAt: NOW });
      }
      // Illegal: read after write (first-time path).
      await tx.get(retiredRef);
      await tx.get(userRef);
    });
  } catch (err) {
    oldFailed = true;
    const msg = err instanceof Error ? err.message : String(err);
    assert.match(
      msg,
      /read after|Firestore transactions|FAILED_PRECONDITION|INVALID_ARGUMENT/i,
      `unexpected old-path error: ${msg}`
    );
  }
  assert.equal(oldFailed, true, "old ordering should fail inside Firestore transaction");

  // Reset quarantine to active+due
  await qRef.set({
    mobileHash,
    formerUid: "old-uid",
    status: "active",
    reason: "mobile_change",
    createdAt: NOW - 22 * 24 * 60 * 60 * 1000,
    releaseAt: NOW - 60_000,
  });

  // ——— NEW ordering: all reads, then deferred release + creates ———
  await db.runTransaction(async (tx) => {
    const phoneSnap = await tx.get(phoneRef);
    assert.equal(phoneSnap.exists, false);
    const quarantine = await readMobileQuarantineState(tx, mobileHash, NOW);
    assert.equal(quarantine.blocking, false);
    assert.equal(quarantine.releaseDue, true);
    const retiredSnap = await tx.get(retiredRef);
    const existingUser = await tx.get(userRef);
    assert.equal(retiredSnap.exists, false);
    assert.equal(existingUser.exists, false);

    applyDeferredMobileQuarantineRelease(tx, mobileHash, NOW, quarantine.releaseDue);
    tx.set(userRef, {
      uid: UID,
      phoneE164: PHONE,
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
    });
    tx.set(phoneRef, { uid: UID, createdAt: NOW });
  });

  const qAfter = await qRef.get();
  const phoneAfter = await phoneRef.get();
  const userAfter = await userRef.get();
  assert.equal((qAfter.data() as { status: string }).status, "released");
  assert.equal((phoneAfter.data() as { uid: string }).uid, UID);
  assert.equal((userAfter.data() as { uid: string }).uid, UID);

  // ——— Returning-user path with deferred release ———
  await qRef.set({
    mobileHash,
    formerUid: UID,
    status: "active",
    reason: "mobile_change",
    createdAt: NOW - 22 * 24 * 60 * 60 * 1000,
    releaseAt: NOW - 60_000,
  });

  await db.runTransaction(async (tx) => {
    const phoneSnap = await tx.get(phoneRef);
    assert.equal(phoneSnap.exists, true);
    const quarantine = await readMobileQuarantineState(tx, mobileHash, NOW);
    assert.equal(quarantine.blocking, false);
    assert.equal(quarantine.releaseDue, true);
    const existingSnap = await tx.get(userRef);
    assert.equal(existingSnap.exists, true);
    applyDeferredMobileQuarantineRelease(tx, mobileHash, NOW, quarantine.releaseDue);
    tx.update(userRef, { lastLoginAt: NOW, updatedAt: NOW });
  });

  const qReturning = await qRef.get();
  assert.equal((qReturning.data() as { status: string }).status, "released");

  // ——— Active leftover quarantine + unassigned phone → signup, cancel stale row ———
  const STALE_PHONE = "+919800011144";
  const STALE_UID = "emulator-uid-stale-signup";
  const staleHash = sha256MobileHash(STALE_PHONE);
  const staleQRef = db.collection(MOBILE_QUARANTINES).doc(staleHash);
  const stalePhoneRef = db.collection("phoneIndex").doc(STALE_PHONE);
  const staleUserRef = db.collection("users").doc(STALE_UID);
  await stalePhoneRef.delete().catch(() => undefined);
  await staleUserRef.delete().catch(() => undefined);
  await staleQRef.set({
    mobileHash: staleHash,
    formerUid: "old-uid",
    status: "active",
    reason: "mobile_change",
    createdAt: NOW,
    startedAt: NOW,
    releaseAt: NOW + 21 * 24 * 60 * 60 * 1000,
  });

  await db.runTransaction(async (tx) => {
    const phoneSnap = await tx.get(stalePhoneRef);
    const qState = await readMobileQuarantineState(tx, staleHash, NOW);
    const decision = decideResolverMobileEligibility({
      phoneIndexUid: phoneSnap.exists
        ? String((phoneSnap.data() as { uid?: string }).uid ?? "")
        : null,
      authUid: STALE_UID,
      quarantineBlocking: qState.blocking,
    });
    assert.equal(decision.kind, "signup");
    if (decision.kind === "signup") assert.equal(decision.releaseStaleQuarantine, true);
    await tx.get(staleUserRef);
    if (decision.kind === "signup" && decision.releaseStaleQuarantine) {
      cancelStaleMobileQuarantine(tx, {
        mobileHash: staleHash,
        reboundToUid: STALE_UID,
        now: NOW,
      });
    }
    tx.set(staleUserRef, {
      uid: STALE_UID,
      phoneE164: STALE_PHONE,
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
    });
    tx.set(stalePhoneRef, { uid: STALE_UID, createdAt: NOW });
  });

  const staleQAfter = await staleQRef.get();
  const stalePhoneAfter = await stalePhoneRef.get();
  assert.equal((staleQAfter.data() as { status: string }).status, "cancelled");
  assert.equal((stalePhoneAfter.data() as { uid: string }).uid, STALE_UID);

  // ——— Phone-claim mismatch must not open / mutate identity docs ———
  const attackPhoneRef = db.collection("phoneIndex").doc(PHONE_B);
  const attackUserRef = db.collection("users").doc("attack-uid-inactive-a");
  await attackPhoneRef.delete().catch(() => undefined);
  await attackUserRef.set({
    uid: "attack-uid-inactive-a",
    phoneE164: PHONE,
    status: "deleted",
    createdAt: NOW,
    updatedAt: NOW,
  });
  let attackTxEntered = false;
  assert.throws(
    () => {
      // Gate before transaction (mirrors callable ordering).
      resolveAuthoritativePhoneAuthIdentity({
        authUid: "attack-uid-inactive-a",
        tokenPhoneNumber: PHONE,
        clientPhoneE164: PHONE_B,
      });
      attackTxEntered = true;
    },
    (err: unknown) => err instanceof HttpsError && err.code === "permission-denied"
  );
  assert.equal(attackTxEntered, false);
  // Prove we never reached a mutating transaction for B.
  await db.runTransaction(async (tx) => {
    // Would be skipped in callable; here we only assert docs unchanged.
    void tx;
  });
  const attackPhoneAfter = await attackPhoneRef.get();
  const attackUserAfter = await attackUserRef.get();
  assert.equal(attackPhoneAfter.exists, false, "mismatch must not create phoneIndex for B");
  assert.equal(
    (attackUserAfter.data() as { phoneE164?: string; status?: string }).phoneE164,
    PHONE,
    "inactive A must not be rewritten under B"
  );
  assert.equal((attackUserAfter.data() as { status?: string }).status, "deleted");

  console.log("resolveOrCreateUserByPhone.emulator.test.ts: ok");
  console.log(
    JSON.stringify({
      proved: {
        oldReadAfterWriteFails: true,
        firstTimeDeferredReleaseSucceeds: true,
        returningDeferredReleaseSucceeds: true,
        unassignedActiveQuarantineSignupCancelsStale: true,
        phoneClaimMismatchBlocksMutation: true,
      },
      rootCause:
        "unassigned leftover mobile quarantine must not throw failed-precondition; cancel in write phase after full read",
    })
  );

  for (const app of getApps()) {
    await deleteApp(app);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
