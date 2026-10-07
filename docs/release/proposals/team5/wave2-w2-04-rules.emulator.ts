/**
 * Team 5 W2-04 independent STORAGE_EMULATOR re-check after T2 landing.
 * Isolated rules only. Not live IAM. Do not deploy.
 * PHASE 1 denied read after objectKey.state=verified. This re-run expects retained read.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { getBytes, ref, uploadBytes } from "firebase/storage";

const toolsDir = join(dirname(fileURLToPath(import.meta.url)), "../../../../tools/goods-evidence-storage");
const PROJECT_ID = "demo-vyaamikk-grin-g2";
const OBJECT_KEY = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const ORIGINAL = `users/alice/grinEvidence/${OBJECT_KEY}/original`;
const PDF = Buffer.from("%PDF-1.4 t5-w204-phase2");

async function main(): Promise<void> {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
    throw new Error("emulators:exec required for W2-04 rules repro");
  }

  const testEnv: RulesTestEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(join(toolsDir, "firestore.rules"), "utf8") },
    storage: { rules: readFileSync(join(toolsDir, "storage.rules"), "utf8") },
  });

  try {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc("users/alice").set({ uid: "alice", status: "active" });
      await ctx.firestore().doc("users/alice/goodsEvidenceAdmission/runtime").set({
        schemaVersion: 1,
        newCommands: "allow",
        reconciliation: "allow",
      });
      await ctx.firestore().doc("users/alice/goodsEvidenceLedgers/ledger_g2").set({
        ownerUid: "alice",
        status: "active",
      });
      await ctx.firestore().doc(`users/alice/grinEvidenceObjectKeys/${OBJECT_KEY}`).set({
        schemaVersion: 1,
        objectKey: OBJECT_KEY,
        evidenceId: "ev_w204",
        ledgerId: "ledger_g2",
        receiptId: "receipt_g2",
        ownerUid: "alice",
        state: "reserved",
      });
    });

    const aliceStorage = testEnv.authenticatedContext("alice").storage();

    console.log("[STORAGE_EMULATOR] W2-04 PHASE2 baseline: original create/read while reserved");
    await assertSucceeds(uploadBytes(ref(aliceStorage, ORIGINAL), PDF, { contentType: "application/pdf" }));
    await assertSucceeds(getBytes(ref(aliceStorage, ORIGINAL)));

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`users/alice/grinEvidenceObjectKeys/${OBJECT_KEY}`).set({
        schemaVersion: 1,
        objectKey: OBJECT_KEY,
        evidenceId: "ev_w204",
        ledgerId: "ledger_g2",
        receiptId: "receipt_g2",
        ownerUid: "alice",
        state: "verified",
      });
    });

    console.log("[STORAGE_EMULATOR] W2-04 PHASE2: retained original read after verified");
    await assertSucceeds(getBytes(ref(aliceStorage, ORIGINAL)));

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc("users/alice/goodsEvidenceAdmission/runtime").set({
        schemaVersion: 1,
        newCommands: "deny",
        reconciliation: "allow",
      });
    });
    console.log("[STORAGE_EMULATOR] W2-04 PHASE2: newCommands=deny still allows retained verified read");
    await assertSucceeds(getBytes(ref(aliceStorage, ORIGINAL)));

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`users/alice/grinEvidenceObjectKeys/${OBJECT_KEY}`).set({
        schemaVersion: 1,
        objectKey: OBJECT_KEY,
        evidenceId: "ev_w204",
        ledgerId: "ledger_g2",
        receiptId: "receipt_g2",
        ownerUid: "alice",
        state: "reserved",
      });
    });
    console.log("[STORAGE_EMULATOR] W2-04 PHASE2: in-flight reserved read denied when newCommands=deny");
    await assertFails(getBytes(ref(aliceStorage, ORIGINAL)));

    console.log("W2-04 REPRODUCED_THEN_FIXED STORAGE_EMULATOR retained verified read; live rules unchanged");
    console.log("wave2-w2-04-rules.emulator.ts: ok");
  } finally {
    await testEnv.cleanup();
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
