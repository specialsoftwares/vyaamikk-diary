/**
 * Team 5 W2-04 independent STORAGE_EMULATOR repro.
 * Isolated rules only. Not live IAM. Do not deploy.
 * Existing rules.emulator.test.ts reads while reservation is still reserved — that mapping is not closure.
 */
import assert from "node:assert/strict";
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
const PDF = Buffer.from("%PDF-1.4 t5-w204-original");

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
      await ctx.firestore().doc(`users/alice/grinEvidenceObjectKeys/${OBJECT_KEY}`).set({
        schemaVersion: 1,
        objectKey: OBJECT_KEY,
        evidenceId: "ev_w204",
        ledgerId: "ledger_g2",
        receiptId: "receipt_g2",
        state: "reserved",
      });
    });

    const aliceStorage = testEnv.authenticatedContext("alice").storage();

    console.log("[STORAGE_EMULATOR] W2-04 baseline: original create/read while reserved");
    await assertSucceeds(uploadBytes(ref(aliceStorage, ORIGINAL), PDF, { contentType: "application/pdf" }));
    await assertSucceeds(getBytes(ref(aliceStorage, ORIGINAL)));

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`users/alice/grinEvidenceObjectKeys/${OBJECT_KEY}`).set({
        schemaVersion: 1,
        objectKey: OBJECT_KEY,
        evidenceId: "ev_w204",
        ledgerId: "ledger_g2",
        receiptId: "receipt_g2",
        state: "verified",
      });
    });

    console.log("[STORAGE_EMULATOR] W2-04: original read after reservation leaves reserved/uploading");
    await assertFails(getBytes(ref(aliceStorage, ORIGINAL)));
    console.log("W2-04 REPRODUCED STORAGE_EMULATOR isolated original read denied once objectKey.state=verified");
    console.log("tools/goods-evidence-storage/storage.rules:80-83 hasFlightReservation reserved|uploading");
    console.log("wave2-w2-04-rules.emulator.ts: ok");
  } finally {
    await testEnv.cleanup();
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
