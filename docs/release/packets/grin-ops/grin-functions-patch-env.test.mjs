import test from "node:test";
import assert from "node:assert/strict";

import {
  AUTHORIZED_GATE_FUNCTIONS,
  ENV_UPDATE_MASK,
  FAILED_E_PROCEDURE,
  GATE_KEY,
  GRIN_FUNCTIONS,
  PROBE_FUNCTION,
  applyGateToEnvMap,
  assertFullEnvPreserved,
  assertLogHasNoSecrets,
  assertPatchRequestSafe,
  buildFunctionsV2EnvPatch,
  compareIdentityAfterGate,
  envMapFingerprint,
  formatGateResult,
  functionIdentityFingerprint,
  patchAbort,
  PatchAbort,
  patchGateOnFunction,
  pollFunctionOperation,
} from "./grin-functions-patch-env.mjs";

const SENTINEL_KEY = "GRIN_PROBE_SENTINEL";
const SENTINEL_VALUE = "preservation-ok-test-only";

function sampleFn(env, extra = {}) {
  return {
    name: "projects/vyaamikk-diary/locations/asia-south1/functions/grinPilotPreservationProbe",
    state: "ACTIVE",
    buildConfig: {
      runtime: "nodejs20",
      entryPoint: "grinPilotPreservationProbe",
      build: "projects/982505811909/locations/asia-south1/builds/build-aaa",
      dockerRepository: "projects/vyaamikk-diary/locations/asia-south1/repositories/gcf-artifacts",
      source: {
        storageSource: {
          bucket: "gcf-v2-sources-982505811909-asia-south1",
          object: "grinPilotPreservationProbe/function-source.zip",
          generation: "111",
        },
      },
      sourceProvenance: {
        resolvedStorageSource: {
          bucket: "gcf-v2-sources-982505811909-asia-south1",
          object: "grinPilotPreservationProbe/function-source.zip",
          generation: "111",
        },
      },
    },
    serviceConfig: {
      environmentVariables: env,
      secretEnvironmentVariables: [],
      serviceAccountEmail: "982505811909-compute@developer.gserviceaccount.com",
      ingressSettings: "ALLOW_ALL",
      minInstanceCount: 0,
      maxInstanceCount: 1,
      maxInstanceRequestConcurrency: 1,
      revision: extra.revision || "rev-1",
    },
    labels: { "firebase-functions-codebase": "grin-pilot-probe" },
  };
}

function ok(json) {
  return { status: 200, json, parseOk: true };
}

test("unrelated environment entries are preserved off-true-false", () => {
  const before = { [SENTINEL_KEY]: SENTINEL_VALUE, FIREBASE_CONFIG: "{}", FOO: "keep" };
  const on = applyGateToEnvMap(before, "true");
  assertFullEnvPreserved(before, on, "true");
  assert.equal(on[SENTINEL_KEY], SENTINEL_VALUE);
  assert.equal(on.FOO, "keep");
  const off = applyGateToEnvMap(on, "false");
  assertFullEnvPreserved(on, off, "false");
  assert.equal(off[SENTINEL_KEY], SENTINEL_VALUE);
  assert.equal(off[GATE_KEY], "false");
});

test("one-key map is rejected when unrelated keys exist", () => {
  const before = { [SENTINEL_KEY]: SENTINEL_VALUE, FOO: "keep" };
  assert.throws(
    () => assertFullEnvPreserved(before, { [GATE_KEY]: "true" }, "true"),
    PatchAbort,
  );
});

