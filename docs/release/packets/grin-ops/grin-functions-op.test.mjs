import { spawnSync, spawn } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

import {
  GATE_KEY,
  GRIN_FUNCTIONS,
  PROJECT_ID,
  applyGcloudGateUpdate,
  buildFirebaseSevenOnlyArgs,
  buildGcloudGateArgs,
  firebaseDotenvWouldReplaceExisting,
  firebaseOnlyIsBroad,
  gcloudArgsUnsafe,
  resolveCliDotenv,
} from "./grin-functions-op.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OP = join(HERE, "grin-functions-op.mjs");

function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), "grin-ops-repo-"));
  spawnSync("git", ["init"], { cwd: dir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "ops@test"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "ops"], { cwd: dir });
  writeFileSync(
    join(dir, "firebase.json"),
    JSON.stringify({
      firestore: { rules: "firestore.rules" },
      storage: { rules: "storage.rules" },
      functions: [{ source: "functions", codebase: "default" }],
    }),
  );
  writeFileSync(join(dir, ".firebaserc"), JSON.stringify({ projects: { production: PROJECT_ID } }));
  mkdirSync(join(dir, "functions"));
  mkdirSync(join(dir, "src"));
  mkdirSync(join(dir, "app"));
  writeFileSync(join(dir, "eas.json"), "{}");
  writeFileSync(join(dir, "app.json"), "{}");
  writeFileSync(join(dir, "firestore.rules"), "// quota placeholder\n");
  writeFileSync(join(dir, "storage.rules"), "// quota placeholder\n");
  writeFileSync(join(dir, "functions/index.js"), "exports.ok = true;\n");
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-m", "seed"]);
  const sha = git(dir, ["rev-parse", "HEAD"]);
  return { dir, sha };
}

function stubBin(dir, name, { failCode = 0, extra = "" } = {}) {
  const log = join(dir, `${name}.log`);
  const path = join(dir, name);
  writeFileSync(
    path,
    `#!/bin/sh
echo "$0 $*" >> "${log}"
${extra}
if [ -n "$STUB_FAIL" ]; then exit "$STUB_FAIL"; fi
exit ${failCode}
`,
  );
  chmodSync(path, 0o755);
  return { path, log };
}

function runOp(repo, cmd, extraEnv = {}) {
  return spawnSync(process.execPath, [OP, cmd], {
    cwd: repo.dir,
    encoding: "utf8",
    env: {
      ...process.env,
      GRIN_OPS_REPO: repo.dir,
      GRIN_OPS_PINNED_SHA: repo.sha,
      ...extraEnv,
    },
  });
}

const absentFixture = Object.fromEntries(GRIN_FUNCTIONS.map((n) => [n, { exists: false }]));
const presentGcsFixture = Object.fromEntries(
  GRIN_FUNCTIONS.map((n) => [n, { exists: true, sourceOrigin: "gcs" }]),
);

test("official parser treats quoted true and inline comments as gate true", () => {
  const dir = mkdtempSync(join(tmpdir(), "grin-dotenv-"));
  writeFileSync(join(dir, ".env"), `${GATE_KEY}="true"\n`);
  const a = resolveCliDotenv(dir, { projectAlias: undefined });
  assert.equal(a.gateExactTrue, true);
  writeFileSync(join(dir, ".env"), `${GATE_KEY}=true # inline\n`);
  const b = resolveCliDotenv(dir, { projectAlias: undefined });
  assert.equal(b.gateExactTrue, true);
  writeFileSync(join(dir, ".env"), `${GATE_KEY}=TRUE\n`);
  const c = resolveCliDotenv(dir, { projectAlias: undefined });
  assert.equal(c.gateExactTrue, false);
  rmSync(dir, { recursive: true, force: true });
});

test("gcloud transform preserves unrelated keys and per-endpoint differences", () => {
  const a = { FOO: "1", BAR: "keep-a" };
  const b = { FOO: "1", BAZ: "keep-b", [GATE_KEY]: "true" };
  const aOn = applyGcloudGateUpdate(a, "true");
  const bOff = applyGcloudGateUpdate(b, "false");
  assert.equal(aOn.FOO, "1");
  assert.equal(aOn.BAR, "keep-a");
  assert.equal(aOn[GATE_KEY], "true");
  assert.equal(bOff.FOO, "1");
  assert.equal(bOff.BAZ, "keep-b");
  assert.equal(bOff[GATE_KEY], "false");
  assert.equal(aOn.BAZ, undefined);
  assert.equal(firebaseDotenvWouldReplaceExisting(), true);
});

