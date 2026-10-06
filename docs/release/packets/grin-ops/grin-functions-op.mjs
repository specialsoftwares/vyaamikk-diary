#!/usr/bin/env node
/**
 * Guarded Internal GRIN Functions operations.
 * Not authorization. Mutating commands refuse unless GRIN_OPS_ALLOW_LIVE is
 * "stub" (injected binaries) or "1" (later owner-approved live run).
 *
 * Never prints env values, tokens, or credentials.
 */
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const require = createRequire(import.meta.url);

export const PINNED_APP_SHA = "520f9f98bc952fd7f30a907da9e85774629a69c0";
export const PROJECT_ID = "vyaamikk-diary";
export const PROJECT_NUMBER = "982505811909";
export const REGION = "asia-south1";
export const BUCKET = "vyaamikk-diary.firebasestorage.app";
export const GATE_KEY = "GRIN_GOODS_EVIDENCE_FUNCTIONS";
export const ALIAS = "production";

export const GRIN_FUNCTIONS = Object.freeze([
  "grinRegisterGoodsReceipt",
  "grinReconcileCommand",
  "grinMutateGoodsReceipt",
  "grinReadGoodsReceipt",
  "grinReserveEvidence",
  "grinBeginEvidenceUpload",
  "grinUploadEvidence",
]);

export const DEPLOYMENT_PATHS = Object.freeze([
  "functions",
  "src",
  "eas.json",
  "app.json",
  "app",
  "firebase.json",
]);

export const CLI_DOTENV_NAMES = Object.freeze([
  ".env",
  `.env.${PROJECT_ID}`,
  `.env.${ALIAS}`,
  ".env.local",
]);

export const REVIEWED_FIREBASE_CLI = "14.20.0";
export const PRESENCE_PRESENT = "present";
export const PRESENCE_ABSENT = "absent";
export const PRESENCE_UNKNOWN = "unknown";

const LIVE_FORBIDDEN_ENV = Object.freeze([
  "GRIN_OPS_ENDPOINT_FIXTURE",
  "GRIN_OPS_PINNED_SHA",
  "GRIN_OPS_TEST_HANG",
  "GRIN_OPS_HTTP_STUB",
  "FIREBASE_BIN",
  "GCLOUD_BIN",
]);

export class OpsAbort extends Error {
  constructor(message, code = 2) {
    super(message);
    this.name = "OpsAbort";
    this.code = code;
  }
}

export function abort(message, code = 2) {
  throw new OpsAbort(message, code);
}

function env(name, fallback = "") {
  const v = process.env[name];
  return v == null || v === "" ? fallback : v;
}

function envSet(name) {
  const v = process.env[name];
  return v != null && v !== "";
}

function allowLive() {
  return env("GRIN_OPS_ALLOW_LIVE");
}

export function pinnedAppSha() {
  if (allowLive() === "1") return PINNED_APP_SHA;
  return env("GRIN_OPS_PINNED_SHA", PINNED_APP_SHA);
}

export function assertLiveOverridesRejected() {
  if (allowLive() !== "1") return;
  const set = LIVE_FORBIDDEN_ENV.filter((name) => envSet(name));
  if (set.length) {
    abort(`live mode rejects test overrides (${set.join(", ")}) before inspection or mutation`);
  }
}

export function firebaseToolsRoot() {
  if (process.env.FIREBASE_TOOLS_ROOT) return process.env.FIREBASE_TOOLS_ROOT;
  const which = spawnSync("which", ["firebase"], { encoding: "utf8" });
  if (which.status !== 0) abort("firebase CLI not found on PATH");
  const bin = which.stdout.trim();
  return resolve(dirname(bin), "..", "lib", "node_modules", "firebase-tools");
}

export function loadFirebaseEnvModule() {
  return require(join(firebaseToolsRoot(), "lib", "functions", "env.js"));
}

/** Official firebase-tools 14.20.0 dotenv load. Does not print values. */
export function resolveCliDotenv(functionsDir, { projectId = PROJECT_ID, projectAlias = ALIAS } = {}) {
  const envMod = loadFirebaseEnvModule();
  const opts = {
    functionsSource: functionsDir,
    projectId,
    projectAlias,
    isEmulator: false,
  };
  const present = CLI_DOTENV_NAMES.filter((name) => existsSync(join(functionsDir, name)));
  let parsedKeys = [];
  let gateExactTrue = false;
  let loadError = null;
  try {
    const parsed = envMod.loadUserEnvs(opts);
    parsedKeys = Object.keys(parsed);
    gateExactTrue = parsed[GATE_KEY] === "true";
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }
  return {
    present,
    conflict:
      present.includes(`.env.${projectId}`) && present.includes(`.env.${projectAlias}`),
    hasUserEnvs: envMod.hasUserEnvs(opts),
    parsedKeyCount: parsedKeys.length,
    gateExactTrue,
    loadError,
  };
}

export function dotenvFilesOnDisk(functionsDir) {
  return CLI_DOTENV_NAMES.filter((name) => existsSync(join(functionsDir, name)));
}