test("wrong target, missing/wrong mask and build/source fields are rejected", () => {
  assert.throws(
    () =>
      buildFunctionsV2EnvPatch({
        projectId: "other",
        region: "asia-south1",
        functionName: PROBE_FUNCTION,
        environmentVariables: { [GATE_KEY]: "true" },
      }),
    /wrong project/,
  );
  assert.throws(
    () =>
      buildFunctionsV2EnvPatch({
        projectId: "vyaamikk-diary",
        region: "us-central1",
        functionName: PROBE_FUNCTION,
        environmentVariables: { [GATE_KEY]: "true" },
      }),
    /wrong region/,
  );
  assert.throws(
    () =>
      buildFunctionsV2EnvPatch({
        projectId: "vyaamikk-diary",
        region: "asia-south1",
        functionName: "notAuthorized",
        environmentVariables: { [GATE_KEY]: "true" },
      }),
    /unauthorized/,
  );
  const good = buildFunctionsV2EnvPatch({
    projectId: "vyaamikk-diary",
    region: "asia-south1",
    functionName: PROBE_FUNCTION,
    environmentVariables: { [SENTINEL_KEY]: SENTINEL_VALUE, [GATE_KEY]: "true" },
  });
  assert.equal(new URL(good.url).searchParams.get("updateMask"), ENV_UPDATE_MASK);
  assert.throws(
    () =>
      assertPatchRequestSafe({
        ...good,
        url: good.url.replace(ENV_UPDATE_MASK, "*"),
      }),
    /wildcard|wrong updateMask/,
  );
  assert.throws(
    () =>
      assertPatchRequestSafe({
        ...good,
        url: good.url.replace(`updateMask=${ENV_UPDATE_MASK}`, ""),
      }),
    /missing updateMask/,
  );
  assert.throws(
    () =>
      assertPatchRequestSafe({
        ...good,
        body: { ...good.body, buildConfig: { runtime: "nodejs20" } },
      }),
    /buildConfig|unexpected request body/,
  );
  assert.throws(
    () =>
      assertPatchRequestSafe({
        ...good,
        body: { ...good.body, source: { foo: 1 } },
      }),
    /source/,
  );
});

test("failed reads, failed operations, timeout and drift abort", async () => {
  await assert.rejects(
    () =>
      patchGateOnFunction(
        async () => ({ status: 500, json: null, parseOk: false }),
        PROBE_FUNCTION,
        "true",
      ),
    /failed function read/,
  );

  let reads = 0;
  const drifted = async (url, opts = {}) => {
    if (opts.method === "PATCH") return ok({ name: "projects/vyaamikk-diary/locations/asia-south1/operations/op1", done: true });
    reads += 1;
    const env = { [SENTINEL_KEY]: SENTINEL_VALUE };
    const fn = sampleFn(env);
    if (reads === 2) fn.buildConfig.source.storageSource.generation = "222";
    return ok(fn);
  };
  await assert.rejects(() => patchGateOnFunction(drifted, PROBE_FUNCTION, "true"), /drift/);

  await assert.rejects(
    () =>
      pollFunctionOperation(
        async () => ok({ name: "projects/x/operations/op", done: false }),
        "projects/vyaamikk-diary/locations/asia-south1/operations/op",
        { timeoutMs: 20, intervalMs: 5, now: (() => { let t = 0; return () => (t += 10); })() },
      ),
    /timeout/,
  );

  await assert.rejects(
    () =>
      pollFunctionOperation(
        async () => ok({ done: true, error: { message: "boom" } }),
        "projects/vyaamikk-diary/locations/asia-south1/operations/op",
        { timeoutMs: 100, intervalMs: 1 },
      ),
    /operation failed/,
  );
});

