#!/usr/bin/env node
/**
 * GRIN restricted-pilot smoke gate.
 * Not authorization. Does not set GRIN_OPS_ALLOW_LIVE.
 *
 * Labels:
 *   INJECTED     — default; synthetic in-process adapters (no live project)
 *   EMULATOR     — isolated demo project only; not LIVE_BACKEND
 *   LIVE_BACKEND — refused: A6 gcloud omitted-source preservation is UNPROVEN
 *
 * Owner Firebase Auth UIDs are supplied privately (not in git). This module
 * never prints UID values, tokens, or env values.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SMOKE_LABEL_INJECTED = "INJECTED";
export const SMOKE_LABEL_EMULATOR = "EMULATOR";
export const SMOKE_LABEL_LIVE = "LIVE_BACKEND";

export const PLAY_BILLING_TESTER_UIDS_ENV = "PLAY_BILLING_TESTER_UIDS";
export const GATE_KEY = "GRIN_GOODS_EVIDENCE_FUNCTIONS";

/** Firebase Auth UID: 1–128 of [A-Za-z0-9_-]. Rejects emails, paths, whitespace. */
export const FIREBASE_AUTH_UID = /^[A-Za-z0-9_-]{1,128}$/;

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../../..");
const INJECTED = join(HERE, "grin-pilot-smoke.injected.ts");
const EMULATOR_TEST = resolve(
  REPO_ROOT,
  "tools/goods-evidence-emulator/production-compose.gates.emulator.test.ts",
);

export class SmokeAbort extends Error {
  constructor(message, code = 2) {
    super(message);
    this.name = "SmokeAbort";
    this.code = code;
  }
}

function abort(message, code = 2) {
  throw new SmokeAbort(message, code);
}

export function parseFirebaseAuthUids(raw, { source = "input" } = {}) {
  if (raw == null) {
    return { ok: true, uids: [], empty: true, source };
  }
  if (typeof raw !== "string") {
    return { ok: false, error: `${source} is not a string`, uids: [], empty: true, source };
  }
  const tokens = raw
    .split(/[\n,]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !part.startsWith("#"));
  if (tokens.length === 0) {
    return { ok: true, uids: [], empty: true, source };
  }
  const seen = new Set();
  const uids = [];
  for (const token of tokens) {
    if (token.includes("@")) {
      return {
        ok: false,
        error: `${source} contains an email; supply Firebase Auth UIDs, not emails`,
        uids: [],
        empty: false,
        source,
      };
    }
    if (!FIREBASE_AUTH_UID.test(token)) {
      return {
        ok: false,
        error: `${source} contains a token that is not a Firebase Auth UID (1–128 of [A-Za-z0-9_-], no '/', no whitespace)`,
        uids: [],
        empty: false,
        source,
      };
    }
    if (seen.has(token)) continue;
    seen.add(token);
    uids.push(token);
  }
  return { ok: true, uids, empty: uids.length === 0, source };
}

/**
 * Same split/trim as functions/src/billing/google/playConstants.ts.
 * Empty/absent PLAY_BILLING_TESTER_UIDS → empty set → fail-closed (deny all).
 * Invalid tokens fail closed (do not silently drop).
 */
export function parsePlayBillingTesterUids(env = process.env) {
  const raw = env[PLAY_BILLING_TESTER_UIDS_ENV];
  if (raw == null || raw === "") {
    return { ok: true, uids: [], empty: true, failClosed: true };
  }
  const parsed = parseFirebaseAuthUids(raw, { source: PLAY_BILLING_TESTER_UIDS_ENV });
  if (!parsed.ok) {
    return { ok: false, uids: [], empty: true, failClosed: true, error: parsed.error };
  }
  return {
    ok: true,
    uids: parsed.uids,
    empty: parsed.empty,
    failClosed: parsed.empty,
  };
}

