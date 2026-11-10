/**
 * Request ownership for production loaders.
 * Label: PURE_HELPER
 * No network. Epochs come from the auth session fence.
 */
import assert from "node:assert/strict";

import {
  beginSessionCommit,
  __resetAuthSessionFenceForTests,
} from "@/services/auth/authSessionFence";

import {
  captureLoadClaim,
  emptyOwnedLoad,
  listPhase,
  nextOwnedSnapshot,
  emptyOwned,
  runOwnedLoad,
  type OwnedLoad,
} from "./resolveScreenState";

async function main(): Promise<void> {
__resetAuthSessionFenceForTests();

{
  const epochA = beginSessionCommit();
  const claimA = captureLoadClaim("account-a", 1);
  assert.equal(claimA.epoch, epochA);
  let state: OwnedLoad<string[]> = emptyOwnedLoad();
  const failed = await runOwnedLoad({
    claim: claimA,
    read: async () => {
      throw new Error("boom");
    },
    readState: () => state,
    writeState: (next) => {
      state = next;
    },
    presentError: () => "Could not load",
  });
  assert.equal(failed.loading, false);
  assert.equal(failed.value, null);
  assert.equal(failed.error, "Could not load");
  let memory = emptyOwned<string[]>();
  memory = nextOwnedSnapshot(memory, {
    signedInUid: "account-a",
    epoch: claimA.epoch,
    generation: claimA.generation,
    loading: true,
    failed: false,
    value: [],
  });
  memory = nextOwnedSnapshot(memory, {
    signedInUid: "account-a",
    epoch: claimA.epoch,
    generation: claimA.generation,
    loading: failed.loading,
    failed: Boolean(failed.error),
    value: failed.value ?? [],
    valueClaim: failed.valueClaim,
  });
  assert.equal(memory.current, true);
  assert.equal(memory.accepted, false);
  assert.equal(
    listPhase({ loading: failed.loading, failed: true, count: 0, owned: memory.current }),
    "error"
  );
}

{
  const epochA = beginSessionCommit();
  const claimA = captureLoadClaim("account-a", 1);
  assert.equal(claimA.epoch, epochA);
  let state: OwnedLoad<string[]> = emptyOwnedLoad();
  let releaseA: (rows: string[]) => void = () => undefined;
  const older = runOwnedLoad({
    claim: claimA,
    read: () =>
      new Promise<string[]>((resolve) => {
        releaseA = resolve;
      }),
    readState: () => state,
    writeState: (next) => {
      state = next;
    },
    presentError: () => "error",
  });
  const epochB = beginSessionCommit();
  const claimB = captureLoadClaim("account-b", 1);
  assert.notEqual(epochB, epochA);
  const newer = runOwnedLoad({
    claim: claimB,
    read: async () => ["row-b"],
    readState: () => state,
    writeState: (next) => {
      state = next;
    },
    presentError: () => "error",
  });
  releaseA(["row-a"]);
  await older;
  await newer;
  assert.deepEqual(state.value, ["row-b"]);
  assert.equal(state.valueClaim?.uid, "account-b");
  assert.notEqual(state.valueClaim?.uid, "account-a");
  assert.equal(state.loading, false);
}

{
  const epochOld = beginSessionCommit();
  const olderClaim = captureLoadClaim("same-user", 1);
  assert.equal(olderClaim.epoch, epochOld);
  let state: OwnedLoad<string[]> = emptyOwnedLoad();
  let releaseOld: (rows: string[]) => void = () => undefined;
  const older = runOwnedLoad({
    claim: olderClaim,
    read: () =>
      new Promise<string[]>((resolve) => {
        releaseOld = resolve;
      }),
    readState: () => state,
    writeState: (next) => {
      state = next;
    },
    presentError: () => "error",
  });
  assert.equal(state.loading, true);
  const epochNew = beginSessionCommit();
  const newerClaim = captureLoadClaim("same-user", 1);
  assert.equal(newerClaim.uid, olderClaim.uid);
  assert.equal(newerClaim.generation, olderClaim.generation);
  assert.notEqual(epochNew, epochOld);
  assert.notEqual(newerClaim.epoch, olderClaim.epoch);
  let newerStarted = false;
  const newerGate: { open: (rows: string[]) => void } = {
    open: () => {
      throw new Error("newer read was not started");
    },
  };
  const newer = runOwnedLoad({
    claim: newerClaim,
    read: () =>
      new Promise<string[]>((resolve) => {
        newerStarted = true;
        newerGate.open = resolve;
      }),
    readState: () => state,
    writeState: (next) => {
      state = next;
    },
    presentError: () => "error",
  });
  assert.equal(state.loading, true);
  assert.equal(state.claim?.epoch, epochNew);
  releaseOld(["row-old"]);
  await older;
  assert.equal(state.loading, true, "older finally must not clear the newer loading flag");
  assert.notDeepEqual(state.value, ["row-old"]);
  assert.equal(state.claim?.epoch, epochNew);
  assert.equal(newerStarted, true);
  newerGate.open(["row-new"]);
  await newer;
  assert.deepEqual(state.value, ["row-new"]);
  assert.equal(state.valueClaim?.epoch, epochNew);
  assert.equal(state.loading, false);
}

console.log("ownedLoad.test.ts: ok");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
