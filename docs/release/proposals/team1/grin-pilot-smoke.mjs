#!/usr/bin/env node
/**
 * GRIN restricted-pilot smoke gate.
 * Not authorization. Does not set GRIN_OPS_ALLOW_LIVE by itself.
 *
 * Labels:
 *   INJECTED     — default; synthetic in-process adapters (no live project)
 *   EMULATOR     — isolated demo project only; not LIVE_BACKEND
 *   LIVE_BACKEND — client Firebase phone OTP session + callable smoke
 *
 * Auth boundary for LIVE_BACKEND:
 *   - Owner signs in on the local Firebase JS phone OTP surface
 *     (grin-live-f-signin.mjs). OTP is never requested in chat/logs.
 *   - Session UID must match the private out-of-repo admission file.
 *   - Callables use that client ID token (httpsCallable-shaped).
 *   - Does not mint arbitrary-user tokens, grant Token Creator, create
 *     service-account keys, or call iamcredentials.signJwt.
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
export const E_PROJECT = "vyaamikk-diary";
export const E_REGION = "asia-south1";
export const E_APPLICATION_SHA = "540e07aa07f376716484adb879ce66cb9fb170ce";
export const E_SOURCE_STUB_STATUS = "SUPPORTED";
/** LIVE E (Functions v2 env PATCH) proven 2026-10-06; omitted-source gcloud remains FAILED. */
export const E_LIVE_STATUS = "PROVEN_PATCH";
export const E_LIVE_EXECUTABLE = true;
export const E_AUTH_BOUNDARY = "firebase-client-phone-otp";
export const FAILED_E_PROCEDURE = "gcloud-functions-deploy-omitted-source";

export const E_SEVEN_NAMES = Object.freeze([
  "grinRegisterGoodsReceipt",
  "grinReconcileCommand",
  "grinMutateGoodsReceipt",
  "grinReadGoodsReceipt",
  "grinReserveEvidence",
  "grinBeginEvidenceUpload",
  "grinUploadEvidence",
]);

/**
 * Historical argv shape for the retired omitted-source gcloud route.
 * Kept for refuse tests. Runtime enable/disable uses Functions v2 PATCH.
 */
export function expectedGcloudEnableArgs(functionName) {
  return [
    "functions",
    "deploy",
    functionName,
    `--project=${E_PROJECT}`,
    `--region=${E_REGION}`,
    "--gen2",
    `--update-env-vars=${GATE_KEY}=true`,
  ];
}

export function expectedGcloudDisableArgs(functionName) {
  return [
    "functions",
    "deploy",
    functionName,
    `--project=${E_PROJECT}`,
    `--region=${E_REGION}`,
    "--gen2",
    `--update-env-vars=${GATE_KEY}=false`,
  ];
}

export function eArgvUnsafe(args) {
  if (args.includes("--source") || args.some((a) => a.startsWith("--source="))) return true;
  if (args.includes("--set-env-vars") || args.some((a) => a.startsWith("--set-env-vars="))) {
    return true;
  }
  if (args.includes("--clear-env-vars")) return true;
  return false;
}

/**
 * Inspect readback: gate on/off by key presence/name only.
 * Never include env values, tokens, or secret payloads.
 */
export function inspectGateReadback(endpoint) {
  const gatePresent = Object.prototype.hasOwnProperty.call(endpoint.env || {}, GATE_KEY);
  const gateOn = (endpoint.env || {})[GATE_KEY] === "true";
  return {
    name: endpoint.name,
    presence: endpoint.presence,
    origin: endpoint.sourceOrigin,
    gate: gateOn ? "on" : "off",
    gatePresent,
    otherUserKeyCount: endpoint.otherUserKeyCount,
    secretBindingCount: endpoint.secretBindingCount,
  };
}

