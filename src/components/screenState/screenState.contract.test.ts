/**
 * Recoverable screen-state contract.
 * Label: PURE_HELPER
 */
import assert from "node:assert/strict";

import { presentPublicError } from "@/domain/publicErrors";

import {
  beginOwnedLoad,
  commitOwnedSuccess,
  emptyOwned,
  emptyOwnedLoad,
  finishOwnedLoad,
  listPhase,
  nextOwnedSnapshot,
  renderOfflineCache,
  resolveSearchPresentation,
  runOwnedLoad,
  showsEmpty,
  type OwnedLoad,
  type RequestClaim,
} from "./resolveScreenState";

async function main(): Promise<void> {
assert.equal(showsEmpty(listPhase({ loading: true, failed: false, count: 0, owned: true })), false);
assert.equal(showsEmpty(listPhase({ loading: false, failed: true, count: 0, owned: true })), false);
assert.equal(listPhase({ loading: true, failed: false, count: 0, owned: true }), "loading");
assert.equal(listPhase({ loading: true, failed: true, count: 0, owned: true }), "error");
assert.equal(listPhase({ loading: true, failed: false, count: 0, owned: false }), "hidden");
assert.equal(listPhase({ loading: false, failed: true, count: 0, owned: true }), "error");
assert.equal(showsEmpty(listPhase({ loading: false, failed: false, count: 0, owned: true })), true);
assert.equal(showsEmpty(listPhase({ loading: false, failed: false, count: 0, owned: false })), false);

{
  const hidden = renderOfflineCache({
    offline: true,
    rows: [{ id: "other-account-row" }],
    cacheOwnerUid: "account-a",
    signedInUid: "account-b",
  });
  assert.deepEqual(hidden.rows, []);
  assert.equal(hidden.savedOnDevice, false);

  const kept = renderOfflineCache({
    offline: true,
    rows: [{ id: "mine" }],
    cacheOwnerUid: "account-b",
    signedInUid: "account-b",
  });
  assert.equal(kept.rows.length, 1);
  assert.equal(kept.savedOnDevice, true);
}

{
  let memory = emptyOwned<string[]>();
  memory = nextOwnedSnapshot(memory, {
    signedInUid: "account-a",
    loading: true,
    failed: false,
    value: [],
  });
  memory = nextOwnedSnapshot(memory, {
    signedInUid: "account-a",
    loading: false,
    failed: false,
    value: ["row-a"],
  });
  assert.deepEqual(memory.value, ["row-a"]);
  memory = nextOwnedSnapshot(memory, {
    signedInUid: "account-b",
    loading: false,
    failed: false,
    value: ["row-a"],
  });
  assert.equal(memory.accepted, false);
  assert.equal(memory.value, null);
  memory = nextOwnedSnapshot(memory, {
    signedInUid: "account-b",
    loading: false,
    failed: false,
    value: ["row-a"],
  });
  assert.equal(memory.accepted, false);
  assert.equal(memory.value, null);
  assert.equal(memory.current, true);
  assert.equal(memory.pending, true);
}

{
  let memory = emptyOwned<string[]>();
  memory = nextOwnedSnapshot(memory, {
    signedInUid: "account-a",
    epoch: 4,
    generation: 1,
    loading: true,
    failed: false,
    value: [],
  });
  memory = nextOwnedSnapshot(memory, {
    signedInUid: "account-a",
    epoch: 4,
    generation: 1,
    loading: false,
    failed: true,
    value: [],
  });
  assert.equal(memory.accepted, false);
  assert.equal(memory.value, null);
  assert.equal(memory.current, true);
  const phase = listPhase({
    loading: false,
    failed: true,
    count: 0,
    owned: memory.current,
  });
  assert.equal(phase, "error");
  assert.notEqual(phase, "hidden");
  assert.equal(memory.pending, false);
  let waiting = emptyOwned<string[]>();
  waiting = nextOwnedSnapshot(waiting, {
    signedInUid: "account-b",
    epoch: 9,
    generation: 1,
    loading: false,
    failed: false,
    value: ["row-a"],
    valueClaim: { uid: "account-a", epoch: 4, generation: 1 },
  });
  assert.equal(waiting.current, true);
  assert.equal(waiting.pending, true);
  assert.equal(waiting.accepted, false);
  assert.equal(waiting.value, null);
  assert.equal(
    listPhase({ loading: false, failed: false, count: 0, owned: waiting.current, pending: waiting.pending }),
    "loading"
  );
  waiting = nextOwnedSnapshot(waiting, {
    signedInUid: "account-b",
    epoch: 9,
    generation: 1,
    loading: false,
    failed: true,
    value: [],
  });
  assert.equal(waiting.pending, false);
  assert.equal(
    listPhase({ loading: false, failed: true, count: 0, owned: waiting.current, pending: waiting.pending }),
    "error"
  );
  assert.equal(
    listPhase({ loading: true, failed: true, count: 0, owned: memory.current }),
    "error"
  );
}

{
  let memory = emptyOwned<string[]>();
  memory = nextOwnedSnapshot(memory, {
    signedInUid: "account-a",
    epoch: 1,
    generation: 1,
    loading: true,
    failed: false,
    value: [],
  });
  memory = nextOwnedSnapshot(memory, {
    signedInUid: "account-a",
    epoch: 1,
    generation: 1,
    loading: false,
    failed: false,
    value: ["row-a"],
    valueClaim: { uid: "account-a", epoch: 1, generation: 1 },
  });
  memory = nextOwnedSnapshot(memory, {
    signedInUid: "account-b",
    epoch: 2,
    generation: 1,
    loading: true,
    failed: false,
    value: ["row-a"],
    valueClaim: { uid: "account-a", epoch: 1, generation: 1 },
  });
  assert.equal(memory.value, null);
  memory = nextOwnedSnapshot(memory, {
    signedInUid: "account-b",
    epoch: 2,
    generation: 1,
    loading: false,
    failed: false,
    value: ["row-a"],
    valueClaim: { uid: "account-a", epoch: 1, generation: 1 },
  });
  assert.equal(memory.accepted, false);
  assert.notDeepEqual(memory.value, ["row-a"]);
}

{
  const leaked = new Error("functions/internal exploded");
  leaked.stack = "Error: functions/internal exploded\n    at explode (src/secret.ts:1:1)";
  const shown = presentPublicError(leaked);
  assert.equal(typeof shown, "string");
  assert.equal(shown.includes("functions/"), false);
  assert.equal(shown.includes("    at "), false);
  assert.equal(shown.includes("src/secret.ts"), false);
  assert.equal(shown.includes("30"), false);
}

{
  const noMatch = resolveSearchPresentation({
    query: "bolt",
    queryActive: true,
    matchCount: 0,
    libraryCount: 4,
    loading: false,
    failed: false,
  });
  const emptyLibrary = resolveSearchPresentation({
    query: "",
    queryActive: false,
    matchCount: 0,
    libraryCount: 0,
    loading: false,
    failed: false,
  });
  assert.equal(noMatch, "no_match");
  assert.equal(emptyLibrary, "empty_library");
  assert.notEqual(noMatch, emptyLibrary);
  assert.equal(
    resolveSearchPresentation({
      query: "bolt",
      queryActive: true,
      matchCount: 0,
      libraryCount: 0,
      loading: true,
      failed: false,
    }),
    "loading"
  );
  assert.equal(
    resolveSearchPresentation({
      query: "bolt",
      queryActive: true,
      matchCount: 0,
      libraryCount: 0,
      loading: true,
      failed: true,
    }),
    "failure"
  );
  assert.equal(
    resolveSearchPresentation({
      query: "",
      queryActive: false,
      matchCount: 0,
      libraryCount: 8,
      loading: false,
      failed: false,
    }),
    "idle"
  );
  assert.notEqual(
    resolveSearchPresentation({
      query: "",
      queryActive: false,
      matchCount: 0,
      libraryCount: 0,
      loading: false,
      failed: true,
    }),
    "empty_library"
  );
}

{
  const claimA: RequestClaim = { uid: "account-a", epoch: 1, generation: 1 };
  const claimB: RequestClaim = { uid: "account-b", epoch: 2, generation: 1 };
  let state = beginOwnedLoad(emptyOwnedLoad<string[]>(), claimA);
  state = beginOwnedLoad(state, claimB);
  state = commitOwnedSuccess(state, claimA, ["row-a"]);
  assert.equal(state.claim?.uid, "account-b");
  assert.equal(state.loading, true);
  assert.notDeepEqual(state.value, ["row-a"]);

  const older: RequestClaim = { uid: "account-a", epoch: 1, generation: 1 };
  const newer: RequestClaim = { uid: "account-a", epoch: 2, generation: 1 };
  let replaced = beginOwnedLoad(emptyOwnedLoad<string[]>(), older);
  replaced = beginOwnedLoad(replaced, newer);
  replaced = commitOwnedSuccess(replaced, older, ["old-session"]);
  replaced = finishOwnedLoad(replaced, older);
  assert.equal(replaced.loading, true);
  assert.equal(replaced.claim?.epoch, 2);
  assert.notDeepEqual(replaced.value, ["old-session"]);
}

{
  let state: OwnedLoad<string[]> = emptyOwnedLoad();
  const claim: RequestClaim = { uid: "account-a", epoch: 3, generation: 1 };
  const settled = await runOwnedLoad({
    claim,
    read: async () => {
      throw new Error("functions/internal exploded");
    },
    readState: () => state,
    writeState: (next) => {
      state = next;
    },
    presentError: () => "Something went wrong. Please try again later.",
  });
  assert.equal(settled.loading, false);
  assert.equal(settled.value, null);
  assert.equal(settled.error?.includes("functions/"), false);
  let memory = emptyOwned<string[]>();
  memory = nextOwnedSnapshot(memory, {
    signedInUid: claim.uid,
    epoch: claim.epoch,
    generation: claim.generation,
    loading: true,
    failed: false,
    value: [],
  });
  memory = nextOwnedSnapshot(memory, {
    signedInUid: claim.uid,
    epoch: claim.epoch,
    generation: claim.generation,
    loading: settled.loading,
    failed: true,
    value: settled.value ?? [],
    valueClaim: settled.valueClaim,
  });
  assert.equal(
    listPhase({
      loading: settled.loading,
      failed: true,
      count: 0,
      owned: memory.current,
    }),
    "error"
  );
}

{
  let state: OwnedLoad<string[]> = emptyOwnedLoad();
  let releaseA: (value: string[]) => void = () => undefined;
  const claimA: RequestClaim = { uid: "account-a", epoch: 1, generation: 1 };
  const claimB: RequestClaim = { uid: "account-b", epoch: 2, generation: 1 };
  const first = runOwnedLoad({
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
  const second = runOwnedLoad({
    claim: claimB,
    read: async () => ["row-b"],
    readState: () => state,
    writeState: (next) => {
      state = next;
    },
    presentError: () => "error",
  });
  releaseA(["row-a"]);
  await first;
  await second;
  assert.deepEqual(state.value, ["row-b"]);
  assert.equal(state.valueClaim?.uid, "account-b");
  assert.equal(state.loading, false);
}

console.log("screenState.contract.test.ts: ok");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
