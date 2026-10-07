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
  inspectLive,
  resolveCliDotenv,
  writeRollbackIfSuccessful,
} from "./grin-functions-op.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OP = join(HERE, "grin-functions-op.mjs");
const HTTP_STUB = join(HERE, "grin-ops-http-stub.mjs");

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

const LIVE_TEST_ENV = [
  "GRIN_OPS_ALLOW_LIVE",
  "GRIN_OPS_ENDPOINT_FIXTURE",
  "GRIN_OPS_PINNED_SHA",
  "GRIN_OPS_TEST_HANG",
  "GRIN_OPS_HTTP_STUB",
  "GRIN_OPS_HTTP_STUB_CFG",
  "FIREBASE_BIN",
  "GCLOUD_BIN",
  "GRIN_OPS_EXPORT_DIR",
  "GRIN_OPS_SESSION_FILE",
  "STUB_FAIL",
];

function opEnv(repo, extraEnv = {}, { pin = true } = {}) {
  const env = { ...process.env };
  for (const k of LIVE_TEST_ENV) delete env[k];
  env.GRIN_OPS_REPO = repo.dir;
  if (pin) env.GRIN_OPS_PINNED_SHA = repo.sha;
  Object.assign(env, extraEnv);
  return env;
}

function runOp(repo, cmd, extraEnv = {}, opts = {}) {
  return spawnSync(process.execPath, [OP, cmd], {
    cwd: repo.dir,
    encoding: "utf8",
    env: opEnv(repo, extraEnv, opts),
  });
}

const absentFixture = Object.fromEntries(
  GRIN_FUNCTIONS.map((n) => [n, { presence: "absent" }]),
);
const presentGcsFixture = Object.fromEntries(
  GRIN_FUNCTIONS.map((n) => [n, { presence: "present", sourceOrigin: "gcs" }]),
);

function fnName(id) {
  return `projects/${PROJECT_ID}/locations/asia-south1/functions/${id}`;
}

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
    env: opEnv(repo, {
      GRIN_OPS_ALLOW_LIVE: "stub",
      FIREBASE_BIN: fb.path,
      GRIN_OPS_TEST_HANG: "1",
      GRIN_OPS_SESSION_FILE: sessionFile,
      GRIN_OPS_ENDPOINT_FIXTURE: JSON.stringify(absentFixture),
    }),
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

