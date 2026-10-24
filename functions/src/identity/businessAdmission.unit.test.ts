import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { HttpsError } from "firebase-functions/v2/https";

import { assertBusinessAgeAdmitted, decideBusinessAge } from "./businessAdmission";
import { processingPurposeReceipt } from "../privacy/processingPurpose";

assert.equal(decideBusinessAge(null), "unassessed");
assert.equal(decideBusinessAge({ status: "active" }), "unassessed");
assert.equal(decideBusinessAge({ status: "active", ageEligibility: "unassessed" }), "unassessed");
assert.equal(decideBusinessAge({ status: "active", ageEligibility: "ineligible" }), "ineligible");
assert.equal(decideBusinessAge({ status: "active", ageEligibility: "eligible" }), "eligible");
assert.equal(decideBusinessAge({ status: "pending_deletion", ageEligibility: "eligible" }), "inactive");

async function main() {
await assert.rejects(
  () => assertBusinessAgeAdmitted("young", async () => ({ status: "active" })),
  (error: unknown) => error instanceof HttpsError && error.code === "failed-precondition"
);
await assertBusinessAgeAdmitted("adult", async () => ({ status: "active", ageEligibility: "eligible" }));

const serverNow = 1_700_000_000_000;
const receipt = processingPurposeReceipt(
  {
    uid: "adult",
    purpose: "crash_diagnostics",
    decision: "withdraw",
    noticeVersion: "privacy-notice-2026-10",
    policyVersion: "processing-purpose-2026-10",
    clientReceivedAt: 1,
  },
  serverNow
);
assert.equal(receipt.receivedAt, serverNow);
assert.notEqual(receipt.receivedAt, 1);
assert.throws(
  () =>
    processingPurposeReceipt(
      {
        uid: "adult",
        purpose: "service_operation",
        decision: "withdraw",
        noticeVersion: "privacy-notice-2026-10",
        policyVersion: "processing-purpose-2026-10",
      },
      serverNow
    ),
  (error: unknown) => error instanceof HttpsError && error.message === "required_processing"
);

const root = resolve(process.cwd(), "functions/src");
const age = readFileSync(resolve(root, "identity/recordAgeAssessment.ts"), "utf8");
const seal = readFileSync(resolve(root, "privacy/ownerContent.ts"), "utf8");
const grin = readFileSync(resolve(root, "goodsEvidence/productionExports.ts"), "utf8");
const billing = readFileSync(resolve(root, "billing/callables/androidRtdn.ts"), "utf8");
assert.doesNotMatch(age, /assertBusinessAgeAdmitted/);
assert.match(seal, /assertBusinessAgeAdmitted/);
assert.match(grin, /assertBusinessAgeAdmitted/);
assert.doesNotMatch(billing, /assertBusinessAgeAdmitted/);

console.log("businessAdmission.unit.test.ts: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
