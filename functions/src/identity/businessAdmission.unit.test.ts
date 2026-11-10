import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { HttpsError } from "firebase-functions/v2/https";

import { assertBusinessAgeAdmitted, decideBusinessAge } from "./businessAdmission";
import { processingPurposeReceipt } from "../privacy/processingPurpose";

assert.equal(decideBusinessAge(null), "missing");
assert.equal(decideBusinessAge({}), "active");
assert.equal(decideBusinessAge({ status: "active" }), "active");
assert.equal(decideBusinessAge({ status: "active", ageEligibility: "unassessed" }), "active");
assert.equal(decideBusinessAge({ status: "active", ageEligibility: "ineligible" }), "active");
assert.equal(decideBusinessAge({ status: "active", ageEligibility: "eligible" }), "active");
assert.equal(decideBusinessAge({ status: "active", demographicAgeBand: "skipped" }), "active");
assert.equal(decideBusinessAge({ status: "active", demographicAgeBand: "under_18" }), "active");
assert.equal(decideBusinessAge({ status: "active", demographicAgeBand: "prefer_not_to_say" }), "active");
assert.equal(decideBusinessAge({ status: "pending_deletion", ageEligibility: "eligible" }), "inactive");
assert.equal(decideBusinessAge({ status: "deleted", demographicAgeBand: "55_plus" }), "inactive");

async function main() {
await assertBusinessAgeAdmitted("owner", async () => ({ status: "active" }));
await assertBusinessAgeAdmitted("owner", async () => ({ status: "active", demographicAgeBand: "skipped" }));
await assertBusinessAgeAdmitted("owner", async () => ({
  status: "active",
  ageEligibility: "ineligible",
  demographicAgeBand: "prefer_not_to_say",
}));
await assert.rejects(
  () => assertBusinessAgeAdmitted("gone", async () => null),
  (error: unknown) => error instanceof HttpsError && error.code === "failed-precondition"
);
await assert.rejects(
  () => assertBusinessAgeAdmitted("pending", async () => ({ status: "pending_deletion", ageEligibility: "eligible" })),
  (error: unknown) => error instanceof HttpsError && error.code === "failed-precondition"
);

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
