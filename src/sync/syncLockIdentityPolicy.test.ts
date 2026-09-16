import assert from "node:assert/strict";

import { shouldClearSyncLockOnAuthTransition, applyAuthSyncIdentityTransition } from "./syncLockIdentityPolicy";
import { syncSessionOwnership } from "./syncSessionOwnership";
import { sessionSyncGate } from "./sessionSyncGate";

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

function testRotatesGenerationOnLifecycle() {
  syncSessionOwnership.resetForTests();
  sessionSyncGate.lock("session_expired");
  const first = applyAuthSyncIdentityTransition({
    prevStatus: "signed_out",
    nextStatus: "signed_in",
    prevUid: null,
    nextUid: "u1",
  });
  assert.equal(sessionSyncGate.isLocked(), false);
  assert.equal(first?.uid, "u1");
  assert.equal(first?.generation, 1);

  applyAuthSyncIdentityTransition({
    prevStatus: "signed_in",
    nextStatus: "signed_out",
    prevUid: "u1",
    nextUid: null,
  });
  const second = applyAuthSyncIdentityTransition({
    prevStatus: "signed_out",
    nextStatus: "signed_in",
    prevUid: null,
    nextUid: "u1",
  });
  assert.equal(second?.uid, "u1");
  assert.notEqual(second?.generation, first?.generation);
  assert.equal(syncSessionOwnership.isCurrent(first), false);
  syncSessionOwnership.resetForTests();
  assert.equal(syncSessionOwnership.isActiveOwner(first), false);
}

function main() {
  testClearsOnSignOut();
  testClearsOnFreshSignIn();
  testClearsOnUidSwitch();
  testDoesNotClearOnSameSessionNoise();
  testRotatesGenerationOnLifecycle();
  console.log("syncLockIdentityPolicy.test.ts: ok");
}

main();
