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
  beginOwnedLoad,
  commitOwnedSuccess,
  commitOwnedFailure,
  resolveSearchPresentation,
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


// Compose the production loader and snapshot decisions just as search does.
// A new request generation does not make same-session cached rows foreign.
{
  beginSessionCommit();
  const first = captureLoadClaim("refresh-owner", 1);
  let load: OwnedLoad<string[]> = beginOwnedLoad(emptyOwnedLoad(), first);
  let memory = nextOwnedSnapshot(emptyOwned<string[]>(), {
    signedInUid: first.uid, epoch: first.epoch, generation: first.generation,
    loading: true, failed: false, value: [], valueClaim: null,
  });
  load = commitOwnedSuccess(load, first, ["saved record"]);
  const render = () => {
    memory = nextOwnedSnapshot(memory, {
      signedInUid: load.claim!.uid, epoch: load.claim!.epoch,
      generation: load.claim!.generation, loading: load.loading,
      failed: Boolean(load.error), value: load.value ?? [], valueClaim: load.valueClaim,
    });
    return memory;
  };
  assert.deepEqual(render().value, ["saved record"]);
  const refresh = captureLoadClaim(first.uid, 2);
  load = beginOwnedLoad(load, refresh);
  render();
  load = commitOwnedFailure(load, refresh, "Connection unavailable");
  render();
  assert.equal(memory.pending, false, "a settled refresh failure must not leave loading active");
  assert.deepEqual(memory.value, ["saved record"], "same-session refresh failure retains cache");
  assert.equal(resolveSearchPresentation({ query: "", queryActive: false,
    matchCount: 0, libraryCount: memory.value?.length ?? 0,
    loading: memory.pending, failed: Boolean(load.error) && !memory.accepted,
  }), "idle");
  const retry = captureLoadClaim(first.uid, 3);
  load = beginOwnedLoad(load, retry);
  render();
  load = commitOwnedSuccess(load, retry, ["fresh record"]);
  assert.deepEqual(render().value, ["fresh record"]);
  const newEpoch = beginSessionCommit();
  memory = nextOwnedSnapshot(memory, {
    signedInUid: first.uid, epoch: newEpoch, generation: 1,
    loading: false, failed: false, value: load.value ?? [], valueClaim: load.valueClaim,
  });
  assert.equal(memory.accepted, false, "same UID in a new session cannot inherit cache");
}

console.log("ownedLoad.test.ts: ok");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
