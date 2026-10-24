import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

const PROJECT_ID = "demo-vyaamikk-grin-g1";
const RULES = readFileSync(resolve(process.cwd(), "tools/goods-evidence-emulator/firestore.rules"), "utf8");

async function main(): Promise<void> {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST required");
  const testEnv: RulesTestEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: RULES, host: "127.0.0.1", port: 8088 },
  });

  try {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "users/alice"), { uid: "alice", status: "active" });
      await setDoc(doc(db, "users/bob"), { uid: "bob", status: "active" });
      await setDoc(doc(db, "users/gone"), { uid: "gone", status: "pending_deletion" });
      await setDoc(doc(db, "users/alice/goodsEvidenceLedgers/ledger_1"), { ownerUid: "alice", status: "active" });
      await setDoc(doc(db, "users/alice/goodsEvidenceLedgers/ledger_1/receipts/r1"), {
        original: { receiptId: "r1", ownerUid: "alice" },
      });
      await setDoc(doc(db, "users/alice/goodsEvidenceLedgers/ledger_1/commands/command01"), { digest: "abc" });
      await setDoc(doc(db, "users/alice/goodsEvidenceLedgers/ledger_1/serials/FY2026-27"), { nextSerial: 2 });
      await setDoc(doc(db, "users/alice/goodsEvidenceLedgers/ledger_1/receipts/r1/events/id_1"), { eventId: "id_1" });
      await setDoc(doc(db, "users/alice/goodsEvidenceAdmission/runtime"), { schemaVersion: 1, newCommands: "allow", reconciliation: "allow" });
      await setDoc(doc(db, "users/gone/goodsEvidenceLedgers/ledger_1/receipts/r1"), { original: { receiptId: "r1" } });
    });

    const unauth = testEnv.unauthenticatedContext().firestore();
    const alice = testEnv.authenticatedContext("alice").firestore();
    const bob = testEnv.authenticatedContext("bob").firestore();
    const gone = testEnv.authenticatedContext("gone").firestore();

    await assertFails(getDoc(doc(unauth, "users/alice/goodsEvidenceLedgers/ledger_1/receipts/r1")));
    await assertFails(getDoc(doc(bob, "users/alice/goodsEvidenceLedgers/ledger_1/receipts/r1")));
    await assertSucceeds(getDoc(doc(alice, "users/alice/goodsEvidenceLedgers/ledger_1/receipts/r1")));
    await assertFails(getDoc(doc(gone, "users/gone/goodsEvidenceLedgers/ledger_1/receipts/r1")));

    await assertFails(setDoc(doc(alice, "users/alice/goodsEvidenceLedgers/ledger_1/serials/FY2026-27"), { nextSerial: 99 }));
    await assertFails(setDoc(doc(alice, "users/alice/goodsEvidenceLedgers/ledger_1/receipts/r2"), { original: {} }));
    await assertFails(updateDoc(doc(alice, "users/alice/goodsEvidenceLedgers/ledger_1/receipts/r1"), { hack: true }));
    await assertFails(deleteDoc(doc(alice, "users/alice/goodsEvidenceLedgers/ledger_1/receipts/r1")));
    await assertFails(deleteDoc(doc(alice, "users/alice/goodsEvidenceLedgers/ledger_1/commands/command01")));
    await assertFails(updateDoc(doc(alice, "users/alice/goodsEvidenceLedgers/ledger_1/receipts/r1/events/id_1"), { eventHash: "x" }));
    await assertFails(setDoc(doc(alice, "users/alice/goodsEvidenceAdmission/runtime"), { newCommands: "allow" }));
    await assertFails(getDoc(doc(alice, "users/alice/goodsEvidenceAdmission/runtime")));
    await assertFails(setDoc(doc(alice, "users/alice"), { status: "active" }));
  } finally {
    await testEnv.cleanup();
  }

  console.log("tools/goods-evidence-emulator/rules.emulator.test.ts: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
