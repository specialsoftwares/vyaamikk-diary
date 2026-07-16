import assert from "node:assert/strict";

import { shouldClearSyncLockOnAuthTransition } from "./syncLockIdentityPolicy";

function testClearsOnSignOut() {
  assert.equal(
    shouldClearSyncLockOnAuthTransition({
      prevStatus: "signed_in",
      nextStatus: "signed_out",
      prevUid: "u1",
      nextUid: null,
    }),
    true
  );
}

function testClearsOnFreshSignIn() {
  assert.equal(
    shouldClearSyncLockOnAuthTransition({
      prevStatus: "signed_out",
      nextStatus: "signed_in",
      prevUid: null,
      nextUid: "u2",
    }),
    true
  );
  assert.equal(
    shouldClearSyncLockOnAuthTransition({
      prevStatus: "loading",
      nextStatus: "signed_in",
      prevUid: null,
      nextUid: "u2",
    }),
    true
  );
}

function testClearsOnUidSwitch() {
  assert.equal(
    shouldClearSyncLockOnAuthTransition({
      prevStatus: "signed_in",
      nextStatus: "signed_in",
      prevUid: "u1",
      nextUid: "u2",
    }),
    true
  );
}

function testDoesNotClearOnSameSessionNoise() {
  assert.equal(
    shouldClearSyncLockOnAuthTransition({
      prevStatus: "signed_in",
      nextStatus: "signed_in",
      prevUid: "u1",
      nextUid: "u1",
    }),
    false
  );
  assert.equal(
    shouldClearSyncLockOnAuthTransition({
      prevStatus: "loading",
      nextStatus: "loading",
      prevUid: null,
      nextUid: null,
    }),
    false
  );
}

function main() {
  testClearsOnSignOut();
  testClearsOnFreshSignIn();
  testClearsOnUidSwitch();
  testDoesNotClearOnSameSessionNoise();
  console.log("syncLockIdentityPolicy.test.ts: ok");
}

main();