test("firebase --only list is exactly seven GRIN names and not broad", () => {
  const args = buildFirebaseSevenOnlyArgs();
  assert.equal(firebaseOnlyIsBroad(args), false);
  assert.equal(firebaseOnlyIsBroad(["deploy", "--only", "functions"]), true);
  for (const name of GRIN_FUNCTIONS) {
    const g = buildGcloudGateArgs(name, "true");
    assert.equal(gcloudArgsUnsafe(g), false);
    assert.ok(g.includes("--gen2"));
    assert.ok(!g.includes("--source"));
  }
});

test("existing .env aborts with zero deploy calls and original bytes preserved", () => {
  const repo = makeRepo();
  const marker = "UNIQUE_OPERATOR_DOTENV_BYTES_v1\n";
  const envPath = join(repo.dir, "functions", ".env");
  writeFileSync(envPath, marker);
  const bins = mkdtempSync(join(tmpdir(), "grin-bins-"));
  const fb = stubBin(bins, "firebase");
  const r = runOp(repo, "gate-off-initial", {
    GRIN_OPS_ALLOW_LIVE: "stub",
    FIREBASE_BIN: fb.path,
    GRIN_OPS_ENDPOINT_FIXTURE: JSON.stringify(absentFixture),
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /ABORT/);
  assert.equal(existsSync(fb.log), false);
  assert.equal(readFileSync(envPath, "utf8"), marker);
  rmSync(repo.dir, { recursive: true, force: true });
  rmSync(bins, { recursive: true, force: true });
});

test("existing project dotenv aborts and is not removed", () => {
  const repo = makeRepo();
  const envPath = join(repo.dir, "functions", `.env.${PROJECT_ID}`);
  writeFileSync(envPath, "OWNED=1\n");
  const bins = mkdtempSync(join(tmpdir(), "grin-bins-"));
  const fb = stubBin(bins, "firebase");
  const r = runOp(repo, "enable", {
    GRIN_OPS_ALLOW_LIVE: "stub",
    GCLOUD_BIN: stubBin(bins, "gcloud").path,
    FIREBASE_BIN: fb.path,
    GRIN_OPS_ENDPOINT_FIXTURE: JSON.stringify(presentGcsFixture),
  });
  assert.notEqual(r.status, 0);
  assert.equal(readFileSync(envPath, "utf8"), "OWNED=1\n");
  assert.equal(existsSync(fb.log), false);
  rmSync(repo.dir, { recursive: true, force: true });
  rmSync(bins, { recursive: true, force: true });
});

test("conflicting alias dotenv aborts before deploy", () => {
  const repo = makeRepo();
  writeFileSync(join(repo.dir, "functions", `.env.${PROJECT_ID}`), "A=1\n");
  writeFileSync(join(repo.dir, "functions", ".env.production"), "B=1\n");
  const bins = mkdtempSync(join(tmpdir(), "grin-bins-"));
  const gcloud = stubBin(bins, "gcloud");
  const r = runOp(repo, "disable", {
    GRIN_OPS_ALLOW_LIVE: "stub",
    GCLOUD_BIN: gcloud.path,
    GRIN_OPS_ENDPOINT_FIXTURE: JSON.stringify(presentGcsFixture),
  });
  assert.notEqual(r.status, 0);
  assert.equal(existsSync(gcloud.log), false);
  assert.equal(readFileSync(join(repo.dir, "functions", ".env.production"), "utf8"), "B=1\n");
  rmSync(repo.dir, { recursive: true, force: true });
  rmSync(bins, { recursive: true, force: true });
});

test("wrong source aborts with zero deploy calls", () => {
  const repo = makeRepo();
  const bins = mkdtempSync(join(tmpdir(), "grin-bins-"));
  const fb = stubBin(bins, "firebase");
  const r = runOp(repo, "gate-off-initial", {
    GRIN_OPS_ALLOW_LIVE: "stub",
    GRIN_OPS_PINNED_SHA: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    FIREBASE_BIN: fb.path,
    GRIN_OPS_ENDPOINT_FIXTURE: JSON.stringify(absentFixture),
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /not pinned/);
  assert.equal(existsSync(fb.log), false);
  rmSync(repo.dir, { recursive: true, force: true });
  rmSync(bins, { recursive: true, force: true });
});

test("dirty deployment inputs abort with zero deploy calls", () => {
  const repo = makeRepo();
  writeFileSync(join(repo.dir, "functions", "dirty.js"), "nope\n");
  const bins = mkdtempSync(join(tmpdir(), "grin-bins-"));
  const fb = stubBin(bins, "firebase");
  const r = runOp(repo, "gate-off-initial", {
    GRIN_OPS_ALLOW_LIVE: "stub",
    FIREBASE_BIN: fb.path,
    GRIN_OPS_ENDPOINT_FIXTURE: JSON.stringify(absentFixture),
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /dirty or untracked/);
  assert.equal(existsSync(fb.log), false);
  rmSync(repo.dir, { recursive: true, force: true });
  rmSync(bins, { recursive: true, force: true });
});

test("firebase-dotenv method is blocked with zero deploy calls", () => {
  const repo = makeRepo();
  const bins = mkdtempSync(join(tmpdir(), "grin-bins-"));
  const gcloud = stubBin(bins, "gcloud");
  const r = runOp(repo, "enable", {
    GRIN_OPS_ALLOW_LIVE: "stub",
    GRIN_OPS_METHOD: "firebase-dotenv",
    GCLOUD_BIN: gcloud.path,
    GRIN_OPS_ENDPOINT_FIXTURE: JSON.stringify(presentGcsFixture),
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /blocked/i);
  assert.equal(existsSync(gcloud.log), false);
  rmSync(repo.dir, { recursive: true, force: true });
  rmSync(bins, { recursive: true, force: true });
});

test("deployment failure retains status, cleans owned temp, does not claim success", () => {
  const repo = makeRepo();
  const bins = mkdtempSync(join(tmpdir(), "grin-bins-"));
  const fb = stubBin(bins, "firebase");
  const sessionFile = join(bins, "session");
  const r = runOp(repo, "gate-off-initial", {
    GRIN_OPS_ALLOW_LIVE: "stub",
    FIREBASE_BIN: fb.path,
    STUB_FAIL: "17",
    GRIN_OPS_SESSION_FILE: sessionFile,
    GRIN_OPS_ENDPOINT_FIXTURE: JSON.stringify(absentFixture),
  });
  assert.equal(r.status, 17);
  assert.doesNotMatch(r.stdout, /PASS/);
  assert.match(r.stderr, /failed with status 17/);
  const session = existsSync(sessionFile) ? readFileSync(sessionFile, "utf8") : "";
  if (session) assert.equal(existsSync(session), false);
  rmSync(repo.dir, { recursive: true, force: true });
  rmSync(bins, { recursive: true, force: true });
});

test("simulated interruption cleans owned temporary directory", async () => {
  const repo = makeRepo();
  const bins = mkdtempSync(join(tmpdir(), "grin-bins-"));
  const fb = stubBin(bins, "firebase");
  const sessionFile = join(bins, "session");
  const child = spawn(process.execPath, [OP, "gate-off-initial"], {
    cwd: repo.dir,
    env: {
      ...process.env,
      GRIN_OPS_REPO: repo.dir,
      GRIN_OPS_PINNED_SHA: repo.sha,
      GRIN_OPS_ALLOW_LIVE: "stub",
      FIREBASE_BIN: fb.path,
      GRIN_OPS_TEST_HANG: "1",
      GRIN_OPS_SESSION_FILE: sessionFile,
      GRIN_OPS_ENDPOINT_FIXTURE: JSON.stringify(absentFixture),
    },
    stdio: "ignore",
  });
  const deadline = Date.now() + 5000;
  while (!existsSync(sessionFile) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.equal(existsSync(sessionFile), true);
  const session = readFileSync(sessionFile, "utf8").trim();
  assert.equal(existsSync(session), true);
  child.kill("SIGTERM");
  await new Promise((resolve, reject) => {
    child.once("exit", resolve);
    child.once("error", reject);
  });
  assert.equal(existsSync(session), false);
  assert.equal(existsSync(fb.log), false);
  rmSync(repo.dir, { recursive: true, force: true });
  rmSync(bins, { recursive: true, force: true });
});

test("successful simulated gate-off deploys exactly seven intended function names", () => {
  const repo = makeRepo();
  const bins = mkdtempSync(join(tmpdir(), "grin-bins-"));
  const fb = stubBin(bins, "firebase");
  const r = runOp(repo, "gate-off-initial", {
    GRIN_OPS_ALLOW_LIVE: "stub",
    FIREBASE_BIN: fb.path,
    GRIN_OPS_ENDPOINT_FIXTURE: JSON.stringify(absentFixture),
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /PASS/);
  const log = readFileSync(fb.log, "utf8");
  assert.equal(log.trim().split("\n").length, 1);
  assert.match(log, /--only /);
  assert.doesNotMatch(log, /--only functions\n/);
  assert.doesNotMatch(log, /--only functions /);
  for (const name of GRIN_FUNCTIONS) {
    assert.match(log, new RegExp(`functions:${name}`));
  }
  rmSync(repo.dir, { recursive: true, force: true });
  rmSync(bins, { recursive: true, force: true });
});

test("successful simulated enable issues seven gcloud updates without --source", () => {
  const repo = makeRepo();
  const bins = mkdtempSync(join(tmpdir(), "grin-bins-"));
  const gcloud = stubBin(bins, "gcloud");
  const r = runOp(repo, "enable", {
    GRIN_OPS_ALLOW_LIVE: "stub",
    GCLOUD_BIN: gcloud.path,
    GRIN_OPS_ENDPOINT_FIXTURE: JSON.stringify(presentGcsFixture),
  });
  assert.equal(r.status, 0, r.stderr);
  const log = readFileSync(gcloud.log, "utf8");
  const lines = log.trim().split("\n");
  assert.equal(lines.length, 7);
  for (const name of GRIN_FUNCTIONS) {
    assert.ok(lines.some((l) => l.includes(`functions deploy ${name} `)));
  }
  assert.ok(lines.every((l) => l.includes("--update-env-vars=" + GATE_KEY + "=true")));
  assert.ok(lines.every((l) => !l.includes("--source")));
  assert.ok(lines.every((l) => !l.includes("--set-env-vars")));
  rmSync(repo.dir, { recursive: true, force: true });
  rmSync(bins, { recursive: true, force: true });
});

test("local source origin blocks gcloud env update", () => {
  const repo = makeRepo();
  const bins = mkdtempSync(join(tmpdir(), "grin-bins-"));
  const gcloud = stubBin(bins, "gcloud");
  const local = Object.fromEntries(
    GRIN_FUNCTIONS.map((n) => [n, { exists: true, sourceOrigin: "local" }]),
  );
  const r = runOp(repo, "disable", {
    GRIN_OPS_ALLOW_LIVE: "stub",
    GCLOUD_BIN: gcloud.path,
    GRIN_OPS_ENDPOINT_FIXTURE: JSON.stringify(local),
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /cwd/);
  assert.equal(existsSync(gcloud.log), false);
  rmSync(repo.dir, { recursive: true, force: true });
  rmSync(bins, { recursive: true, force: true });
});

test("existing remote GRIN endpoint blocks gate-off-initial firebase create", () => {
  const repo = makeRepo();
  const bins = mkdtempSync(join(tmpdir(), "grin-bins-"));
  const fb = stubBin(bins, "firebase");
  const r = runOp(repo, "gate-off-initial", {
    GRIN_OPS_ALLOW_LIVE: "stub",
    FIREBASE_BIN: fb.path,
    GRIN_OPS_ENDPOINT_FIXTURE: JSON.stringify(presentGcsFixture),
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /already exists/);
  assert.equal(existsSync(fb.log), false);
  rmSync(repo.dir, { recursive: true, force: true });
  rmSync(bins, { recursive: true, force: true });
});