export function applyGcloudGateUpdate(existingEnv, gateValue) {
  const next = { ...existingEnv };
  if (gateValue === null) {
    delete next[GATE_KEY];
  } else {
    next[GATE_KEY] = gateValue;
  }
  return next;
}

/** Firebase dotenv deploy replaces user env on selected endpoints. Blocked. */
export function firebaseDotenvWouldReplaceExisting() {
  return true;
}

export function classifySourceOrigin(sourceUri) {
  if (!sourceUri) return "unknown";
  if (sourceUri.startsWith("gs://")) return "gcs";
  if (sourceUri.startsWith("https://") || sourceUri.startsWith("http://")) return "repo";
  return "local";
}

export function gcloudUpdateAllowed(sourceOrigin) {
  return sourceOrigin === "gcs" || sourceOrigin === "repo";
}

export function buildFirebaseSevenOnlyArgs() {
  const only = GRIN_FUNCTIONS.map((n) => `functions:${n}`).join(",");
  return [
    "deploy",
    "--project",
    PROJECT_ID,
    "--non-interactive",
    "--only",
    only,
  ];
}

export function firebaseOnlyIsBroad(args) {
  const i = args.indexOf("--only");
  if (i < 0) return true;
  const value = args[i + 1] || "";
  if (value === "functions" || value === "functions:default") return true;
  for (const name of GRIN_FUNCTIONS) {
    if (!value.split(",").includes(`functions:${name}`)) return true;
  }
  const parts = value.split(",").filter(Boolean);
  if (parts.length !== GRIN_FUNCTIONS.length) return true;
  return parts.some((p) => !p.startsWith("functions:grin"));
}

export function buildGcloudGateArgs(functionName, gateValue) {
  const args = [
    "functions",
    "deploy",
    functionName,
    `--project=${PROJECT_ID}`,
    `--region=${REGION}`,
    "--gen2",
  ];
  if (gateValue === null) {
    args.push(`--remove-env-vars=${GATE_KEY}`);
  } else {
    args.push(`--update-env-vars=${GATE_KEY}=${gateValue}`);
  }
  return args;
}

export function gcloudArgsUnsafe(args) {
  if (args.includes("--source") || args.some((a) => a.startsWith("--source="))) return true;
  if (args.includes("--set-env-vars") || args.some((a) => a.startsWith("--set-env-vars="))) {
    return true;
  }
  if (args.includes("--clear-env-vars")) return true;
  return false;
}

function gitBin() {
  return env("GIT_BIN", "git");
}

function git(cwd, gitArgs) {
  const r = spawnSync(gitBin(), gitArgs, { cwd, encoding: "utf8" });
  return r;
}

export function assertRepoRoot(cwd) {
  const fb = join(cwd, "firebase.json");
  const rc = join(cwd, ".firebaserc");
  const fn = join(cwd, "functions");
  if (!existsSync(fb) || !existsSync(rc) || !existsSync(fn)) {
    abort(`working directory is not the repository root (need firebase.json, .firebaserc, functions/): ${cwd}`);
  }
  const parsed = JSON.parse(readFileSync(fb, "utf8"));
  const src = parsed?.functions?.[0]?.source;
  if (src !== "functions") {
    abort("repo-root firebase.json functions source is not 'functions'; refusing");
  }
  if (parsed?.firestore?.rules !== "firestore.rules") {
    abort("repo-root firebase.json firestore.rules path unexpected; isolated GRIN Rules config must be used separately");
  }
}

export function assertPinnedSource(cwd) {
  const pin = pinnedAppSha();
  const head = git(cwd, ["rev-parse", "HEAD"]);
  if (head.status !== 0) abort("git rev-parse HEAD failed");
  const headSha = head.stdout.trim();
  if (headSha === pin) return { headSha, pin, docsOnly: false };
  const diff = git(cwd, ["diff", "--quiet", pin, "--", ...DEPLOYMENT_PATHS]);
  if (diff.status === 0) return { headSha, pin, docsOnly: true };
  abort(
    `deployment tree is not pinned application ${pin} (HEAD ${headSha}); git diff vs pin is not empty on functions/src/eas.json/app.json/app/firebase.json`,
  );
}

export function assertCleanDeploymentInputs(cwd) {
  const status = git(cwd, [
    "status",
    "--porcelain",
    "--untracked-files=all",
    "--",
    ...DEPLOYMENT_PATHS,
  ]);
  if (status.status !== 0) abort("git status failed");
  const text = status.stdout.trim();
  if (text) {
    abort("dirty or untracked deployment inputs present; refusing to reset or stash");
  }
}

export function assertNoCliDotenv(functionsDir) {
  const disk = dotenvFilesOnDisk(functionsDir);
  if (disk.length) {
    abort(
      `refusing because CLI-loadable dotenv already exists (${disk.join(", ")}); will not overwrite or remove operator-owned files`,
    );
  }
  const resolved = resolveCliDotenv(functionsDir);
  if (resolved.loadError) abort(`firebase-tools dotenv parser error: ${resolved.loadError}`);
  if (resolved.hasUserEnvs || resolved.present.length) {
    abort("firebase-tools reports user env files; refusing");
  }
  if (resolved.gateExactTrue) abort("resolved dotenv would set GATE exact true");
}

