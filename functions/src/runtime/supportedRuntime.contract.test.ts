/**
 * Cloud Functions deploy runtime.
 * Node.js 20 is decommissioned on 2026-10-30. This test does not deploy.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "../../..");
const functionsPackage = JSON.parse(
  fs.readFileSync(path.join(root, "functions/package.json"), "utf8")
) as { engines?: { node?: string }; dependencies?: Record<string, string> };
const options = fs.readFileSync(path.join(root, "functions/src/globalOptions.ts"), "utf8");

assert.equal(functionsPackage.engines?.node, "22");
assert.equal(functionsPackage.dependencies?.["firebase-functions"], "^6.3.2");
assert.match(options, /cpu: "gcf_gen1"/);
assert.match(options, /concurrency: 1/);
assert.match(options, /maxInstances: 3/);
assert.equal(process.versions.node.split(".")[0] >= "20", true);

console.log("supportedRuntime.contract.test.ts: ok");
