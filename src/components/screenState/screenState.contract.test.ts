/**
 * Recoverable screen-state contract.
 * Label: PURE_HELPER
 */
import assert from "node:assert/strict";

import { presentPublicError } from "@/domain/publicErrors";

import {
  emptyOwned,
  listPhase,
  nextOwnedSnapshot,
  renderOfflineCache,
  resolveSearchPresentation,
  showsEmpty,
} from "./resolveScreenState";

assert.equal(showsEmpty(listPhase({ loading: true, failed: false, count: 0, owned: true })), false);
assert.equal(showsEmpty(listPhase({ loading: false, failed: true, count: 0, owned: true })), false);
assert.equal(listPhase({ loading: true, failed: false, count: 0, owned: true }), "loading");
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

console.log("screenState.contract.test.ts: ok");
