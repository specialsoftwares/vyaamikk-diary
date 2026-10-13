/**
 * Empty or forged purchase admission must not become a purchase token.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PLAY_PURCHASE_ADMISSION_CALLABLE,
  interpretPurchaseAdmission,
  isPlayPurchaseAdmissionToken,
  purchaseAdmissionFromCallFailure,
} from "./purchaseAdmission";

{
  const allowed = interpretPurchaseAdmission({ purchaseAllowed: true, testerUids: ["uid-secret"] });
  assert.equal(allowed.status, "allowed");
  if (allowed.status === "allowed") {
    assert.equal(isPlayPurchaseAdmissionToken(allowed.token), true);
    assert.equal("testerUids" in allowed.token, false);
  }
}

for (const payload of [
  null,
  undefined,
  {},
  [],
  "",
  { purchaseAllowed: false },
  { purchaseAllowed: "true" },
  { purchaseAllowed: 1 },
  { testerUids: [] },
  { testerUids: ["uid-a"] },
  { purchaseAllowed: true, nested: { testerUids: ["uid-a"] } },
]) {
  if (
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    (payload as { purchaseAllowed?: unknown }).purchaseAllowed === true
  ) {
    continue;
  }
  const result = interpretPurchaseAdmission(payload);
  assert.equal(result.status, "closed", JSON.stringify(payload));
  assert.equal(isPlayPurchaseAdmissionToken(payload), false);
}

assert.equal(isPlayPurchaseAdmissionToken({ purchaseAllowed: true }), false);
assert.equal(purchaseAdmissionFromCallFailure("functions/not-found").status, "closed");
assert.equal(purchaseAdmissionFromCallFailure("functions/unimplemented").status, "closed");
assert.equal(purchaseAdmissionFromCallFailure("functions/unavailable").status, "unavailable");
assert.equal(purchaseAdmissionFromCallFailure("functions/internal").status, "unavailable");

{
  const backend = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "iapBackend.ts"),
    "utf8"
  );
  assert.match(backend, /PLAY_PURCHASE_ADMISSION_CALLABLE/);
  assert.match(backend, /interpretPurchaseAdmission/);
  assert.match(backend, /readPlayPurchaseAdmission/);
  assert.doesNotMatch(backend, /PLAY_BILLING_TESTER_UIDS|testerUids|uid-a/);
  assert.equal(PLAY_PURCHASE_ADMISSION_CALLABLE, "getPlayPurchaseAdmission");
}

console.log("purchaseAdmission.test.ts: ok");
