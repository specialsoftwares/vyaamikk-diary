import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { HttpsError } from "firebase-functions/v2/https";

import { assertBusinessAccountActive, decideBusinessAccount } from "./businessAdmission";
import { processingPurposeReceipt } from "../privacy/processingPurpose";

async function main() {
  assert.equal(decideBusinessAccount(null), "missing");
  assert.equal(decideBusinessAccount({}), "active", "legacy active status default remains");
  assert.equal(decideBusinessAccount({ status: "pending_deletion", ageEligibility: "eligible" }), "inactive");
  // A real new profile has no age assertion. Demographic and historical age
  // values are never authorization, including an explicit old ineligible value.
  for (const ageEligibility of [undefined, "unassessed", "ineligible", "eligible"]) {
    const profile = { status: "active", ageEligibility };
    await assertBusinessAccountActive("new-owner", async () => profile);
  }
  for (const profile of [null, { status: "pending_deletion" }, { status: "deleted" }, { status: "disabled" }]) {
    await assert.rejects(
      () => assertBusinessAccountActive("owner", async () => profile),
      (error: unknown) => error instanceof HttpsError && error.code === "failed-precondition"
    );
  }

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
  assert.doesNotMatch(age, /assertBusinessAccountActive/);
  assert.match(seal, /assertBusinessAccountActive/);
  assert.match(grin, /assertBusinessAccountActive/);
  assert.doesNotMatch(billing, /assertBusinessAccountActive/);

  console.log("businessAdmission.unit.test.ts: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
