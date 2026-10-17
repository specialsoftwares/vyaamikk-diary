/**
 * Cloud Functions v2 environment PATCH for GRIN gate enable/disable.
 * Replaces omitted-`--source` gcloud deploy, which FAILED on this host
 * (gcloud 588.0.0 + firebase-created gen2): omitted `--source` used cwd and
 * started a rebuild. Do not retry that argv against GRIN. Do not edit Cloud Run env.
 *
 * Never prints credentials or environment values.
 */
import { createHash } from "node:crypto";

export const PATCH_PROJECT_ID = "vyaamikk-diary";
export const PATCH_REGION = "asia-south1";
export const GATE_KEY = "GRIN_GOODS_EVIDENCE_FUNCTIONS";
export const ENV_UPDATE_MASK = "serviceConfig.environmentVariables";
export const FAILED_E_PROCEDURE = "gcloud-functions-deploy-omitted-source";
export const PROBE_FUNCTION = "grinPilotPreservationProbe";
export const GRIN_FUNCTIONS = Object.freeze([
  "grinRegisterGoodsReceipt",
  "grinReconcileCommand",
  "grinMutateGoodsReceipt",
  "grinReadGoodsReceipt",
  "grinReserveEvidence",
  "grinBeginEvidenceUpload",
  "grinUploadEvidence",
]);
export const AUTHORIZED_GATE_FUNCTIONS = Object.freeze([...GRIN_FUNCTIONS, PROBE_FUNCTION]);
export const DEFAULT_PATCH_TIMEOUT_MS = 180000;
export const DEFAULT_PATCH_POLL_MS = 1500;

export class PatchAbort extends Error {
  constructor(message, code = 2) {
    super(message);
    this.name = "PatchAbort";
    this.code = code;
  }
}

export function patchAbort(message, code = 2) {
  throw new PatchAbort(message, code);
}

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function assertAuthorizedTarget({ projectId, region, functionName }) {
  if (projectId !== PATCH_PROJECT_ID) patchAbort("rejected wrong project");
  if (region !== PATCH_REGION) patchAbort("rejected wrong region");
  if (!AUTHORIZED_GATE_FUNCTIONS.includes(functionName)) {
    patchAbort("rejected unauthorized function name");
  }
}

export function applyGateToEnvMap(existingEnv, gateValue) {
  if (!isPlainObject(existingEnv)) patchAbort("malformed environment map");
  if (gateValue !== "true" && gateValue !== "false") {
    patchAbort("gate value must be exact true or false");
  }
  const next = { ...existingEnv };
  next[GATE_KEY] = gateValue;
  return next;
}

export function assertFullEnvPreserved(beforeEnv, patchEnv, gateValue) {
  if (!isPlainObject(beforeEnv) || !isPlainObject(patchEnv)) {
    patchAbort("malformed environment map");
  }
  const expected = applyGateToEnvMap(beforeEnv, gateValue);
  const beforeKeys = Object.keys(beforeEnv);
  const patchKeys = Object.keys(patchEnv);
  if (patchKeys.length === 1 && beforeKeys.length > 1) {
    patchAbort("one-key environment map does not preserve unrelated keys");
  }
  for (const key of beforeKeys) {
    if (key === GATE_KEY) continue;
    if (!Object.prototype.hasOwnProperty.call(patchEnv, key)) {
      patchAbort("unrelated environment key missing from patch map");
    }
    if (patchEnv[key] !== beforeEnv[key]) {
      patchAbort("unrelated environment entry changed");
    }
  }
  for (const key of patchKeys) {
    if (key !== GATE_KEY && !Object.prototype.hasOwnProperty.call(beforeEnv, key)) {
      patchAbort("unexpected environment key in patch map");
    }
  }
  if (patchEnv[GATE_KEY] !== gateValue) patchAbort("gate key not set to requested value");
  if (Object.keys(expected).sort().join("\0") !== patchKeys.sort().join("\0")) {
    patchAbort("environment key set drifted from expected");
  }
}

export function envMapFingerprint(envMap) {
  if (!isPlainObject(envMap)) patchAbort("malformed environment map");
  const keys = Object.keys(envMap).sort();
  const canonical = JSON.stringify(keys.map((k) => [k, envMap[k]]));
  return createHash("sha256").update(canonical).digest("hex");
}