test("omitted-source gcloud enable is FAILED and not executable", () => {
  const repo = makeRepo();
  const bins = mkdtempSync(join(tmpdir(), "grin-bins-"));
  const gcloud = stubBin(bins, "gcloud");
  const r = runOp(repo, "enable", {
    GRIN_OPS_ALLOW_LIVE: "stub",
    GCLOUD_BIN: gcloud.path,
    GRIN_OPS_METHOD: "gcloud-update-env-vars",
    GRIN_OPS_ENDPOINT_FIXTURE: JSON.stringify(presentGcsFixture),
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /FAILED/);
  assert.equal(existsSync(gcloud.log), false);
  rmSync(repo.dir, { recursive: true, force: true });
  rmSync(bins, { recursive: true, force: true });
});

test("successful simulated enable issues seven functions v2 env PATCH operations", () => {
  const repo = makeRepo();
  const r = runOp(repo, "enable", {
    GRIN_OPS_ALLOW_LIVE: "stub",
    GRIN_OPS_HTTP_STUB: join(HERE, "grin-ops-patch-http-stub.mjs"),
    GRIN_OPS_ENDPOINT_FIXTURE: JSON.stringify(presentGcsFixture),
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /PASS \(functions v2 PATCH/);
  assert.doesNotMatch(r.stdout, /ya29\./);
  for (const name of GRIN_FUNCTIONS) {
    assert.match(r.stdout, new RegExp(`name=${name} gate=on`));
  }
  rmSync(repo.dir, { recursive: true, force: true });
});

test("local source origin is allowed for functions v2 env PATCH", () => {
  const repo = makeRepo();
  const local = Object.fromEntries(
    GRIN_FUNCTIONS.map((n) => [n, { presence: "present", sourceOrigin: "local" }]),
  );
  const r = runOp(repo, "disable", {
    GRIN_OPS_ALLOW_LIVE: "stub",
    GRIN_OPS_HTTP_STUB: join(HERE, "grin-ops-patch-http-stub.mjs"),
    GRIN_OPS_ENDPOINT_FIXTURE: JSON.stringify(local),
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /PASS \(functions v2 PATCH/);
  rmSync(repo.dir, { recursive: true, force: true });
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

function runHttpGateOff(functionsCfg, extra = {}) {
  const repo = makeRepo();
  const bins = mkdtempSync(join(tmpdir(), "grin-bins-"));
  const fb = stubBin(bins, "firebase");
  const r = runOp(repo, "gate-off-initial", {
    GRIN_OPS_ALLOW_LIVE: "stub",
    FIREBASE_BIN: fb.path,
    GRIN_OPS_HTTP_STUB: HTTP_STUB,
    GRIN_OPS_HTTP_STUB_CFG: JSON.stringify(functionsCfg),
    ...extra,
  });
  return { repo, bins, fb, r };
}

function cleanupHttp(h) {
  rmSync(h.repo.dir, { recursive: true, force: true });
  rmSync(h.bins, { recursive: true, force: true });
}

for (const status of [401, 403, 500]) {
  test(`Functions list HTTP ${status} is UNKNOWN and does not deploy`, () => {
    const h = runHttpGateOff({ functions: { status, json: { error: "denied" } } });
    assert.notEqual(h.r.status, 0);
    assert.match(h.r.stderr, /UNKNOWN|incomplete|unsuccessful/i);
    assert.doesNotMatch(h.r.stdout, /ABSENT/);
    assert.equal(existsSync(h.fb.log), false);
    cleanupHttp(h);
  });
}

test("malformed Functions JSON is UNKNOWN and does not deploy", () => {
  const h = runHttpGateOff({ functions: { status: 200, json: null, parseOk: false } });
  assert.notEqual(h.r.status, 0);
  assert.match(h.r.stderr, /UNKNOWN|malformed|incomplete/i);
  assert.equal(existsSync(h.fb.log), false);
  cleanupHttp(h);
});

test("invalid Functions list shape is UNKNOWN and does not deploy", () => {
  const h = runHttpGateOff({ functions: { status: 200, json: { functions: { not: "array" } } } });
  assert.notEqual(h.r.status, 0);
  assert.match(h.r.stderr, /UNKNOWN|shape|incomplete/i);
  assert.equal(existsSync(h.fb.log), false);
  cleanupHttp(h);
});

test("failed project identity check does not deploy", () => {
  const h = runHttpGateOff({
    project: { status: 200, json: { projectId: "other-project", projectNumber: "1" } },
  });
  assert.notEqual(h.r.status, 0);
  assert.match(h.r.stderr, /project identity/i);
  assert.equal(existsSync(h.fb.log), false);
  cleanupHttp(h);
});

test("failed bucket membership check does not deploy", () => {
  const h = runHttpGateOff({
    bucket: { status: 403, json: { error: "denied" } },
  });
  assert.notEqual(h.r.status, 0);
  assert.match(h.r.stderr, /bucket/i);
  assert.equal(existsSync(h.fb.log), false);
  cleanupHttp(h);
});

test("later inventory page with existing GRIN function refuses initial-create", () => {
  const h = runHttpGateOff({
    functionPages: [
      {
        response: {
          status: 200,
          json: {
            functions: [
              {
                name: fnName("mintClientAuthToken"),
                serviceConfig: {
                  serviceAccountEmail: "982505811909-compute@developer.gserviceaccount.com",
                },
              },
            ],
            nextPageToken: "p2",
          },
        },
      },
      {
        pageToken: "p2",
        response: {
          status: 200,
          json: {
            functions: [
              {
                name: fnName("grinRegisterGoodsReceipt"),
                buildConfig: { source: { storageSource: { bucket: "src" } } },
              },
            ],
          },
        },
      },
    ],
  });
  assert.notEqual(h.r.status, 0);
  assert.match(h.r.stderr, /already exists/);
  assert.equal(existsSync(h.fb.log), false);
  cleanupHttp(h);
});

test("interrupted pagination is UNKNOWN and does not deploy", () => {
  const h = runHttpGateOff({
    functionPages: [
      {
        response: {
          status: 200,
          json: { functions: [], nextPageToken: "p2" },
        },
      },
      {
        pageToken: "p2",
        response: { status: 500, json: { error: "page failed" } },
      },
    ],
  });
  assert.notEqual(h.r.status, 0);
  assert.match(h.r.stderr, /UNKNOWN|incomplete/i);
  assert.equal(existsSync(h.fb.log), false);
  cleanupHttp(h);
});

test("empty fixture is rejected and is not absent", () => {
  const repo = makeRepo();
  const bins = mkdtempSync(join(tmpdir(), "grin-bins-"));
  const fb = stubBin(bins, "firebase");
  const r = runOp(repo, "gate-off-initial", {
    GRIN_OPS_ALLOW_LIVE: "stub",
    FIREBASE_BIN: fb.path,
    GRIN_OPS_ENDPOINT_FIXTURE: "{}",
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /incomplete/);
  assert.equal(existsSync(fb.log), false);
  rmSync(repo.dir, { recursive: true, force: true });
  rmSync(bins, { recursive: true, force: true });
});

test("partial fixture is rejected and is not absent", () => {
  const repo = makeRepo();
  const bins = mkdtempSync(join(tmpdir(), "grin-bins-"));
  const fb = stubBin(bins, "firebase");
  const r = runOp(repo, "gate-off-initial", {
    GRIN_OPS_ALLOW_LIVE: "stub",
    FIREBASE_BIN: fb.path,
    GRIN_OPS_ENDPOINT_FIXTURE: JSON.stringify({
      grinRegisterGoodsReceipt: { presence: "absent" },
    }),
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /incomplete/);
  assert.equal(existsSync(fb.log), false);
  rmSync(repo.dir, { recursive: true, force: true });
  rmSync(bins, { recursive: true, force: true });
});

test("live mode rejects endpoint fixture before mutation", () => {
  const repo = makeRepo();
  const bins = mkdtempSync(join(tmpdir(), "grin-bins-"));
  const fb = stubBin(bins, "firebase");
  const r = runOp(
    repo,
    "gate-off-initial",
    {
      GRIN_OPS_ALLOW_LIVE: "1",
      GRIN_OPS_ENDPOINT_FIXTURE: "{}",
    },
    { pin: false },
  );
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /live mode rejects test overrides/);
  assert.match(r.stderr, /GRIN_OPS_ENDPOINT_FIXTURE/);
  assert.equal(existsSync(fb.log), false);
  rmSync(repo.dir, { recursive: true, force: true });
  rmSync(bins, { recursive: true, force: true });
});

test("live mode rejects source-pin override before mutation", () => {
  const repo = makeRepo();
  const bins = mkdtempSync(join(tmpdir(), "grin-bins-"));
  const fb = stubBin(bins, "firebase");
  const r = runOp(repo, "gate-off-initial", {
    GRIN_OPS_ALLOW_LIVE: "1",
    GRIN_OPS_PINNED_SHA: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /live mode rejects test overrides/);
  assert.match(r.stderr, /GRIN_OPS_PINNED_SHA/);
  assert.equal(existsSync(fb.log), false);
  rmSync(repo.dir, { recursive: true, force: true });
  rmSync(bins, { recursive: true, force: true });
});

test("live mode rejects test-hang override before mutation", () => {
  const repo = makeRepo();
  const bins = mkdtempSync(join(tmpdir(), "grin-bins-"));
  const fb = stubBin(bins, "firebase");
  const r = runOp(
    repo,
    "gate-off-initial",
    {
      GRIN_OPS_ALLOW_LIVE: "1",
      GRIN_OPS_TEST_HANG: "1",
    },
    { pin: false },
  );
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /live mode rejects test overrides/);
  assert.match(r.stderr, /GRIN_OPS_TEST_HANG/);
  assert.equal(existsSync(fb.log), false);
  rmSync(repo.dir, { recursive: true, force: true });
  rmSync(bins, { recursive: true, force: true });
});

test("stub mode without explicit executor does not fall back to PATH", () => {
  const repo = makeRepo();
  const r = runOp(repo, "gate-off-initial", {
    GRIN_OPS_ALLOW_LIVE: "stub",
    GRIN_OPS_ENDPOINT_FIXTURE: JSON.stringify(absentFixture),
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /no PATH fallback/);
  rmSync(repo.dir, { recursive: true, force: true });
});

test("failed Rules export leaves previous rollback bytes unchanged", async () => {
  const dir = mkdtempSync(join(tmpdir(), "grin-rules-export-"));
  const prevFs = "PREVIOUS_FIRESTORE_ROLLBACK_BYTES\n";
  const prevSt = "PREVIOUS_STORAGE_ROLLBACK_BYTES\n";
  writeFileSync(join(dir, "firestore.rules"), prevFs);
  writeFileSync(join(dir, "storage.rules"), prevSt);
  const { makeGcpFetch } = await import(HTTP_STUB);
  const fetchImpl = makeGcpFetch({
    releases: {
      status: 200,
      json: {
        releases: [
          {
            name: "projects/vyaamikk-diary/releases/cloud.firestore",
            rulesetName: "projects/vyaamikk-diary/rulesets/test-fs",
          },
          {
            name: "projects/vyaamikk-diary/releases/firebase.storage/vyaamikk-diary.firebasestorage.app",
            rulesetName: "projects/vyaamikk-diary/rulesets/test-st",
          },
        ],
      },
    },
    ruleset: { status: 500, json: { error: "export failed" } },
  });
  try {
    await inspectLive({ exportDir: dir, fetchImpl });
    assert.equal(readFileSync(join(dir, "firestore.rules"), "utf8"), prevFs);
    assert.equal(readFileSync(join(dir, "storage.rules"), "utf8"), prevSt);
    const skipped = writeRollbackIfSuccessful(join(dir, "firestore.rules"), "", false);
    assert.equal(skipped.written, false);
    assert.equal(readFileSync(join(dir, "firestore.rules"), "utf8"), prevFs);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("valid complete inventory inspect reports absence not unknown", async () => {
  const { makeGcpFetch } = await import(HTTP_STUB);
  const report = await inspectLive({
    fetchImpl: makeGcpFetch({ functions: { status: 200, json: { functions: [] } } }),
  });
  assert.equal(report.functionsInventory.complete, true);
  assert.equal(report.functionsInventory.status, 200);
  assert.equal(report.allGrinAbsent, true);
  assert.equal(report.runtime.firestoreDbIamState, "unsupported");
  assert.equal(report.runtime.firestoreDbIamHttp, 501);
  for (const name of GRIN_FUNCTIONS) {
    assert.equal(report.grinEndpoints[name].presence, "absent");
  }
});

test("valid complete preflight deploys exactly seven GRIN names via HTTP inventory", () => {
  const h = runHttpGateOff({ functions: { status: 200, json: { functions: [] } } });
  assert.equal(h.r.status, 0, h.r.stderr);
  const log = readFileSync(h.fb.log, "utf8");
  assert.equal(log.trim().split("\n").length, 1);
  for (const name of GRIN_FUNCTIONS) {
    assert.match(log, new RegExp(`functions:${name}`));
  }
  assert.doesNotMatch(log, /--only functions\n/);
  cleanupHttp(h);
});

test("HTTP 403 inspect reports UNKNOWN not allGrinAbsent", async () => {
  const { makeGcpFetch } = await import(HTTP_STUB);
  const report = await inspectLive({
    fetchImpl: makeGcpFetch({ functions: { status: 403, json: { error: "forbidden" } } }),
  });
  assert.equal(report.functionsInventory.complete, false);
  assert.equal(report.functionsInventory.status, 403);
  assert.equal(report.allGrinAbsent, false);
  for (const name of GRIN_FUNCTIONS) {
    assert.equal(report.grinEndpoints[name].presence, "unknown");
  }
});


