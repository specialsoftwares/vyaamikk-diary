/**
 * Isolated Firestore emulator. Walks the documented activation phases with the
 * production admission, hold, and fence adapters. This does not provision a
 * cloud project.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { doc, getDoc, setDoc } from "firebase/firestore";

import { createFirestoreRestoreHoldStore, rewriteOpenReconciledFence } from "../deletion/firestoreRestoreAdapters";
import { privilegedWorkerHold, readDurableWorkerHold } from "../deletion/privilegedWorkerGuard";
import { activationStopBehaviour, releaseRestoreHolds } from "../deletion/restoreControlPlane";
import { restoreAdmissionForUid, restoreTrafficDecisionForUid } from "../deletion/restoreGate";
import { claimsForAdmission, parseRestoreAuthoritySnapshot } from "../deletion/restoreAuthority";

const PROJECT = "demo-vyaamikk-privacy-adapters";
const AUTHORITY_DB = "rehearsal-authority";
const HOLD_DB = "rehearsal-holds";
const LIVE = "live-owner";
const ERASED = "erased-owner";
const WITHDRAWN = "withdrawn-owner";

async function canRead(env: RulesTestEnvironment, uid: string, claims?: Record<string, unknown>): Promise<boolean> {
  const db = env.authenticatedContext(uid, {
    auth_time: 100,
    firebase: { sign_in_provider: "phone" },
    ...claims,
  }).firestore();
  try {
    return (await getDoc(doc(db, "users", uid, "entries", "legacy-entry"))).exists();
  } catch {
    return false;
  }
}

async function seedReadableEntry(env: RulesTestEnvironment, uid: string): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users", uid), { uid, status: "active", ageEligibility: "eligible", updatedAt: 10 });
    await setDoc(doc(db, "users", uid, "entries", "legacy-entry"), {
      userId: uid,
      title: "synthetic restored private text",
      updatedAt: 10,
    });
  });
}

async function main(): Promise<void> {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/);
  const previousAuthority = process.env.RESTORE_AUTHORITY_DATABASE_ID;
  const previousProtection = process.env.RESTORE_PROTECTION_ACTIVE;
  const previousHold = process.env.RESTORE_HOLD_DATABASE_ID;
  delete process.env.RESTORE_AUTHORITY_DATABASE_ID;
  delete process.env.RESTORE_PROTECTION_ACTIVE;
  delete process.env.RESTORE_HOLD_DATABASE_ID;

  const app = initializeApp({ projectId: PROJECT }, "activation-rehearsal");
  if (getApps().every((item) => item.name !== "[DEFAULT]")) {
    initializeApp({ projectId: PROJECT });
  }
  const primary = getFirestore(app);
  const authorityDb = getFirestore(app, AUTHORITY_DB);
  const holdDb = getFirestore(app, HOLD_DB);

  try {
    assert.equal(activationStopBehaviour(0).safeAction, "remain");
    assert.equal(await privilegedWorkerHold(process.env, () => readDurableWorkerHold(process.env)), "running");
    assert.equal((await restoreAdmissionForUid(LIVE)).status, "skip");

    await authorityDb.doc("authority/restore").set({
      watermark: 4,
      erasedUids: [ERASED],
      withdrawnPurposes: { [WITHDRAWN]: ["crash_diagnostics"] },
    });
    process.env.RESTORE_AUTHORITY_DATABASE_ID = AUTHORITY_DB;
    await primary.doc("restoreControl/current").set({ closed: false, reconciled: true, watermark: 4 });
    await primary.doc("restoreControl/mode").set({ required: false });

    const existing = await restoreAdmissionForUid(LIVE);
    const freshLogin = await restoreAdmissionForUid("new-login");
    assert.equal(existing.status, "admit");
    assert.equal(existing.authorityWatermark, 4);
    assert.equal(freshLogin.status, "admit");
    const recovery = claimsForAdmission(
      { recoveryDeviceId: "device-1", recoverySession: true },
      existing
    );
    assert.equal(recovery.authorityWatermark, 4);
    assert.equal(recovery.recoverySession, true);
    assert.equal((await restoreAdmissionForUid(ERASED)).status, "deny");
    assert.equal((await restoreAdmissionForUid(WITHDRAWN, "crash_diagnostics")).status, "deny");
    assert.equal((await restoreAdmissionForUid(WITHDRAWN, "diary")).status, "admit");

    await primary.doc("restoreControl/current").set({ closed: false, reconciled: true, watermark: 3 });
    assert.equal((await restoreAdmissionForUid(LIVE)).status, "deny");
    await primary.doc("restoreControl/current").set({ closed: false, reconciled: true, watermark: 4 });
    const minted = claimsForAdmission({ vydOriginAuthTime: 100 }, await restoreAdmissionForUid(LIVE));
    assert.equal(minted.authorityWatermark, 4);
    assert.notEqual(minted.authorityWatermark, 3);
    assert.equal(await privilegedWorkerHold(process.env, () => readDurableWorkerHold(process.env)), "running");
    assert.equal(activationStopBehaviour(1).safeAction, "do_not_deploy_activated_rules_yet");
    assert.equal(await restoreTrafficDecisionForUid(LIVE), "allow");

    const preRules = readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8");
    const activatedRules = readFileSync(resolve(process.cwd(), "rules/activated/firestore.rules"), "utf8");
    assert.notEqual(activatedRules, preRules);
    const pre = await initializeTestEnvironment({
      projectId: "demo-vyaamikk-rehearsal-pre",
      firestore: { rules: preRules },
    });
    const activated = await initializeTestEnvironment({
      projectId: "demo-vyaamikk-rehearsal-activated",
      firestore: { rules: activatedRules },
    });
    try {
      await seedReadableEntry(pre, LIVE);
      await seedReadableEntry(activated, LIVE);
      await pre.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "restoreControl", "current"), {
          closed: false,
          reconciled: true,
          watermark: 4,
        });
      });
      assert.equal(await canRead(pre, LIVE), true, "phase 1 still admits an unmarked session");
      await activated.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "restoreControl", "current"), {
          closed: false,
          reconciled: true,
          watermark: 4,
        });
        await setDoc(doc(ctx.firestore(), "restoreControl", "mode"), { required: false });
      });
      assert.equal(await canRead(activated, LIVE), false, "activated rules deny an unmarked session");
      assert.equal(await canRead(activated, LIVE, { authorityWatermark: 3 }), false, "a stale claim stays denied");
      assert.equal(await canRead(activated, LIVE, { authorityWatermark: 4 }), true, "the minted claim matches");
      assert.equal(
        await canRead(activated, LIVE),
        false,
        "setting required false does not restore an unmarked session"
      );
    } finally {
      await pre.cleanup();
      await activated.cleanup();
    }

    assert.equal(activationStopBehaviour(2).workersProtected, false);
    assert.equal(await privilegedWorkerHold(process.env, () => readDurableWorkerHold(process.env)), "running");

    process.env.RESTORE_PROTECTION_ACTIVE = "true";
    process.env.RESTORE_HOLD_DATABASE_ID = HOLD_DB;
    assert.equal(await privilegedWorkerHold(process.env, () => readDurableWorkerHold(process.env)), "stopped");
    assert.equal(await restoreTrafficDecisionForUid(LIVE), "deny");
    const holds = createFirestoreRestoreHoldStore(primary, holdDb);
    assert.equal((await releaseRestoreHolds(holds, 4)).reason, "workers_released");
    assert.equal((await holds.readHolds()).traffic, "closed");
    assert.equal(await restoreTrafficDecisionForUid(LIVE), "deny");
    assert.equal((await releaseRestoreHolds(holds, 4)).released, true);
    assert.equal(await restoreTrafficDecisionForUid(LIVE), "allow");
    assert.equal(await restoreTrafficDecisionForUid(ERASED), "deny");
    assert.equal(await restoreTrafficDecisionForUid(WITHDRAWN, "crash_diagnostics"), "deny");
    assert.equal(await privilegedWorkerHold(process.env, () => readDurableWorkerHold(process.env)), "running");
    assert.equal(activationStopBehaviour(3).safeAction, "close_fence_and_holds");

    await primary.doc("restoreControl/current").delete();
    const authority = parseRestoreAuthoritySnapshot((await authorityDb.doc("authority/restore").get()).data());
    assert.equal(await rewriteOpenReconciledFence(primary, authority, { watermark: 4 }), "refused");
    assert.equal((await primary.doc("restoreControl/current").get()).exists, false);
    assert.equal(
      await rewriteOpenReconciledFence(primary, authority, {
        watermark: 4,
        erasedUids: [ERASED],
        withdrawnPurposes: { [WITHDRAWN]: ["crash_diagnostics"] },
      }),
      "rewritten"
    );
    assert.equal((await primary.doc("restoreControl/current").get()).get("watermark"), 4);
    assert.equal((await restoreAdmissionForUid(ERASED)).status, "deny");
    assert.equal((await restoreAdmissionForUid(LIVE)).status, "admit");
    assert.equal(activationStopBehaviour(4).safeAction, "reopen_only_after_erasure_proof");
    console.log("activation rehearsal: phases, erasure proof, and worker transition passed");
  } finally {
    if (previousAuthority === undefined) delete process.env.RESTORE_AUTHORITY_DATABASE_ID;
    else process.env.RESTORE_AUTHORITY_DATABASE_ID = previousAuthority;
    if (previousProtection === undefined) delete process.env.RESTORE_PROTECTION_ACTIVE;
    else process.env.RESTORE_PROTECTION_ACTIVE = previousProtection;
    if (previousHold === undefined) delete process.env.RESTORE_HOLD_DATABASE_ID;
    else process.env.RESTORE_HOLD_DATABASE_ID = previousHold;
    await deleteApp(app);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
