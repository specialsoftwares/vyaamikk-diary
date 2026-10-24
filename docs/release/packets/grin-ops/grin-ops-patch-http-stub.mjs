/**
 * Injected Functions v2 PATCH stub for enable/disable CLI tests. Not live.
 */
import { assertPatchRequestSafe, GRIN_FUNCTIONS, PROBE_FUNCTION } from "./grin-functions-patch-env.mjs";

const PROJECT = "vyaamikk-diary";
const REGION = "asia-south1";
const store = new Map();

function fnResource(name, env) {
  return {
    name: `projects/${PROJECT}/locations/${REGION}/functions/${name}`,
    state: "ACTIVE",
    buildConfig: {
      runtime: "nodejs20",
      entryPoint: name,
      build: "projects/982505811909/locations/asia-south1/builds/stub-build",
      dockerRepository: "projects/vyaamikk-diary/locations/asia-south1/repositories/gcf-artifacts",
      source: {
        storageSource: {
          bucket: "gcf-v2-sources-stub",
          object: `${name}/function-source.zip`,
          generation: "1",
        },
      },
    },
    serviceConfig: {
      environmentVariables: { ...env },
      secretEnvironmentVariables: [],
      serviceAccountEmail: "982505811909-compute@developer.gserviceaccount.com",
      ingressSettings: "ALLOW_ALL",
      minInstanceCount: 0,
      maxInstanceCount: 1,
      revision: "rev-1",
    },
    labels: { "firebase-functions-codebase": "default" },
  };
}

function ok(json) {
  return { status: 200, json, parseOk: true };
}

export async function gcpFetch(url, opts = {}) {
  const method = opts.method || "GET";
  if (url.includes("/operations/")) {
    return ok({ name: url.replace("https://cloudfunctions.googleapis.com/v2/", ""), done: true });
  }
  const match = url.match(/\/functions\/([^/?]+)/);
  const name = match ? decodeURIComponent(match[1]) : "";
  if (!GRIN_FUNCTIONS.includes(name) && name !== PROBE_FUNCTION) {
    return { status: 404, json: { error: { status: "NOT_FOUND" } }, parseOk: true };
  }
  if (!store.has(name)) {
    const extra = name === "grinRegisterGoodsReceipt" ? {} : { EXTRA: "keep" };
    store.set(name, { FOO: "1", ...extra });
  }
  if (method === "PATCH") {
    assertPatchRequestSafe({ url, method: "PATCH", body: opts.body });
    store.set(name, { ...opts.body.serviceConfig.environmentVariables });
    return ok({
      name: `projects/${PROJECT}/locations/${REGION}/operations/op-${name}`,
      done: false,
    });
  }
  return ok(fnResource(name, store.get(name)));
}