export function createSessionDir() {
  const dir = mkdtempSync(join(tmpdir(), "grin-ops-"));
  chmodSync(dir, 0o700);
  const announce = env("GRIN_OPS_SESSION_FILE");
  if (announce) writeFileSync(announce, dir, { mode: 0o600 });
  return dir;
}

export function cleanupSessionDir(dir) {
  if (!dir) return;
  const base = resolve(tmpdir());
  const resolved = resolve(dir);
  if (!resolved.startsWith(base + "/") || !resolved.includes("grin-ops-")) return;
  rmSync(resolved, { recursive: true, force: true });
}

function runTool(bin, args, { cwd, sessionDir } = {}) {
  if (!bin) abort("deploy executable not configured");
  const journal = sessionDir ? join(sessionDir, "argv.log") : null;
  if (journal) {
    writeFileSync(journal, JSON.stringify({ bin, args }) + "\n", { flag: "a", mode: 0o600 });
    chmodSync(journal, 0o600);
  }
  const r = spawnSync(bin, args, { cwd, encoding: "utf8" });
  const status = r.status == null ? 1 : r.status;
  return { status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

export function summarizeEndpointEnv(envMap) {
  const keys = Object.keys(envMap || {});
  return {
    gateOn: envMap?.[GATE_KEY] === "true",
    gatePresent: Object.prototype.hasOwnProperty.call(envMap || {}, GATE_KEY),
    otherUserKeyCount: keys.filter((k) => k !== GATE_KEY).length,
  };
}

export function parseEndpointFixture(raw) {
  return JSON.parse(raw);
}

export function loadEndpointFixture(pathOrJson) {
  if (!pathOrJson) abort("endpoint fixture is missing; incomplete entries are not absent");
  const text = existsSync(pathOrJson) ? readFileSync(pathOrJson, "utf8") : pathOrJson;
  let parsed;
  try {
    parsed = parseEndpointFixture(text);
  } catch {
    abort("endpoint fixture is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    abort("endpoint fixture must be an object with an entry per GRIN function");
  }
  const out = {};
  const missing = [];
  for (const name of GRIN_FUNCTIONS) {
    const e = parsed[name];
    if (!e || typeof e !== "object") {
      missing.push(name);
      continue;
    }
    const presence = e.presence;
    if (presence !== PRESENCE_PRESENT && presence !== PRESENCE_ABSENT && presence !== PRESENCE_UNKNOWN) {
      abort(`${name} fixture presence must be present, absent, or unknown`);
    }
    out[name] = {
      presence,
      exists: presence === PRESENCE_PRESENT,
      sourceOrigin: e.sourceOrigin || (presence === PRESENCE_ABSENT ? "absent" : "unknown"),
      gateOn: !!e.gateOn,
    };
  }
  if (missing.length) abort(`endpoint fixture is incomplete (${missing.join(", ")}); incomplete is not absent`);
  return out;
}

export function assertAllAbsent(fixture) {
  for (const name of GRIN_FUNCTIONS) {
    const e = fixture[name];
    if (!e || e.presence == null) abort(`${name} presence UNKNOWN; refusing (incomplete fixture)`);
    if (e.presence === PRESENCE_UNKNOWN) {
      abort(`${name} presence UNKNOWN; refusing gate-off-initial`);
    }
    if (e.presence === PRESENCE_PRESENT || e.exists) {
      abort(
        `${name} already exists remotely; gate-off-initial is only for genuinely new endpoints. Inspect first. Existing remote env is merged when no dotenv is loaded.`,
      );
    }
  }
}

export function assertAllPresentForGateUpdate(fixture) {
  for (const name of GRIN_FUNCTIONS) {
    const e = fixture[name];
    if (!e || e.presence === PRESENCE_UNKNOWN) {
      abort(`${name} presence UNKNOWN; enable/disable requires an existing endpoint`);
    }
    if (e.presence !== PRESENCE_PRESENT) {
      abort(`${name} is not deployed; enable/disable via env update requires an existing endpoint`);
    }
    const origin = e.sourceOrigin || "unknown";
    if (!gcloudUpdateAllowed(origin)) {
      abort(
        `${name} source origin is ${origin}; gcloud functions deploy without --source would use cwd. Refusing.`,
      );
    }
  }
}

export function fixtureFromInspect(report) {
  const out = {};
  for (const name of GRIN_FUNCTIONS) {
    const e = report.grinEndpoints[name] || {};
    const presence = e.presence || PRESENCE_UNKNOWN;
    out[name] = {
      presence,
      exists: presence === PRESENCE_PRESENT,
      sourceOrigin: e.sourceOrigin || presence,
      gateOn: !!e.gateOn,
    };
  }
  return out;
}

export function requireVerifiedIdentity(report) {
  if (report.project?.httpStatus !== 200 || !report.project?.matchesExpected) {
    abort("project identity not verified; refusing");
  }
  if (report.bucket?.httpStatus !== 200 || !report.bucket?.belongsToProject) {
    abort("bucket membership not verified; refusing");
  }
}

export function requireCompleteInventory(report) {
  if (!report.functionsInventory?.complete || report.functionsInventory?.status !== 200) {
    abort(
      `Functions inventory incomplete or unsuccessful (status=${report.functionsInventory?.status} complete=${report.functionsInventory?.complete} reason=${report.functionsInventory?.reason}); UNKNOWN, not absent`,
    );
  }
}

export function requireCompleteAbsentInventory(report) {
  requireCompleteInventory(report);
  if (report.functionsInventory?.allGrinAbsent !== true) {
    abort("Functions inventory is not a complete genuine absence");
  }
}

async function resolveEndpointFixture(fetchImpl) {
  const mode = allowLive();
  if (mode === "1") {
    assertLiveOverridesRejected();
    const report = await inspectLive({ fetchImpl });
    requireVerifiedIdentity(report);
    requireCompleteInventory(report);
    return fixtureFromInspect(report);
  }
  if (envSet("GRIN_OPS_HTTP_STUB") || fetchImpl) {
    const stub = fetchImpl || (await loadHttpStubFetch());
    const report = await inspectLive({ fetchImpl: stub });
    requireVerifiedIdentity(report);
    requireCompleteInventory(report);
    return fixtureFromInspect(report);
  }
  const raw = env("GRIN_OPS_ENDPOINT_FIXTURE");
  if (!raw) abort("stub mode requires a complete GRIN_OPS_ENDPOINT_FIXTURE or GRIN_OPS_HTTP_STUB");
  return loadEndpointFixture(raw);
}

function requireStubExecutor(envName) {
  const p = process.env[envName];
  if (!p) {
    abort(`stub mode requires ${envName} as an explicit harmless executor; no PATH fallback`);
  }
  if (p === "firebase" || p === "gcloud" || !isAbsolute(p) || !existsSync(p)) {
    abort(`stub mode ${envName} must be an absolute path to an injected executor`);
  }
  return p;
}

function firebaseBin() {
  if (allowLive() === "1") return "firebase";
  return requireStubExecutor("FIREBASE_BIN");
}

function gcloudBin() {
  if (allowLive() === "1") return "gcloud";
  return requireStubExecutor("GCLOUD_BIN");
}

function requireStubOrLive() {
  const v = allowLive();
  if (v === "stub" || v === "1") return v;
  abort("mutating operation blocked: GRIN_OPS_ALLOW_LIVE is unset (not authorized by this packet alone)");
}

export function assertReviewedFirebaseCli(bin = "firebase") {
  const r = spawnSync(bin, ["--version"], { encoding: "utf8" });
  const ver = (r.stdout || "").trim().split(/\s+/).pop();
  if (r.status !== 0 || ver !== REVIEWED_FIREBASE_CLI) {
    abort(`firebase CLI version is ${ver || "unknown"}, reviewed pin is ${REVIEWED_FIREBASE_CLI}`);
  }
}

function installCleanup(sessionDir) {
  let cleaned = false;
  const run = () => {
    if (cleaned) return;
    cleaned = true;
    cleanupSessionDir(sessionDir);
  };
  process.on("exit", run);
  process.on("SIGINT", () => {
    run();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    run();
    process.exit(143);
  });
  return run;
}

export function precheckMutating(cwd) {
  assertRepoRoot(cwd);
  assertPinnedSource(cwd);
  assertCleanDeploymentInputs(cwd);
  assertNoCliDotenv(join(cwd, "functions"));
}

export function runGateOffInitial(cwd, fixture) {
  precheckMutating(cwd);
  assertAllAbsent(fixture);
  const mode = requireStubOrLive();
  if (mode === "1") {
    assertLiveOverridesRejected();
    assertReviewedFirebaseCli("firebase");
  }
  const sessionDir = createSessionDir();
  const cleanup = installCleanup(sessionDir);
  if (mode === "stub" && env("GRIN_OPS_TEST_HANG") === "1") {
    writeFileSync(join(sessionDir, "hang"), "1", { mode: 0o600 });
    const handle = setInterval(() => {}, 1 << 30);
    process.on("SIGTERM", () => {
      clearInterval(handle);
    });
    return { sessionDir, hanging: true };
  }
  const args = buildFirebaseSevenOnlyArgs();
  if (firebaseOnlyIsBroad(args)) abort("internal error: firebase --only list is broad");
  const result = runTool(firebaseBin(), args, { cwd, sessionDir });
  cleanup();
  if (result.status !== 0) {
    const err = new OpsAbort(`firebase deploy failed with status ${result.status}`, result.status);
    throw err;
  }
  if (mode === "1") {
    process.stderr.write("gate-off-initial: live firebase deploy completed\n");
  }
  process.stdout.write("gate-off-initial: PASS (seven-function firebase deploy, no dotenv)\n");
  return { status: 0, sessionDir };
}

export function runGcloudGate(cwd, fixture, gateValue, label) {
  precheckMutating(cwd);
  assertAllPresentForGateUpdate(fixture);
  const mode = requireStubOrLive();
  if (mode === "1") assertLiveOverridesRejected();
  const sessionDir = createSessionDir();
  const cleanup = installCleanup(sessionDir);
  if (mode === "stub" && env("GRIN_OPS_TEST_HANG") === "1") {
    writeFileSync(join(sessionDir, "hang"), "1", { mode: 0o600 });
    return { sessionDir, hanging: true };
  }
  let lastStatus = 0;
  try {
    for (const name of GRIN_FUNCTIONS) {
      const args = buildGcloudGateArgs(name, gateValue);
      if (gcloudArgsUnsafe(args)) abort("internal error: gcloud args would replace source or env set");
      const result = runTool(gcloudBin(), args, { cwd, sessionDir });
      lastStatus = result.status;
      if (result.status !== 0) {
        throw new OpsAbort(`gcloud functions deploy ${name} failed with status ${result.status}`, result.status);
      }
    }
  } finally {
    cleanup();
  }
  process.stdout.write(`${label}: PASS (seven gcloud --update-env-vars/--remove-env-vars, no --source)\n`);
  return { status: lastStatus, sessionDir };
}

function redactRulesetName(name) {
  return name || "";
}

export async function firebaseAccessToken() {
  const auth = require(join(firebaseToolsRoot(), "lib", "auth.js"));
  const apiv2 = require(join(firebaseToolsRoot(), "lib", "apiv2.js"));
  const account = auth.getGlobalDefaultAccount();
  if (!account) abort("firebase CLI is not logged in");
  auth.setActiveAccount({}, account);
  const token = await apiv2.getAccessToken();
  if (!token) abort("unable to obtain Firebase CLI access token");
  return token;
}

async function defaultGcpFetch(token, url, { method = "GET", body = null } = {}) {
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  let parseOk = true;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
      parseOk = false;
    }
  }
  return { status: res.status, json, bytes: Buffer.byteLength(text), parseOk };
}

export async function loadHttpStubFetch() {
  const spec = env("GRIN_OPS_HTTP_STUB");
  if (!spec) return null;
  if (allowLive() === "1") abort("live mode rejects GRIN_OPS_HTTP_STUB");
  const href = spec.startsWith("file:") ? spec : pathToFileURL(resolve(spec)).href;
  const mod = await import(href);
  if (typeof mod.gcpFetch !== "function") abort("GRIN_OPS_HTTP_STUB must export gcpFetch");
  return mod.gcpFetch;
}

function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function envSummaryFromServiceConfig(serviceConfig) {
  const envMap = serviceConfig?.environmentVariables || {};
  const secrets = serviceConfig?.secretEnvironmentVariables || [];
  return {
    ...summarizeEndpointEnv(envMap),
    secretBindingCount: secrets.length,
    secretKeys: secrets.map((s) => s.key).filter(Boolean).sort(),
    serviceAccount: serviceConfig?.serviceAccountEmail || "",
  };
}

function sourceFromV2Function(fn) {
  const storage = fn?.buildConfig?.source?.storageSource;
  const repo = fn?.buildConfig?.source?.repoSource;
  if (storage?.bucket) {
    return { origin: "gcs", ref: `gs://${storage.bucket}` };
  }
  if (repo?.repoName || repo?.remoteUri) {
    return { origin: "repo", ref: "https" };
  }
  return { origin: "unknown", ref: "" };
}

export async function listFunctionsPaginated(gcpCall) {
  const items = [];
  let pageToken = "";
  let pages = 0;
  const maxPages = 50;
  do {
    const qs = new URLSearchParams({ pageSize: "100" });
    if (pageToken) qs.set("pageToken", pageToken);
    const url = `https://cloudfunctions.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/functions?${qs}`;
    const res = await gcpCall(url);
    if (res.status !== 200 || res.parseOk === false) {
      return {
        ok: false,
        complete: false,
        status: res.status,
        reason: res.parseOk === false ? "malformed" : "http",
        items,
        pages,
      };
    }
    if (!res.json || typeof res.json !== "object") {
      return { ok: false, complete: false, status: res.status, reason: "shape", items, pages };
    }
    const funcs = res.json.functions;
    if (funcs != null && !Array.isArray(funcs)) {
      return { ok: false, complete: false, status: res.status, reason: "shape", items, pages };
    }
    items.push(...(funcs || []));
    pageToken = res.json.nextPageToken || "";
    pages += 1;
    if (pages > maxPages) {
      return { ok: false, complete: false, status: res.status, reason: "pagination_limit", items, pages };
    }
  } while (pageToken);
  return { ok: true, complete: true, status: 200, reason: "ok", items, pages };
}

function mapListedFunction(fn) {
  const id = (fn.name || "").split("/").pop();
  const src = sourceFromV2Function(fn);
  const envPart = envSummaryFromServiceConfig(fn.serviceConfig);
  return {
    id,
    presence: PRESENCE_PRESENT,
    exists: true,
    platform: "gen2",
    region: REGION,
    runtime: fn.buildConfig?.runtime || fn.serviceConfig?.revision || "",
    sourceOrigin: src.origin,
    sourceRefKind: src.origin,
    ...envPart,
  };
}

export function writeRollbackIfSuccessful(filePath, content, ok) {
  if (!ok || typeof content !== "string" || content.length === 0) {
    return { written: false };
  }
  writeFileSync(filePath, content, { mode: 0o644 });
  return { written: true };
}

export async function inspectLive({ exportDir, fetchImpl } = {}) {
  let token = "";
  let cliUser = "";
  let gcpCall = fetchImpl;
  if (!gcpCall) {
    token = await firebaseAccessToken();
    const emailMod = require(join(firebaseToolsRoot(), "lib", "auth.js"));
    const account = emailMod.getGlobalDefaultAccount();
    cliUser = account?.user?.email || "";
    gcpCall = (url, opts) => defaultGcpFetch(token, url, opts);
  }

  const project = await gcpCall(
    `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT_ID}`,
  );
  const projectOk =
    project.status === 200 &&
    project.parseOk !== false &&
    project.json &&
    project.json.projectId === PROJECT_ID &&
    String(project.json.projectNumber) === PROJECT_NUMBER;
  const projectNumber = projectOk ? String(project.json.projectNumber) : "";
  const projectId = projectOk ? project.json.projectId : "";

  const bucket = await gcpCall(`https://storage.googleapis.com/storage/v1/b/${BUCKET}`);
  const bucketOk =
    bucket.status === 200 &&
    bucket.parseOk !== false &&
    bucket.json &&
    (bucket.json.name === BUCKET || bucket.json.id === BUCKET) &&
    String(bucket.json.projectNumber) === PROJECT_NUMBER;
  const bucketProjectNumber = bucketOk ? String(bucket.json.projectNumber) : "";

  const inventory = await listFunctionsPaginated(gcpCall);
  const listed = inventory.ok ? inventory.items.map(mapListedFunction) : [];
  const byId = Object.fromEntries(listed.map((e) => [e.id, e]));
  const grin = {};
  for (const name of GRIN_FUNCTIONS) {
    if (!inventory.complete || !inventory.ok) {
      grin[name] = { presence: PRESENCE_UNKNOWN, exists: false, sourceOrigin: "unknown" };
    } else if (byId[name]) {
      grin[name] = { ...byId[name], presence: PRESENCE_PRESENT };
    } else {
      grin[name] = { presence: PRESENCE_ABSENT, exists: false, sourceOrigin: "absent" };
    }
  }
  const allGrinAbsent =
    inventory.complete &&
    inventory.ok &&
    GRIN_FUNCTIONS.every((n) => grin[n].presence === PRESENCE_ABSENT);

  const unrelated = listed.filter((e) => !GRIN_FUNCTIONS.includes(e.id)).map((e) => ({
    id: e.id,
    sourceOrigin: e.sourceOrigin,
    serviceAccount: e.serviceAccount,
    gateOn: e.gateOn,
    otherUserKeyCount: e.otherUserKeyCount,
    secretBindingCount: e.secretBindingCount,
  }));

  const probeSa =
    unrelated.find((e) => e.id === "mintClientAuthToken")?.serviceAccount ||
    unrelated.find((e) => e.serviceAccount)?.serviceAccount ||
    "";

  const iam = await gcpCall(
    `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT_ID}:getIamPolicy`,
    { method: "POST", body: { options: { requestedPolicyVersion: 3 } } },
  );
  const saRoles = [];
  if (iam.status === 200 && iam.parseOk !== false && Array.isArray(iam.json?.bindings)) {
    for (const b of iam.json.bindings) {
      const members = b.members || [];
      if (probeSa && members.includes(`serviceAccount:${probeSa}`)) saRoles.push(b.role);
    }
    saRoles.sort();
  }

  const dbIam = await gcpCall(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default):getIamPolicy`,
    { method: "POST", body: {} },
  );
  const dbIamState =
    dbIam.status === 501
      ? "unsupported"
      : dbIam.status === 200
        ? "ok"
        : "unknown";
  const dbRoles = [];
  if (dbIamState === "ok" && Array.isArray(dbIam.json?.bindings)) {
    for (const b of dbIam.json.bindings) {
      const members = b.members || [];
      if (probeSa && members.includes(`serviceAccount:${probeSa}`)) dbRoles.push(b.role);
    }
    dbRoles.sort();
  }

  const bucketIam = await gcpCall(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/iam`);
  const bucketRoles = [];
  if (bucketIam.status === 200 && Array.isArray(bucketIam.json?.bindings)) {
    for (const b of bucketIam.json.bindings) {
      const members = b.members || [];
      if (probeSa && members.includes(`serviceAccount:${probeSa}`)) bucketRoles.push(b.role);
    }
    bucketRoles.sort();
  }

  const releases = await gcpCall(
    `https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}/releases`,
  );

  async function exportRuleset(release, label) {
    if (!release?.rulesetName) {
      return { ok: false, label, error: "release missing", httpStatus: 0, content: "" };
    }
    const rs = await gcpCall(`https://firebaserules.googleapis.com/v1/${release.rulesetName}`);
    const files = rs.json?.source?.files;
    const file = Array.isArray(files) ? files[0] : null;
    const content = typeof file?.content === "string" ? file.content : "";
    const ok = rs.status === 200 && rs.parseOk !== false && content.length > 0;
    const buf = Buffer.from(content, "utf8");
    return {
      ok,
      httpStatus: rs.status,
      label,
      releaseName: release.name,
      rulesetName: redactRulesetName(release.rulesetName),
      createTime: release.createTime || rs.json?.createTime || "",
      updateTime: release.updateTime || "",
      sourceFileName: file?.name || "",
      bytes: ok ? buf.length : 0,
      sha256: ok ? sha256Hex(buf) : "",
      content: ok ? content : "",
    };
  }

  const releaseList =
    releases.status === 200 && Array.isArray(releases.json?.releases) ? releases.json.releases : [];
  const fsRelease = releaseList.find((r) => r.name?.endsWith("/releases/cloud.firestore"));
  const stRelease = releaseList.find((r) =>
    String(r.name || "").includes(`/releases/firebase.storage/${BUCKET}`),
  );
  const firestoreRules = await exportRuleset(fsRelease, "firestore");
  const storageRules = await exportRuleset(stRelease, "storage");

  const BASELINE_FS = "b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c";
  const BASELINE_ST = "1a912051ba923a0e4ae29fd36b1741bcf0f5879cd53e6d4bd386c9d5a3b717d5";

  const report = {
    exported_at: new Date().toISOString(),
    method:
      "read-only Google APIs via Firebase CLI access token (never printed); no deploy, no env write",
    this_assignment_deployed: false,
    cli_user: cliUser,
    project: {
      httpStatus: project.status,
      projectId,
      projectNumber,
      matchesExpected: projectOk,
    },
    bucket: {
      httpStatus: bucket.status,
      name: bucketOk ? BUCKET : "",
      projectNumber: bucketProjectNumber,
      belongsToProject: bucketOk,
    },
    functionsInventory: {
      status: inventory.status,
      complete: inventory.complete,
      ok: inventory.ok,
      reason: inventory.reason,
      pages: inventory.pages,
      listedCount: listed.length,
      allGrinAbsent,
    },
    runtime: {
      probeFunction: "mintClientAuthToken",
      serviceAccount: probeSa,
      projectIamHttp: iam.status,
      firestoreDbIamHttp: dbIam.status,
      firestoreDbIamState: dbIamState,
      bucketIamHttp: bucketIam.status,
      projectRoles: saRoles,
      firestoreDatabaseRoles: dbRoles,
      bucketRoles,
      hasStorageObjectsDelete: saRoles.concat(bucketRoles).some((r) =>
        /storage\.objectAdmin|storage\.admin|storage\.objects\.delete|^roles\/editor$|^roles\/owner$/i.test(r),
      ),
      editorResidualDelete:
        saRoles.includes("roles/editor") || saRoles.includes("roles/owner"),
    },
    grinEndpoints: grin,
    unrelatedEndpointCount: unrelated.length,
    unrelatedIds: unrelated.map((e) => e.id).sort(),
    allGrinAbsent,
    cloud_firestore: {
      httpStatus: firestoreRules.httpStatus,
      ok: firestoreRules.ok,
      release: firestoreRules.releaseName,
      rulesetName: firestoreRules.rulesetName,
      createTime: firestoreRules.createTime,
      updateTime: firestoreRules.updateTime,
      sourceFileName: firestoreRules.sourceFileName,
      bytes: firestoreRules.bytes,
      sha256: firestoreRules.sha256,
      matchesApprovedBaseline: firestoreRules.ok && firestoreRules.sha256 === BASELINE_FS,
    },
    firebase_storage: {
      httpStatus: storageRules.httpStatus,
      ok: storageRules.ok,
      release: storageRules.releaseName,
      rulesetName: storageRules.rulesetName,
      createTime: storageRules.createTime,
      updateTime: storageRules.updateTime,
      sourceFileName: storageRules.sourceFileName,
      bytes: storageRules.bytes,
      sha256: storageRules.sha256,
      matchesApprovedBaseline: storageRules.ok && storageRules.sha256 === BASELINE_ST,
    },
  };

  if (exportDir) {
    const dir = resolve(exportDir);
    const fsWrite = writeRollbackIfSuccessful(
      join(dir, "firestore.rules"),
      firestoreRules.content,
      firestoreRules.ok,
    );
    const stWrite = writeRollbackIfSuccessful(
      join(dir, "storage.rules"),
      storageRules.content,
      storageRules.ok,
    );
    report.rulesExport = { firestoreWritten: fsWrite.written, storageWritten: stWrite.written };
    const meta = { ...report };
    delete meta.grinEndpoints;
    meta.grin = {
      allAbsent: report.allGrinAbsent,
      inventory: report.functionsInventory,
      endpoints: Object.fromEntries(
        GRIN_FUNCTIONS.map((n) => [
          n,
          {
            presence: grin[n].presence,
            gateOn: grin[n].gateOn || false,
            sourceOrigin: grin[n].sourceOrigin || grin[n].presence,
            otherUserKeyCount: grin[n].otherUserKeyCount || 0,
            secretBindingCount: grin[n].secretBindingCount || 0,
          },
        ]),
      ),
    };
    writeFileSync(join(dir, "META.json"), JSON.stringify(meta, null, 2) + "\n", { mode: 0o644 });
  }

  return report;
}

