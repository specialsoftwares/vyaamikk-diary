import assert from "node:assert/strict";

import { decideLocalDataAction } from "./localDevicePolicyDecision";

function testGraceRetains() {
  assert.equal(
    decideLocalDataAction({
      liveStatus: "pending_deletion",
      hasCachedUser: true,
      liveMissingOrDeleted: true,
    }),
    "retain_for_grace_or_reactivation"
  );
}

function testDeletedPurges() {
  assert.equal(
    decideLocalDataAction({
      liveStatus: "deleted",
      hasCachedUser: true,
      liveMissingOrDeleted: true,
    }),
    "purge_user_scoped_local"
  );
}

function testMissingLivePurgesCached() {
  assert.equal(
    decideLocalDataAction({
      liveStatus: null,
      hasCachedUser: true,
      liveMissingOrDeleted: true,
    }),
    "purge_user_scoped_local"
  );
}

function main() {
  testGraceRetains();
  testDeletedPurges();
  testMissingLivePurgesCached();
  console.log("localDevicePolicy.test.ts: ok");
}

main();
