/** Selected RC Firestore rules, not the isolated GRIN proposal. No live project. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, setLogLevel, updateDoc } from "firebase/firestore";

setLogLevel("silent");
const projectId = process.env.GCLOUD_PROJECT ?? "";
assert.match(projectId, /^demo-/);
const phone = { auth_time: 2000, firebase: { sign_in_provider: "phone" as const }, authorityWatermark: 7 };
const paths = [
  "goodsEvidenceAdmission/runtime", "grinEvidenceObjectKeys/object", "grinEvidenceDerivativeKeys/derivative",
  "goodsEvidenceLedgers/ledger", "goodsEvidenceLedgers/ledger/commands/command", "goodsEvidenceLedgers/ledger/serials/2026",
  "goodsEvidenceLedgers/ledger/evidenceObjects/evidence", "goodsEvidenceLedgers/ledger/receipts/receipt",
  "goodsEvidenceLedgers/ledger/receipts/receipt/events/event", "goodsEvidenceLedgers/ledger/receipts/receipt/evidenceLinks/evidence",
  "goodsEvidenceLedgers/ledger/receipts/receipt/evidenceControl/runtime",
].map(p => `users/alice/${p}`);

async function run(rulesFile: string) {
  const env = await initializeTestEnvironment({ projectId, firestore: { rules: readFileSync(rulesFile, "utf8") } });
  const seed = async (path: string, value: object) => env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), path), value));
  const remove = async (path: string) => env.withSecurityRulesDisabled(ctx => deleteDoc(doc(ctx.firestore(), path)));
  try {
    await env.clearFirestore();
    await seed("users/alice", { uid: "alice", status: "active" });
    await seed("restoreControl/current", { closed: false, reconciled: true, watermark: 7 });
    await seed("restoreControl/mode", { required: true });
    for (const path of paths) await seed(path, { ownerUid: "alice", state: "reserved" });
    await seed("users/alice/goodsEvidenceUploadControl/runtime", { active: [] });
    const owner = env.authenticatedContext("alice", phone).firestore();
    const other = env.authenticatedContext("mallory", phone).firestore();
    const anon = env.unauthenticatedContext().firestore();
    for (const path of paths) {
      await assertSucceeds(getDoc(doc(owner, path)));
      await assertFails(getDoc(doc(other, path)));
      await assertFails(getDoc(doc(anon, path)));
      await assertFails(setDoc(doc(owner, `${path}-new`), { ownerUid: "alice" }));
      await assertFails(updateDoc(doc(owner, path), { state: "verified", ownerUid: "mallory", generation: "forged" }));
      await assertFails(deleteDoc(doc(owner, path)));
    }
    await assertSucceeds(getDocs(collection(owner, "users/alice/goodsEvidenceLedgers")));
    await assertFails(getDocs(collection(other, "users/alice/goodsEvidenceLedgers")));
    await assertFails(getDoc(doc(owner, "users/alice/goodsEvidenceUploadControl/runtime")));
    await assertFails(setDoc(doc(owner, "users/alice/goodsEvidenceStorage/accounting"), { usedBytes: 0 }));

    const denyAll = async (db = owner) => {
      for (const path of paths) await assertFails(getDoc(doc(db, path)));
    };
    await seed("users/alice", { uid: "alice", status: "pending_deletion" });
    await denyAll();
    await seed("users/alice", { uid: "alice", status: "active" });
    await seed("deletionJobs/alice", { status: "completed" });
    await denyAll();
    await remove("deletionJobs/alice");
    await seed("authSecurity/alice", { revokedBeforeAuthTimeSeconds: 2000 });
    await denyAll();
    await remove("authSecurity/alice");
    await seed("restoreControl/current", { closed: true, reconciled: true, watermark: 7 });
    await denyAll();
    await seed("restoreControl/current", { closed: false, reconciled: true, watermark: 7 });
    await denyAll(env.authenticatedContext("alice", { ...phone, authorityWatermark: 6 }).firestore());
    await denyAll(env.authenticatedContext("alice", { ...phone, erased: true }).firestore());
    await remove("users/alice");
    await denyAll();
    console.log(`selected GRIN Firestore rules: ${rulesFile}: ok`);
  } finally { await env.cleanup(); }
}
async function main() {
  const files = process.argv.slice(2);
  for (const file of files.length ? files : ["firestore.rules", "rules/activated/firestore.rules"]) await run(file);
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