function printInspect(report) {
  const lines = [];
  lines.push(`cli_user=${report.cli_user}`);
  lines.push(
    `project ${report.project.projectId} number=${report.project.projectNumber} match=${report.project.matchesExpected} http=${report.project.httpStatus}`,
  );
  lines.push(
    `bucket ${report.bucket.name} projectNumber=${report.bucket.projectNumber} belongs=${report.bucket.belongsToProject} http=${report.bucket.httpStatus}`,
  );
  lines.push(
    `functions_inventory status=${report.functionsInventory.status} complete=${report.functionsInventory.complete} reason=${report.functionsInventory.reason} pages=${report.functionsInventory.pages}`,
  );
  lines.push(
    `runtime_sa=${report.runtime.serviceAccount || "(none)"} project_iam_http=${report.runtime.projectIamHttp} db_iam_http=${report.runtime.firestoreDbIamHttp} db_iam_state=${report.runtime.firestoreDbIamState} bucket_iam_http=${report.runtime.bucketIamHttp} project_roles=${report.runtime.projectRoles.join(",") || "(none)"} db_roles=${(report.runtime.firestoreDatabaseRoles || []).join(",") || "(none)"} bucket_roles=${report.runtime.bucketRoles.join(",") || "(none)"} storage_delete=${report.runtime.hasStorageObjectsDelete} editor_residual_delete=${report.runtime.editorResidualDelete}`,
  );
  lines.push(`grin_all_absent=${report.allGrinAbsent}`);
  for (const name of GRIN_FUNCTIONS) {
    const e = report.grinEndpoints[name];
    const presence = (e.presence || PRESENCE_UNKNOWN).toUpperCase();
    if (e.presence === PRESENCE_PRESENT) {
      lines.push(
        `${name} ${presence} origin=${e.sourceOrigin} gate=${e.gateOn ? "on" : "off"} other_user_keys=${e.otherUserKeyCount} secrets=${e.secretBindingCount}`,
      );
    } else {
      lines.push(`${name} ${presence}`);
    }
  }
  lines.push(`unrelated_functions=${report.unrelatedEndpointCount}`);
  lines.push(
    `firestore ok=${report.cloud_firestore.ok} sha256=${report.cloud_firestore.sha256} baseline_match=${report.cloud_firestore.matchesApprovedBaseline} ruleset=${report.cloud_firestore.rulesetName}`,
  );
  lines.push(
    `storage ok=${report.firebase_storage.ok} sha256=${report.firebase_storage.sha256} baseline_match=${report.firebase_storage.matchesApprovedBaseline} ruleset=${report.firebase_storage.rulesetName}`,
  );
  process.stdout.write(lines.join("\n") + "\n");
}