test("patchGateOnFunction preserves unrelated keys and reports no env values", async () => {
  const env = { [SENTINEL_KEY]: SENTINEL_VALUE, FIREBASE_CONFIG: "{\"projectId\":\"vyaamikk-diary\"}" };
  let current = sampleFn(env);
  const fetchImpl = async (url, opts = {}) => {
    if (opts.method === "PATCH") {
      assertPatchRequestSafe({ url, method: "PATCH", body: opts.body });
      assertFullEnvPreserved(env, opts.body.serviceConfig.environmentVariables, "true");
      current = sampleFn(
        opts.body.serviceConfig.environmentVariables,
        { revision: "rev-2" },
      );
      return ok({
        name: "projects/vyaamikk-diary/locations/asia-south1/operations/op-enable",
        done: false,
      });
    }
    if (String(url).includes("/operations/")) {
      return ok({
        name: "projects/vyaamikk-diary/locations/asia-south1/operations/op-enable",
        done: true,
      });
    }
    return ok(current);
  };
  const result = await patchGateOnFunction(fetchImpl, PROBE_FUNCTION, "true", {
    timeoutMs: 1000,
    intervalMs: 1,
  });
  assert.equal(result.gate, "on");
  assert.equal(result.identity_ok, true);
  const line = formatGateResult(result);
  assertLogHasNoSecrets(line, env);
  assert.doesNotMatch(line, new RegExp(SENTINEL_VALUE));
  assert.equal(FAILED_E_PROCEDURE, "gcloud-functions-deploy-omitted-source");
  assert.ok(AUTHORIZED_GATE_FUNCTIONS.includes(GRIN_FUNCTIONS[0]));
});

test("source generation change after patch fails the test", async () => {
  let n = 0;
  let env = { [SENTINEL_KEY]: SENTINEL_VALUE };
  const fetchImpl = async (url, opts = {}) => {
    if (opts.method === "PATCH") {
      env = opts.body.serviceConfig.environmentVariables;
      return ok({ name: "projects/vyaamikk-diary/locations/asia-south1/operations/op", done: true });
    }
    n += 1;
    const fn = sampleFn(env);
    if (n >= 3) fn.buildConfig.source.storageSource.generation = "999";
    return ok(fn);
  };
  await assert.rejects(
    () => patchGateOnFunction(fetchImpl, PROBE_FUNCTION, "true"),
    /archive comparison required/,
  );
});

test("source generation change is allowed when archive content matches", async () => {
  let n = 0;
  let env = { [SENTINEL_KEY]: SENTINEL_VALUE };
  const fetchImpl = async (url, opts = {}) => {
    if (opts.method === "PATCH") {
      env = opts.body.serviceConfig.environmentVariables;
      return ok({ name: "projects/vyaamikk-diary/locations/asia-south1/operations/op", done: true });
    }
    n += 1;
    const fn = sampleFn(env);
    if (n >= 3) fn.buildConfig.source.storageSource.generation = "999";
    return ok(fn);
  };
  const result = await patchGateOnFunction(fetchImpl, PROBE_FUNCTION, "true", {
    compareSourceArchives: async () => ({ equal: true }),
  });
  assert.equal(result.gate, "on");
  assert.equal(result.platform_rebuild, true);
});

test("source generation change fails when archive content differs", async () => {
  let n = 0;
  let env = { [SENTINEL_KEY]: SENTINEL_VALUE };
  const fetchImpl = async (url, opts = {}) => {
    if (opts.method === "PATCH") {
      env = opts.body.serviceConfig.environmentVariables;
      return ok({ name: "projects/vyaamikk-diary/locations/asia-south1/operations/op", done: true });
    }
    n += 1;
    const fn = sampleFn(env);
    if (n >= 3) fn.buildConfig.source.storageSource.generation = "999";
    return ok(fn);
  };
  await assert.rejects(
    () => patchGateOnFunction(fetchImpl, PROBE_FUNCTION, "true", {
      compareSourceArchives: async () => ({ equal: false }),
    }),
    /source archive content changed/,
  );
});

test("fingerprints omit environment values", () => {
  const fn = sampleFn({ [SENTINEL_KEY]: SENTINEL_VALUE, [GATE_KEY]: "false" });
  const fp = functionIdentityFingerprint(fn);
  const dumped = JSON.stringify(fp);
  assert.doesNotMatch(dumped, new RegExp(SENTINEL_VALUE));
  assert.equal(envMapFingerprint(fn.serviceConfig.environmentVariables).length, 64);
  const after = functionIdentityFingerprint(sampleFn({ [SENTINEL_KEY]: SENTINEL_VALUE, [GATE_KEY]: "true" }));
  const cmp = compareIdentityAfterGate(fp, after);
  assert.equal(cmp.ok, true);
  assert.throws(() => patchAbort("x"), PatchAbort);
});