export function functionIdentityFingerprint(fn) {
  if (!isPlainObject(fn)) patchAbort("malformed function resource");
  const bc = isPlainObject(fn.buildConfig) ? fn.buildConfig : {};
  const sc = isPlainObject(fn.serviceConfig) ? fn.serviceConfig : {};
  const src = isPlainObject(bc.source) && isPlainObject(bc.source.storageSource) ? bc.source.storageSource : {};
  const proven =
    isPlainObject(bc.sourceProvenance) && isPlainObject(bc.sourceProvenance.resolvedStorageSource)
      ? bc.sourceProvenance.resolvedStorageSource
      : {};
  const secrets = Array.isArray(sc.secretEnvironmentVariables) ? sc.secretEnvironmentVariables : [];
  const labels = isPlainObject(fn.labels) ? fn.labels : {};
  return {
    sourceBucket: String(src.bucket || proven.bucket || ""),
    sourceObject: String(src.object || proven.object || ""),
    sourceGeneration: String(src.generation || proven.generation || ""),
    runtime: String(bc.runtime || ""),
    entryPoint: String(bc.entryPoint || ""),
    build: String(bc.build || ""),
    dockerRepository: String(bc.dockerRepository || ""),
    image: String(bc.sourceProvenance?.resolvedImageUri || ""),
    serviceUri: String(sc.uri || ""),
    serviceAccount: String(sc.serviceAccountEmail || ""),
    ingress: String(sc.ingressSettings || ""),
    minInstanceCount: sc.minInstanceCount ?? 0,
    maxInstanceCount: sc.maxInstanceCount ?? null,
    concurrency: sc.maxInstanceRequestConcurrency ?? null,
    timeoutSeconds: sc.timeoutSeconds ?? null,
    availableMemory: String(sc.availableMemory || ""),
    secretKeys: secrets.map((s) => s?.key).filter(Boolean).sort(),
    codebase: String(labels["firebase-functions-codebase"] || ""),
  };
}

export const PLATFORM_REBUILD_ID_KEYS = Object.freeze(["sourceGeneration", "build", "image"]);

export function sourceArchiveLocator(fp) {
  return {
    bucket: fp.sourceBucket,
    object: fp.sourceObject,
    generation: fp.sourceGeneration,
  };
}

export function identityEquals(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function buildFunctionsV2EnvPatch({ projectId, region, functionName, environmentVariables }) {
  assertAuthorizedTarget({ projectId, region, functionName });
  if (!isPlainObject(environmentVariables)) patchAbort("malformed environment map");
  const body = {
    name: `projects/${projectId}/locations/${region}/functions/${functionName}`,
    serviceConfig: {
      environmentVariables,
    },
  };
  const url =
    `https://cloudfunctions.googleapis.com/v2/projects/${projectId}/locations/${region}/functions/${functionName}` +
    `?updateMask=${ENV_UPDATE_MASK}`;
  const req = { url, method: "PATCH", body };
  assertPatchRequestSafe(req);
  return req;
}

export function assertPatchRequestSafe(req) {
  if (!req || req.method !== "PATCH") patchAbort("rejected missing/wrong method");
  let parsed;
  try {
    parsed = new URL(req.url);
  } catch {
    patchAbort("rejected malformed patch url");
  }
  if (parsed.origin !== "https://cloudfunctions.googleapis.com") patchAbort("rejected unexpected host");
  if (parsed.pathname.includes("*")) patchAbort("rejected wildcard path");
  const mask = parsed.searchParams.get("updateMask");
  if (!mask) patchAbort("rejected missing updateMask");
  if (mask !== ENV_UPDATE_MASK) patchAbort("rejected wrong updateMask");
  if (mask.includes("*") || parsed.searchParams.getAll("updateMask").length !== 1) {
    patchAbort("rejected wildcard or multiple masks");
  }
  if (!isPlainObject(req.body)) patchAbort("rejected malformed patch body");
  if (Object.prototype.hasOwnProperty.call(req.body, "buildConfig")) {
    patchAbort("rejected buildConfig field");
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "source")) patchAbort("rejected source field");
  const bodyKeys = Object.keys(req.body).sort();
  if (bodyKeys.join(",") !== "name,serviceConfig") patchAbort("rejected unexpected request body keys");
  const sc = req.body.serviceConfig;
  if (!isPlainObject(sc)) patchAbort("rejected malformed serviceConfig");
  const scKeys = Object.keys(sc);
  if (scKeys.length !== 1 || scKeys[0] !== "environmentVariables") {
    patchAbort("rejected unexpected serviceConfig fields");
  }
  if (Object.prototype.hasOwnProperty.call(sc, "source")) patchAbort("rejected source field");
  if (!isPlainObject(sc.environmentVariables)) patchAbort("malformed environment map");
}

