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
  liveBackendAdmission,
  loadOwnerUidFile,
  parseFirebaseAuthUids,
  parsePlayBillingTesterUids,
  pathIsInsideRepo,
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

test("LIVE_BACKEND is refused while A6 is UNPROVEN even if live env is set", () => {
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
});
