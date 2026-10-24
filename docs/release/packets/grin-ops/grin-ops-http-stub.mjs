/**
 * Injected Google API stub for ops-guard tests. Never used in live mode.
 * CLI tests: GRIN_OPS_HTTP_STUB_CFG JSON. Direct tests: makeGcpFetch(cfg).
 */
const PROJECT_ID = "vyaamikk-diary";
const PROJECT_NUMBER = "982505811909";
const BUCKET = "vyaamikk-diary.firebasestorage.app";
const SA = "982505811909-compute@developer.gserviceaccount.com";

function readEnvCfg() {
  try {
    return JSON.parse(process.env.GRIN_OPS_HTTP_STUB_CFG || "{}");
  } catch {
    return { invalidCfg: true };
  }
}

function ok(json) {
  return { status: 200, json, parseOk: true };
}

export function respond(url, c) {
  if (c.invalidCfg) return { status: 500, json: null, parseOk: false };

  if (url.includes("cloudresourcemanager.googleapis.com") && url.includes(":getIamPolicy")) {
    if (c.iamStatus && c.iamStatus !== 200) {
      return { status: c.iamStatus, json: c.iamJson || {}, parseOk: true };
    }
    return ok({
      bindings: [{ role: "roles/editor", members: [`serviceAccount:${SA}`] }],
    });
  }

  if (url.includes("cloudresourcemanager.googleapis.com") && url.includes(`/projects/${PROJECT_ID}`)) {
    if (c.project) return { parseOk: true, ...c.project };
    return ok({ projectId: PROJECT_ID, projectNumber: PROJECT_NUMBER });
  }

  if (url.includes("storage.googleapis.com") && url.includes(`/b/${BUCKET}/iam`)) {
    return ok({ bindings: [] });
  }

  if (url.includes("storage.googleapis.com") && url.includes(`/b/${BUCKET}`)) {
    if (c.bucket) return { parseOk: true, ...c.bucket };
    return ok({ name: BUCKET, id: BUCKET, projectNumber: PROJECT_NUMBER });
  }

  if (url.includes("cloudfunctions.googleapis.com")) {
    const token = (() => {
      try {
        return new URL(url).searchParams.get("pageToken") || "";
      } catch {
        return "";
      }
    })();
    if (Array.isArray(c.functionPages)) {
      const page = token
        ? c.functionPages.find((p) => p.pageToken === token) || c.functionPages[1]
        : c.functionPages[0];
      const response = page?.response || { status: 500, json: {}, parseOk: true };
      return { parseOk: response.parseOk !== false, ...response };
    }
    if (c.functions) return { parseOk: c.functions.parseOk !== false, ...c.functions };
    return ok({ functions: [] });
  }

  if (url.includes("firestore.googleapis.com") && url.includes(":getIamPolicy")) {
    return {
      status: c.dbIamStatus || 501,
      json: { error: { status: "UNIMPLEMENTED" } },
      parseOk: true,
    };
  }

  if (url.includes("firebaserules.googleapis.com") && url.includes("/releases")) {
    if (c.releases) return { parseOk: true, ...c.releases };
    return ok({ releases: [] });
  }

  if (url.includes("firebaserules.googleapis.com") && url.includes("rulesets")) {
    if (c.ruleset) return { parseOk: true, ...c.ruleset };
    return { status: 500, json: {}, parseOk: true };
  }

  return { status: 404, json: { error: "unhandled stub url" }, parseOk: true };
}

export function makeGcpFetch(cfgObj) {
  return async function gcpFetch(url) {
    return respond(url, cfgObj);
  };
}

export async function gcpFetch(url) {
  return respond(url, readEnvCfg());
}
