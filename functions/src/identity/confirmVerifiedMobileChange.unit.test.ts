import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../../..");
const src = readFileSync(
  join(root, "functions/src/identity/confirmVerifiedMobileChange.ts"),
  "utf8"
);

assert.equal(src.includes("preflightVerifiedMobileContactChange"), true);
assert.equal(src.includes("confirmVerifiedMobileContactChange"), true);
assert.equal(src.includes("alreadyComplete"), true);
assert.equal(src.includes("pendingMobileChange"), true);
assert.equal(src.includes("Verified Auth phone must match"), true);
assert.equal(
  src.includes("This mobile number cannot be used for this account"),
  true,
  "collision copy must remain privacy-safe (no account-existence leak)"
);
assert.equal(src.includes("startMobileQuarantine"), true);
assert.equal(src.includes("shouldQuarantineReleasedMobile"), true);
assert.equal(src.includes("mobileReviewChangeCount"), true);
assert.equal(src.includes("phoneIndex"), true);
assert.equal(src.includes("shouldCancelQuarantineOnUnassignedBind"), true);
assert.equal(
  src.includes("throwMobileQuarantined"),
  false,
  "unassigned leftover quarantine must not fail contact-change bind"
);
// Must not create users / allocate UEID
assert.equal(src.includes("generateUEID"), false);
assert.equal(src.includes("resolveOrCreateUserByPhone"), false);

console.log("confirmVerifiedMobileChange.unit.test.ts: ok");