function printUsage() {
  process.stdout.write(`Usage: node grin-functions-op.mjs <inspect|check-preflight|gate-off-initial|enable|disable>
Mutating commands require GRIN_OPS_ALLOW_LIVE=stub|1 and never emit secrets.
`);
}

async function main(argv) {
  const cmd = argv[2];
  const cwd = env("GRIN_OPS_REPO", process.cwd());
  try {
    if (allowLive() === "1") assertLiveOverridesRejected();
    if (cmd === "inspect") {
      const exportDir = env("GRIN_OPS_EXPORT_DIR");
      if (exportDir && !existsSync(exportDir)) abort(`export dir missing: ${exportDir}`);
      const fetchImpl = await loadHttpStubFetch();
      const report = await inspectLive({
        exportDir: exportDir || undefined,
        fetchImpl: fetchImpl || undefined,
      });
      printInspect(report);
      requireVerifiedIdentity(report);
      requireCompleteInventory(report);
      return 0;
    }
    if (cmd === "check-preflight") {
      precheckMutating(cwd);
      process.stdout.write("check-preflight: PASS\n");
      return 0;
    }
    const fixture = await resolveEndpointFixture();
    if (cmd === "gate-off-initial") {
      const result = runGateOffInitial(cwd, fixture);
      if (result?.hanging) await new Promise(() => {});
      return 0;
    }
    if (cmd === "enable") {
      if (env("GRIN_OPS_METHOD", "gcloud-update-env-vars") === "firebase-dotenv") {
        abort("Firebase dotenv enablement is blocked: loading dotenv replaces prior user env on selected endpoints");
      }
      const result = runGcloudGate(cwd, fixture, "true", "enable");
      if (result?.hanging) await new Promise(() => {});
      return 0;
    }
    if (cmd === "disable") {
      if (env("GRIN_OPS_METHOD", "gcloud-update-env-vars") === "firebase-dotenv") {
        abort("Firebase dotenv disablement is blocked: loading dotenv replaces prior user env on selected endpoints");
      }
      const result = runGcloudGate(cwd, fixture, "false", "disable");
      if (result?.hanging) await new Promise(() => {});
      return 0;
    }
    printUsage();
    return 2;
  } catch (err) {
    if (err instanceof OpsAbort) {
      process.stderr.write(`ABORT: ${err.message}\n`);
      return typeof err.code === "number" ? err.code : 2;
    }
    process.stderr.write(`ABORT: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main(process.argv).then((code) => {
    process.exit(code);
  });
}

export { main, relative };
