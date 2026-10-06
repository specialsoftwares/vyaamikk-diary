import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import {
  FIREBASE_AUTH_UID,
  PLAY_BILLING_TESTER_UIDS_ENV,
  SMOKE_LABEL_LIVE,
  E_APPLICATION_SHA,
  E_LIVE_EXECUTABLE,
  E_LIVE_STATUS,
  E_SEVEN_NAMES,
  E_SOURCE_STUB_STATUS,
  expectedGcloudDisableArgs,
  expectedGcloudEnableArgs,
  eArgvUnsafe,
  inspectGateReadback,
  liveBackendAdmission,
  loadOwnerUidFile,
  parseFirebaseAuthUids,
  parsePlayBillingTesterUids,
  pathIsInsideRepo,
  simulateGcloudGateLoop,
  SMOKE_SCENARIO_LIVE_REQUIREMENTS,
  SMOKE_SCENARIOS,
} from "./grin-pilot-smoke.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SMOKE = join(HERE, "grin-pilot-smoke.mjs");

test("UID grammar accepts Firebase Auth ids and rejects emails/paths", () => {
  assert.equal(FIREBASE_AUTH_UID.test("Ab0_-x"), true);
  const ok = parseFirebaseAuthUids(" uid-a \nuid-b,uid-a\n# comment\n");
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.uids, ["uid-a", "uid-b"]);
  const email = parseFirebaseAuthUids("tester@example.com");
  assert.equal(email.ok, false);
  const slash = parseFirebaseAuthUids("users/uid");
  assert.equal(slash.ok, false);
  const space = parseFirebaseAuthUids("uid with space");
  assert.equal(space.ok, false);
  const empty = parseFirebaseAuthUids(" , \n # x \n");
  assert.equal(empty.ok, true);
  assert.equal(empty.empty, true);
});

test("empty PLAY_BILLING_TESTER_UIDS is fail-closed", () => {
  assert.equal(parsePlayBillingTesterUids({}).empty, true);
  assert.equal(parsePlayBillingTesterUids({}).failClosed, true);
  assert.equal(parsePlayBillingTesterUids({ [PLAY_BILLING_TESTER_UIDS_ENV]: "" }).failClosed, true);
  assert.equal(parsePlayBillingTesterUids({ [PLAY_BILLING_TESTER_UIDS_ENV]: " , , " }).failClosed, true);
  const listed = parsePlayBillingTesterUids({ [PLAY_BILLING_TESTER_UIDS_ENV]: " uid-a ,uid-b " });
  assert.equal(listed.ok, true);
  assert.equal(listed.failClosed, false);
  assert.deepEqual(listed.uids, ["uid-a", "uid-b"]);
  const bad = parsePlayBillingTesterUids({ [PLAY_BILLING_TESTER_UIDS_ENV]: "not an email@x" });
  assert.equal(bad.ok, false);
  assert.equal(bad.failClosed, true);
});

test("owner UID files inside the repo are rejected; empty file fail-closes", () => {
  assert.equal(pathIsInsideRepo(join(HERE, "secret-uids.txt")), true);
  const inside = loadOwnerUidFile(join(HERE, "grin-pilot-smoke.mjs"));
  assert.equal(inside.ok, false);
  assert.match(inside.error, /outside the git worktree/);
  const dir = mkdtempSync(join(tmpdir(), "grin-pilot-uids-"));
  const emptyFile = join(dir, "uids.txt");
  writeFileSync(emptyFile, "\n# none\n");
  const empty = loadOwnerUidFile(emptyFile);
  assert.equal(empty.ok, true);
  assert.equal(empty.empty, true);
  const filled = join(dir, "named.txt");
  writeFileSync(filled, "owner_uid_one\nother_uid_two\n");
  const loaded = loadOwnerUidFile(filled);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.uids.length, 2);
});

test("LIVE_BACKEND is refused while E is UNPROVEN even if live env is set", () => {
  const decision = liveBackendAdmission({
    allowLive: "1",
    smokeLive: "1",
    gcloudProven: false,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.label, SMOKE_LABEL_LIVE);
  assert.match(decision.reason, /UNPROVEN/);
});

test("CLI live subcommand refuses and does not invent UIDs", () => {
  const r = spawnSync(process.execPath, [SMOKE, "live"], {
    encoding: "utf8",
    env: { ...process.env, GRIN_OPS_ALLOW_LIVE: "1", GRIN_PILOT_SMOKE_LIVE: "1" },
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /UNPROVEN/);
  assert.doesNotMatch(r.stdout + r.stderr, /@/);
});

test("smoke scenario list is the restricted-pilot set", () => {
  assert.deepEqual(SMOKE_SCENARIOS, [
    "authenticated_success",
    "unauthenticated_denial",
    "non_admitted_denial",
    "cross_owner_denial",
    "register_replay",
    "upload_verification",
    "confirmation",
    "read_export",
  ]);
  assert.equal(SMOKE_SCENARIO_LIVE_REQUIREMENTS.cross_owner_denial.requiresSecondAuthenticatedUid, true);
  for (const name of SMOKE_SCENARIOS) {
    if (name === "cross_owner_denial") continue;
    assert.equal(SMOKE_SCENARIO_LIVE_REQUIREMENTS[name].requiresSecondAuthenticatedUid, false);
  }
});

test("E SOURCE argv omits --source and disable uses false not remove", () => {
  assert.equal(E_APPLICATION_SHA, "540e07aa07f376716484adb879ce66cb9fb170ce");
  assert.equal(E_SOURCE_STUB_STATUS, "SUPPORTED");
  assert.equal(E_LIVE_STATUS, "HOLD");
  assert.equal(E_LIVE_EXECUTABLE, false);
  assert.equal(E_SEVEN_NAMES.length, 7);
  const enable = expectedGcloudEnableArgs("grinRegisterGoodsReceipt");
  const disable = expectedGcloudDisableArgs("grinRegisterGoodsReceipt");
  assert.equal(eArgvUnsafe(enable), false);
  assert.equal(eArgvUnsafe(disable), false);
  assert.ok(enable.includes("--update-env-vars=GRIN_GOODS_EVIDENCE_FUNCTIONS=true"));
  assert.ok(disable.includes("--update-env-vars=GRIN_GOODS_EVIDENCE_FUNCTIONS=false"));
  assert.equal(disable.some((a) => a.includes("--remove-env-vars")), false);
  assert.equal(eArgvUnsafe([...enable, "--source=."]), true);
  assert.equal(eArgvUnsafe([...enable, "--set-env-vars=FOO=1"]), true);
  assert.equal(eArgvUnsafe([...enable, "--clear-env-vars"]), true);
});

test("inspect readback is gate name/on-off only; mixed-gate is not rollback", () => {
  const on = inspectGateReadback({
    name: "grinRegisterGoodsReceipt",
    presence: "present",
    sourceOrigin: "gcs",
    env: { GRIN_GOODS_EVIDENCE_FUNCTIONS: "true", OTHER: "keep" },
    otherUserKeyCount: 1,
    secretBindingCount: 2,
  });
  assert.equal(on.gate, "on");
  assert.equal(on.gatePresent, true);
  assert.equal(Object.hasOwn(on, "env"), false);
  const mixed = simulateGcloudGateLoop(E_SEVEN_NAMES, 3);
  assert.equal(mixed.ok, false);
  assert.equal(mixed.updated.length, 3);
  assert.equal(mixed.remaining.length, 4);
  assert.equal(mixed.mixedGate, true);
  assert.equal(mixed.rolledBack, false);
});
