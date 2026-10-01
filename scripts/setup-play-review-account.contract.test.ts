/**
 * Static contract for Play review instructions and the offline-safe script source.
 * Does not call Firebase, mutate accounts, or read credentials.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = readFileSync(join(root, "scripts/setup-play-review-account.ts"), "utf8");
const docs = readFileSync(join(root, "docs/PLAY_REVIEW_SETUP.md"), "utf8");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

assert.equal(
  pkg.scripts["review:verify-account"],
  "npx --yes tsx scripts/setup-play-review-account.ts"
);
assert.match(pkg.scripts["test:safe-diagnostics"] ?? "", /safeDiagnostics/);

for (const text of [script, docs]) {
  assert.doesNotMatch(text, /reviewer@specialsoftwares\.com/);
}

const playSection = docs.split("## Google Play Console")[1] ?? "";
assert.match(playSection, /Leave blank\. This app does not use passwords/);
assert.doesNotMatch(playSection, /reviewer@/);
assert.doesNotMatch(playSection, /email OTP/i);
assert.doesNotMatch(playSection, /inbox password/i);

assert.match(docs, /Leave blank\. This app does not use passwords/);
assert.match(docs, /\+91 9000000000/);
assert.match(docs, /654321/);
assert.match(docs, /Do \*\*not\*\* create a dedicated reviewer email inbox/);
assert.match(docs, /name/);
assert.match(docs, /businessName/);
assert.match(docs, /phoneE164/);
assert.match(docs, /ueid/);
assert.match(docs, /status/);

assert.match(script, /key: "name"/);
assert.match(script, /key: "businessName"/);
assert.match(script, /key: "phoneE164"/);
assert.match(script, /key: "ueid"/);
assert.match(script, /key: "status"/);
assert.match(script, /status !== "active"/);
assert.match(script, /GOOGLE_APPLICATION_CREDENTIALS/);
assert.match(
  script,
  /Checked users\/\{uid\} fields only: name, businessName, phoneE164, ueid, status=active/
);
assert.doesNotMatch(script, /fully configured for Play review/);
assert.doesNotMatch(script, /createUser|createUserWithEmailAndPassword|updateUser\(/);

console.log("setup-play-review-account.contract.test.ts: ok");
