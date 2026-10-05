import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { firebaseToolsRoot, GATE_KEY } from "../../packets/grin-ops/grin-functions-op.mjs";

const require = createRequire(import.meta.url);

test("firebase-tools 14.20.0 inferDetailsFromExisting merges without dotenv and replaces with dotenv (SOURCE, not live)", () => {
  const root = firebaseToolsRoot();
  const pkg = require(join(root, "package.json"));
  assert.equal(pkg.version, "14.20.0");
  const prepare = require(join(root, "lib/deploy/functions/prepare.js"));
  const backend = require(join(root, "lib/deploy/functions/backend.js"));
  const envMod = require(join(root, "lib/functions/env.js"));

  const endpoint = (id, environmentVariables) => ({
    id,
    region: "asia-south1",
    platform: "gcfv2",
    environmentVariables: { ...environmentVariables },
  });

  const have = backend.of(
    endpoint("grinRegisterGoodsReceipt", {
      KEEP_ME: "remote-only",
      [GATE_KEY]: "true",
      FIREBASE_CONFIG: "{\"projectId\":\"vyaamikk-diary\"}",
    }),
  );

  const wantMerged = backend.of(
    endpoint("grinRegisterGoodsReceipt", {
      FIREBASE_CONFIG: "{\"projectId\":\"vyaamikk-diary\"}",
      GCLOUD_PROJECT: "vyaamikk-diary",
    }),
  );
  prepare.inferDetailsFromExisting(wantMerged, have, false);
  const merged = wantMerged.endpoints["asia-south1"].grinRegisterGoodsReceipt.environmentVariables;
  assert.equal(merged.KEEP_ME, "remote-only", "no-dotenv merge keeps remote user keys");
  assert.equal(merged[GATE_KEY], "true", "no-dotenv merge would preserve a remote gate-on key");
  assert.equal(merged.GCLOUD_PROJECT, "vyaamikk-diary");

  const wantReplaced = backend.of(
    endpoint("grinRegisterGoodsReceipt", {
      FIREBASE_CONFIG: "{\"projectId\":\"vyaamikk-diary\"}",
      GCLOUD_PROJECT: "vyaamikk-diary",
    }),
  );
  prepare.inferDetailsFromExisting(wantReplaced, have, true);
  const replaced = wantReplaced.endpoints["asia-south1"].grinRegisterGoodsReceipt.environmentVariables;
  assert.equal(replaced.KEEP_ME, undefined, "dotenv path skips merge; remote-only keys dropped");
  assert.equal(replaced[GATE_KEY], undefined, "dotenv path is replace, not update-one-key");
  assert.equal(replaced.GCLOUD_PROJECT, "vyaamikk-diary");

  const wantNew = backend.of(
    endpoint("grinUploadEvidence", {
      FIREBASE_CONFIG: "{\"projectId\":\"vyaamikk-diary\"}",
    }),
  );
  prepare.inferDetailsFromExisting(wantNew, have, false);
  const created = wantNew.endpoints["asia-south1"].grinUploadEvidence.environmentVariables;
  assert.equal(created.KEEP_ME, undefined);
  assert.equal(created[GATE_KEY], undefined, "new endpoint has no remote user env to merge; gate absent is off");

  const userEnvOpt = {
    functionsSource: join(root, "lib"),
    projectId: "vyaamikk-diary",
    projectAlias: "production",
    isEmulator: false,
  };
  assert.equal(typeof envMod.hasUserEnvs, "function");
  assert.equal(typeof envMod.loadUserEnvs, "function");
  assert.equal(envMod.hasUserEnvs(userEnvOpt), false, "installed CLI package tree has no GRIN dotenv");
});