export function pathIsInsideRepo(filePath, repoRoot = REPO_ROOT) {
  const abs = resolve(filePath);
  const root = resolve(repoRoot);
  const rel = relative(root, abs);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function loadOwnerUidFile(filePath, repoRoot = REPO_ROOT) {
  if (typeof filePath !== "string" || filePath.trim() === "") {
    return { ok: false, error: "owner UID file path is required", uids: [], empty: true };
  }
  const abs = resolve(filePath);
  if (pathIsInsideRepo(abs, repoRoot)) {
    return {
      ok: false,
      error: "owner UID file must live outside the git worktree (do not commit UIDs)",
      uids: [],
      empty: true,
    };
  }
  if (!existsSync(abs)) {
    return { ok: false, error: "owner UID file is missing", uids: [], empty: true };
  }
  const parsed = parseFirebaseAuthUids(readFileSync(abs, "utf8"), { source: "owner UID file" });
  if (!parsed.ok) return { ...parsed, empty: true, uids: [] };
  return parsed;
}

export function liveBackendAdmission({
  allowLive = process.env.GRIN_OPS_ALLOW_LIVE,
  smokeLive = process.env.GRIN_PILOT_SMOKE_LIVE,
  gcloudProven = false,
} = {}) {
  if (allowLive === "1" && (process.env.GRIN_OPS_PINNED_SHA || process.env.GRIN_OPS_ENDPOINT_FIXTURE || process.env.GRIN_OPS_TEST_HANG || process.env.GRIN_OPS_HTTP_STUB)) {
    return {
      allowed: false,
      label: SMOKE_LABEL_LIVE,
      reason: "LIVE_BACKEND refuses pin/fixture/HTTP stubs/test-hang overrides",
    };
  }
  if (!gcloudProven) {
    return {
      allowed: false,
      label: SMOKE_LABEL_LIVE,
      reason:
        "LIVE_BACKEND refused: gcloud omitted --source preservation on firebase-created gen2 callables is UNPROVEN (A6). Do not enable live GRIN to obtain that evidence.",
    };
  }
  if (smokeLive !== "1" || allowLive !== "1") {
    return {
      allowed: false,
      label: SMOKE_LABEL_LIVE,
      reason: "LIVE_BACKEND requires a later approved pilot (GRIN_PILOT_SMOKE_LIVE=1 and GRIN_OPS_ALLOW_LIVE=1) after A3+A4+A6",
    };
  }
  return { allowed: true, label: SMOKE_LABEL_LIVE, reason: "admitted" };
}

export const SMOKE_SCENARIOS = Object.freeze([
  "authenticated_success",
  "unauthenticated_denial",
  "non_admitted_denial",
  "cross_owner_denial",
  "register_replay",
  "upload_verification",
  "confirmation",
  "read_export",
]);

function runInjected() {
  const r = spawnSync("npx", ["--yes", "tsx", INJECTED], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (r.status !== 0) abort(`INJECTED smoke failed with status ${r.status ?? "null"}`, r.status || 2);
  process.stdout.write(`grin-pilot-smoke: PASS label=${SMOKE_LABEL_INJECTED} synthetic=true live=false\n`);
}

function emulatorHostsPresent() {
  return Boolean(
    process.env.FIRESTORE_EMULATOR_HOST &&
      process.env.FIREBASE_AUTH_EMULATOR_HOST &&
      process.env.FIREBASE_STORAGE_EMULATOR_HOST,
  );
}

function runEmulator() {
  if (!emulatorHostsPresent()) {
    abort(
      `EMULATOR smoke requires firebase emulators:exec hosts. Use: npm run test:goods-evidence-g1-functions-emulator (label=${SMOKE_LABEL_EMULATOR}, not LIVE_BACKEND)`,
    );
  }
  const r = spawnSync("npx", ["--yes", "tsx", EMULATOR_TEST], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (r.status !== 0) abort(`EMULATOR smoke failed with status ${r.status ?? "null"}`, r.status || 2);
  process.stdout.write(`grin-pilot-smoke: PASS label=${SMOKE_LABEL_EMULATOR} synthetic=true live=false\n`);
}

function runLive() {
  const decision = liveBackendAdmission();
  abort(decision.reason);
}

function runValidateUids(filePath) {
  const billing = parsePlayBillingTesterUids();
  if (!billing.ok) abort(billing.error);
  process.stdout.write(
    `play_billing_tester_uids empty=${billing.empty} fail_closed=${billing.failClosed} count=${billing.uids.length}\n`,
  );
  const loaded = loadOwnerUidFile(filePath);
  if (!loaded.ok) abort(loaded.error);
  if (loaded.empty) abort("owner UID file is empty; fail-closed (no testers admitted; do not invent UIDs)");
  process.stdout.write(`owner_uids valid=true count=${loaded.uids.length} (values not printed)\n`);
}

function printUsage() {
  process.stdout.write(`Usage: node grin-pilot-smoke.mjs [injected|emulator|live|validate-uids <file>]
INJECTED is the default (synthetic). LIVE_BACKEND is refused while A6 is UNPROVEN.
Never prints UID values. Owner UID files must be outside git.
`);
}

export async function main(argv = process.argv) {
  const cmd = argv[2] || "injected";
  try {
    if (cmd === "injected") {
      runInjected();
      return 0;
    }
    if (cmd === "emulator") {
      runEmulator();
      return 0;
    }
    if (cmd === "live") {
      runLive();
      return 0;
    }
    if (cmd === "validate-uids") {
      runValidateUids(argv[3]);
      return 0;
    }
    printUsage();
    abort(`unknown smoke command ${cmd}`);
  } catch (err) {
    if (err instanceof SmokeAbort) {
      process.stderr.write(`${err.message}\n`);
      return err.code;
    }
    throw err;
  }
}

const invoked = process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  main().then((code) => {
    process.exit(code);
  });
}
