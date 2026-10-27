/**
 * The EAS hook prints project and package only.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  evaluateFirebaseIdentity,
  identityLine,
} from "./assert-eas-firebase-identity.mjs";

const script = path.join(import.meta.dirname, "assert-eas-firebase-identity.mjs");
const marker = "SHOULD_NOT_PRINT";

function fixture(projectId: string, packageName: string) {
  return {
    project_info: { project_id: projectId },
    client: [
      {
        client_info: { android_client_info: { package_name: packageName } },
        api_key: [{ current_key: marker }],
      },
    ],
  };
}

function run(env: Record<string, string>, file: string) {
  return spawnSync(process.execPath, [script], {
    env: { ...process.env, ...env, GOOGLE_SERVICES_JSON: file },
    encoding: "utf8",
  });
}

const good = evaluateFirebaseIdentity(
  fixture("vyaamikk-diary", "com.specialsoftwares.vyaamikkdiary")
);
assert.equal(good.ok, true);
assert.equal(identityLine(good), "firebase_project=vyaamikk-diary android_package=com.specialsoftwares.vyaamikkdiary");
assert.equal(JSON.stringify(good).includes(marker), false);

const bad = evaluateFirebaseIdentity(fixture("other-project", "com.example.other"));
assert.equal(bad.ok, false);
assert.equal(identityLine(bad).includes(marker), false);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vyd-firebase-identity-"));
const goodFile = path.join(dir, "good.json");
const badFile = path.join(dir, "bad.json");
fs.writeFileSync(goodFile, JSON.stringify(fixture("vyaamikk-diary", "com.specialsoftwares.vyaamikkdiary")));
fs.writeFileSync(badFile, JSON.stringify(fixture("other-project", "com.example.other")));

const skipped = spawnSync(process.execPath, [script], {
  encoding: "utf8",
  env: { ...process.env, EAS_BUILD: "" },
});
assert.equal(skipped.status, 0);
assert.equal(skipped.stdout.includes(marker), false);

const accepted = run({ EAS_BUILD: "1", EAS_BUILD_PROFILE: "internal-grin" }, goodFile);
assert.equal(accepted.status, 0);
assert.equal(accepted.stdout.trim(), "firebase_project=vyaamikk-diary android_package=com.specialsoftwares.vyaamikkdiary");
assert.equal(`${accepted.stdout}${accepted.stderr}`.includes(marker), false);

const rejected = run({ EAS_BUILD: "1", EAS_BUILD_PROFILE: "internal-grin" }, badFile);
assert.equal(rejected.status, 1);
assert.equal(rejected.stdout.trim(), "firebase_project=other-project android_package=com.example.other");
assert.equal(`${rejected.stdout}${rejected.stderr}`.includes(marker), false);

const missing = run({ EAS_BUILD: "1", EAS_BUILD_PROFILE: "production" }, path.join(dir, "absent.json"));
assert.equal(missing.status, 1);
assert.match(missing.stderr, /firebase_identity_unreadable|firebase_identity_missing/);
assert.equal(`${missing.stdout}${missing.stderr}`.includes(marker), false);

fs.rmSync(dir, { recursive: true, force: true });
console.log("assert-eas-firebase-identity.test.ts: ok");