export function functionResourceUrl(functionName) {
  assertAuthorizedTarget({
    projectId: PATCH_PROJECT_ID,
    region: PATCH_REGION,
    functionName,
  });
  return `https://cloudfunctions.googleapis.com/v2/projects/${PATCH_PROJECT_ID}/locations/${PATCH_REGION}/functions/${functionName}`;
}

export function parseFunctionRead(res) {
  if (!res || res.status !== 200 || res.parseOk === false || !isPlainObject(res.json)) {
    patchAbort("failed function read");
  }
  const fn = res.json;
  if (fn.state && fn.state !== "ACTIVE" && fn.state !== "UNKNOWN") {
    if (fn.state === "FAILED" || fn.state === "DELETE_IN_PROGRESS") {
      patchAbort("unknown or failed function state");
    }
  }
  if (!isPlainObject(fn.serviceConfig)) patchAbort("malformed function resource");
  return fn;
}

export function compareIdentityAfterGate(beforeFp, afterFp) {
  const failKeys = [];
  for (const key of Object.keys(beforeFp)) {
    if (JSON.stringify(beforeFp[key]) !== JSON.stringify(afterFp[key])) failKeys.push(key);
  }
  const rebuildIds = failKeys.filter((k) => PLATFORM_REBUILD_ID_KEYS.includes(k));
  const unexpected = failKeys.filter((k) => !PLATFORM_REBUILD_ID_KEYS.includes(k));
  return {
    ok: unexpected.length === 0,
    changed: failKeys,
    rebuildIds,
    unexpected,
  };
}

function sleep(ms, sleeper) {
  return (sleeper || ((t) => new Promise((r) => setTimeout(r, t))))(ms);
}

export async function pollFunctionOperation(
  gcpCall,
  operationName,
  { timeoutMs = DEFAULT_PATCH_TIMEOUT_MS, intervalMs = DEFAULT_PATCH_POLL_MS, sleeper, now } = {},
) {
  if (typeof operationName !== "string" || !operationName.includes("/operations/")) {
    patchAbort("malformed operation name");
  }
  if (operationName.includes("*") || !operationName.startsWith("projects/")) {
    patchAbort("rejected unexpected operation name");
  }
  const url = `https://cloudfunctions.googleapis.com/v2/${operationName.replace(/^\/+/, "")}`;
  const started = (now || Date.now)();
  while ((now || Date.now)() - started < timeoutMs) {
    const res = await gcpCall(url);
    if (!res || res.status !== 200 || res.parseOk === false || !isPlainObject(res.json)) {
      patchAbort("failed operation read");
    }
    if (res.json.error) patchAbort("function operation failed");
    if (res.json.done === true) return { done: true, json: res.json };
    await sleep(intervalMs, sleeper);
  }
  patchAbort("function operation timeout");
}

export async function readFunctionV2(gcpCall, functionName) {
  const res = await gcpCall(functionResourceUrl(functionName));
  return parseFunctionRead(res);
}

