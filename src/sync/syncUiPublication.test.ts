import assert from "node:assert/strict";

import { applyAuthSyncIdentityTransition } from "@/sync/syncLockIdentityPolicy";
import { syncSessionOwnership } from "@/sync/syncSessionOwnership";
import {
  emptySyncUiSnapshotFor,
  presentSyncUi,
  retiredSyncUiSnapshot,
} from "@/sync/syncUiPublication";

syncSessionOwnership.resetForTests();

const tokenA = applyAuthSyncIdentityTransition({
  prevStatus: "signed_out",
  nextStatus: "signed_in",
  prevUid: null,
  nextUid: "user-a",
})!;

const storedA = {
  ...emptySyncUiSnapshotFor(tokenA),
  pendingCount: 4,
  quotaBlockedCount: 1,
  syncing: true,
};

assert.equal(presentSyncUi("user-a", tokenA.generation, storedA).pendingCount, 4);
assert.equal(presentSyncUi("user-a", tokenA.generation, storedA).syncing, true);

const tokenB = applyAuthSyncIdentityTransition({
  prevStatus: "signed_in",
  nextStatus: "signed_in",
  prevUid: "user-a",
  nextUid: "user-b",
})!;
const masked = presentSyncUi("user-b", tokenB.generation, storedA);
assert.equal(masked.pendingCount, 0);
assert.equal(masked.quotaBlockedCount, 0);
assert.equal(masked.syncing, false);
assert.equal(masked.pulling, false);

applyAuthSyncIdentityTransition({
  prevStatus: "signed_in",
  nextStatus: "signed_out",
  prevUid: "user-b",
  nextUid: null,
});
assert.deepEqual(presentSyncUi(null, 0, storedA), {
  pendingCount: 0,
  quotaBlockedCount: 0,
  syncBlockedCount: 0,
  syncing: false,
  pulling: false,
});

const tokenA2 = applyAuthSyncIdentityTransition({
  prevStatus: "signed_out",
  nextStatus: "signed_in",
  prevUid: null,
  nextUid: "user-a",
})!;
assert.notEqual(tokenA2.generation, tokenA.generation);
const sameUidMasked = presentSyncUi("user-a", tokenA2.generation, storedA);
assert.equal(sameUidMasked.pendingCount, 0);
assert.equal(sameUidMasked.syncing, false);
assert.equal(retiredSyncUiSnapshot().owner, null);

syncSessionOwnership.resetForTests();
console.log("syncUiPublication.test.ts: ok");