/** Sequential helper loop: first failure stops; already-updated names stay. Not a rollback. */
export function simulateGcloudGateLoop(names, failAtIndex = -1) {
  const updated = [];
  for (let i = 0; i < names.length; i++) {
    if (i === failAtIndex) {
      return {
        ok: false,
        updated,
        remaining: names.slice(i),
        mixedGate: updated.length > 0,
        rolledBack: false,
      };
    }
    updated.push(names[i]);
  }
  return { ok: true, updated, remaining: [], mixedGate: false, rolledBack: false };
}

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
  patchProven = process.env.GRIN_OPS_PATCH_PROVEN === "0"
    ? false
    : process.env.GRIN_OPS_PATCH_PROVEN === "1" || E_LIVE_EXECUTABLE,
} = {}) {
  if (allowLive === "1" && (process.env.GRIN_OPS_PINNED_SHA || process.env.GRIN_OPS_ENDPOINT_FIXTURE || process.env.GRIN_OPS_TEST_HANG || process.env.GRIN_OPS_HTTP_STUB)) {
    return {
      allowed: false,
      label: SMOKE_LABEL_LIVE,
      reason: "LIVE_BACKEND refuses pin/fixture/HTTP stubs/test-hang overrides",
    };
  }
  if (!E_LIVE_EXECUTABLE || (!gcloudProven && !patchProven)) {
    return {
      allowed: false,
      label: SMOKE_LABEL_LIVE,
      reason:
        "LIVE_BACKEND refused: E LIVE not proven (Functions v2 PATCH preservation required; omitted-source gcloud remains FAILED)",
    };
  }
  if (smokeLive !== "1" || allowLive !== "1") {
    return {
      allowed: false,
      label: SMOKE_LABEL_LIVE,
      reason: "LIVE_BACKEND requires GRIN_PILOT_SMOKE_LIVE=1 and GRIN_OPS_ALLOW_LIVE=1 after C+D+E and an owner live-smoke letter",
    };
  }
  return {
    allowed: true,
    label: SMOKE_LABEL_LIVE,
    reason: "admitted",
    authBoundary: E_AUTH_BOUNDARY,
  };
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

/**
 * LIVE cross_owner_denial needs a second real authenticated uid.
 * INJECTED uses synthetic OTHER. T1/T2 are unnamed — live case HOLD.
 */
export const SMOKE_SCENARIO_LIVE_REQUIREMENTS = Object.freeze({
  authenticated_success: { requiresSecondAuthenticatedUid: false },
  unauthenticated_denial: { requiresSecondAuthenticatedUid: false },
  non_admitted_denial: { requiresSecondAuthenticatedUid: false },
  cross_owner_denial: { requiresSecondAuthenticatedUid: true },
  register_replay: { requiresSecondAuthenticatedUid: false },
  upload_verification: { requiresSecondAuthenticatedUid: false },
  confirmation: { requiresSecondAuthenticatedUid: false },
  read_export: { requiresSecondAuthenticatedUid: false },
});

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
  if (!decision.allowed) abort(decision.reason);
  const liveF = join(HERE, "../../packets/grin-ops/grin-live-f.ts");
  if (!existsSync(liveF)) abort("grin-live-f.ts missing");
  process.stdout.write(
    `grin-pilot-smoke: LIVE_BACKEND admitted authBoundary=${E_AUTH_BOUNDARY} (owner OTP on local Firebase client; tokens/UIDs never printed)\n`,
  );
  const r = spawnSync("npx", ["--yes", "tsx", liveF], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: "inherit",
    env: {
      ...process.env,
      GRIN_OPS_ALLOW_LIVE: "1",
      GRIN_PILOT_SMOKE_LIVE: "1",
      GRIN_OPS_PATCH_PROVEN: "1",
    },
  });
  if (r.status !== 0) abort(`LIVE_BACKEND smoke failed with status ${r.status ?? "null"}`, r.status || 2);
  process.stdout.write(`grin-pilot-smoke: PASS label=${SMOKE_LABEL_LIVE} authBoundary=${E_AUTH_BOUNDARY}\n`);
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
INJECTED is the default (synthetic).
LIVE_BACKEND uses Firebase client phone OTP on the local sign-in surface (no signJwt).
Never prints UID values. Owner UID files must be outside git.
Live cross_owner_denial requires a second authenticated account (unnamed).
Retired E route ${FAILED_E_PROCEDURE} remains FAILED.
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