export async function patchGateOnFunction(gcpCall, functionName, gateValue, opts = {}) {
  assertAuthorizedTarget({
    projectId: PATCH_PROJECT_ID,
    region: PATCH_REGION,
    functionName,
  });
  const first = await readFunctionV2(gcpCall, functionName);
  const firstFp = functionIdentityFingerprint(first);
  const firstEnv = isPlainObject(first.serviceConfig.environmentVariables)
    ? first.serviceConfig.environmentVariables
    : {};
  const firstEnvFp = envMapFingerprint(firstEnv);
  const second = await readFunctionV2(gcpCall, functionName);
  const secondFp = functionIdentityFingerprint(second);
  const secondEnv = isPlainObject(second.serviceConfig.environmentVariables)
    ? second.serviceConfig.environmentVariables
    : {};
  if (!identityEquals(firstFp, secondFp) || envMapFingerprint(secondEnv) !== firstEnvFp) {
    patchAbort("configuration drift between reads; refusing mutation");
  }
  const nextEnv = applyGateToEnvMap(secondEnv, gateValue);
  assertFullEnvPreserved(secondEnv, nextEnv, gateValue);
  const req = buildFunctionsV2EnvPatch({
    projectId: PATCH_PROJECT_ID,
    region: PATCH_REGION,
    functionName,
    environmentVariables: nextEnv,
  });
  const patchRes = await gcpCall(req.url, { method: req.method, body: req.body });
  if (!patchRes || patchRes.parseOk === false) patchAbort("failed patch response");
  if (patchRes.status !== 200 && patchRes.status !== 201) patchAbort("failed patch operation");
  const json = patchRes.json;
  if (isPlainObject(json) && json.name && String(json.name).includes("/operations/") && json.done !== true) {
    await pollFunctionOperation(gcpCall, json.name, opts);
  } else if (isPlainObject(json) && json.error) {
    patchAbort("function operation failed");
  }
  const after = await readFunctionV2(gcpCall, functionName);
  const afterFp = functionIdentityFingerprint(after);
  const afterEnv = isPlainObject(after.serviceConfig.environmentVariables)
    ? after.serviceConfig.environmentVariables
    : {};
  const ident = compareIdentityAfterGate(secondFp, afterFp);
  if (!ident.ok) {
    patchAbort(`unexpected configuration changed after env patch (${ident.unexpected.join(",")})`);
  }
  if (ident.rebuildIds.length) {
    const compare = opts.compareSourceArchives;
    if (typeof compare !== "function") {
      patchAbort("source generation/build changed; archive comparison required");
    }
    const archive = await compare(sourceArchiveLocator(secondFp), sourceArchiveLocator(afterFp));
    if (!archive || archive.equal !== true) {
      patchAbort("source archive content changed across platform rebuild");
    }
  }
  if (afterEnv[GATE_KEY] !== gateValue) patchAbort("gate readback mismatch");
  assertFullEnvPreserved(secondEnv, afterEnv, gateValue);
  return {
    name: functionName,
    gate: gateValue === "true" ? "on" : "off",
    identity_ok: true,
    env_key_count: Object.keys(afterEnv).length,
    other_user_keys: Object.keys(afterEnv).filter((k) => k !== GATE_KEY).length,
    sourceGeneration: afterFp.sourceGeneration,
    build: afterFp.build ? "present" : "absent",
    revision: after.serviceConfig?.revision ? "present" : "absent",
    platform_rebuild: ident.rebuildIds.length > 0,
  };
}

export async function hashGcsObjectGeneration(token, { bucket, object, generation }) {
  if (!bucket || !object || !generation) patchAbort("source archive locator incomplete");
  const url =
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/` +
    `${encodeURIComponent(object)}?generation=${encodeURIComponent(generation)}&alt=media`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) patchAbort("source archive download failed");
  const buf = Buffer.from(await res.arrayBuffer());
  return { sha256: createHash("sha256").update(buf).digest("hex"), bytes: buf.length };
}

export function makeTokenArchiveComparator(token) {
  return async (beforeLoc, afterLoc) => {
    if (beforeLoc.bucket !== afterLoc.bucket || beforeLoc.object !== afterLoc.object) {
      patchAbort("source archive location changed");
    }
    if (beforeLoc.generation === afterLoc.generation) {
      return { equal: true, sameGeneration: true };
    }
    const a = await hashGcsObjectGeneration(token, beforeLoc);
    const b = await hashGcsObjectGeneration(token, afterLoc);
    return {
      equal: a.sha256 === b.sha256 && a.bytes === b.bytes,
      sameGeneration: false,
      bytes: a.bytes,
    };
  };
}

export function formatGateResult(result) {
  return (
    `name=${result.name} gate=${result.gate} identity_ok=${result.identity_ok}` +
    ` env_key_count=${result.env_key_count} other_user_keys=${result.other_user_keys}` +
    ` sourceGeneration=${result.sourceGeneration} build=${result.build} revision=${result.revision}`
  );
}

export function assertLogHasNoSecrets(text, envMap = {}) {
  const hay = String(text || "");
  if (/ya29\./.test(hay) || /AIza[0-9A-Za-z_-]{20,}/.test(hay)) {
    patchAbort("output contained credential-like material");
  }
  for (const value of Object.values(envMap)) {
    if (typeof value === "string" && value.length >= 4 && hay.includes(value)) {
      patchAbort("output contained environment value");
    }
  }
}
