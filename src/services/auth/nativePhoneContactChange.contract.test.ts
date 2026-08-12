import assert from "node:assert/strict";

import {
  shouldRetryServerMobileBind,
  type PendingMobileContactChange,
} from "@/services/auth/pendingMobileContactChange";
import { NATIVE_CONTACT_CHANGE_PURPOSE } from "@/services/auth/nativePhoneContactChange";
import { readFileSync } from "node:fs";
import { join } from "node:path";

assert.equal(NATIVE_CONTACT_CHANGE_PURPOSE, "contact_change");

const pending: PendingMobileContactChange = {
  uid: "uid-x",
  oldPhoneE164: "+919111111111",
  newPhoneE164: "+919222222222",
  operationId: "op1",
  authUpdatedAt: Date.now(),
  purpose: "contact_change",
};

// Consistent Auth+profile → no retry
assert.deepEqual(
  shouldRetryServerMobileBind({
    uid: "uid-x",
    authPhoneE164: "+919111111111",
    profilePhoneE164: "+919111111111",
    pending: null,
  }),
  { retry: false }
);

// Auth=B, profile=A with pending → retry B
const retry = shouldRetryServerMobileBind({
  uid: "uid-x",
  authPhoneE164: "+919222222222",
  profilePhoneE164: "+919111111111",
  pending,
});
assert.equal(retry.retry, true);
if (retry.retry) {
  assert.equal(retry.newerPhoneE164, "+919222222222");
  assert.equal(retry.operationId, "op1");
}

// Auth=B, profile=A without pending → still retry (cold kill after Auth update)
const recover = shouldRetryServerMobileBind({
  uid: "uid-x",
  authPhoneE164: "+919222222222",
  profilePhoneE164: "+919111111111",
  pending: null,
});
assert.equal(recover.retry, true);
if (recover.retry) assert.equal(recover.newerPhoneE164, "+919222222222");

// Source isolation: contact-change module must not call login resolver / signInWithPhoneNumber
const root = join(__dirname, "../../..");
const contactChangeSrc = readFileSync(
  join(root, "src/services/auth/nativePhoneContactChange.ts"),
  "utf8"
);
assert.equal(contactChangeSrc.includes(".signInWithPhoneNumber("), false);
assert.equal(contactChangeSrc.includes("signInWithCredential("), false);
assert.equal(contactChangeSrc.includes("clearStaleNativeAuthForFreshChallenge("), false);
assert.equal(contactChangeSrc.includes("callResolveOrCreateUserByPhone("), false);
assert.equal(contactChangeSrc.includes(".verifyPhoneNumber("), true);
assert.equal(contactChangeSrc.includes(".updatePhoneNumber("), true);
assert.equal(contactChangeSrc.includes("contact_change"), true);

const firebaseSrc = readFileSync(join(root, "src/services/auth/firebase.ts"), "utf8");
assert.equal(firebaseSrc.includes("startNativePhoneContactChangeOtp"), true);
assert.equal(firebaseSrc.includes("confirmNativePhoneContactChangeUpdate"), true);
assert.equal(firebaseSrc.includes("completeServerMobileBindAfterAuthUpdate"), true);
assert.equal(firebaseSrc.includes("preflightProductionMobileChange"), true);
// Login path must remain on startNativePhoneOtp / confirmNativePhoneOtp
assert.equal(firebaseSrc.includes("startNativePhoneOtp"), true);
assert.equal(firebaseSrc.includes("confirmNativePhoneOtp"), true);

const serverSrc = readFileSync(
  join(root, "functions/src/identity/confirmVerifiedMobileChange.ts"),
  "utf8"
);
assert.equal(serverSrc.includes("preflightVerifiedMobileContactChange"), true);
assert.equal(serverSrc.includes("alreadyComplete"), true);
assert.equal(serverSrc.includes("pendingMobileChange"), true);
assert.ok(serverSrc.includes("cannot be used for this account"));
assert.equal(serverSrc.includes("already linked to a Vyaamikk account"), false);

console.log("nativePhoneContactChange.contract.test.ts: ok");
