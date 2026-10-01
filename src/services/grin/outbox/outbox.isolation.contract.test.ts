/**
 * Outbox module isolation: no firebase-admin, no live G1 adapter import,
 * no invented GRIN numbers, no account-deletion job changes.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(dir, "../../../..");

function walk(current: string, out: string[] = []): string[] {
  for (const name of readdirSync(current)) {
    if (name.startsWith(".")) continue;
    const p = join(current, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|py)$/.test(name) && !name.includes(".test.")) out.push(p);
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const forbidden = [
  /firebase-admin/,
  /@google-cloud\/storage/,
  /tools\/goods-evidence-emulator/,
  /formatGrinNumber/,
  /retireIdentity/,
  /completeAccountDeletion/,
  /EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED/,
];

for (const file of walk(dir)) {
  const rel = relative(repoRoot, file);
  const src = stripComments(readFileSync(file, "utf8"));
  for (const pattern of forbidden) {
    assert.doesNotMatch(src, pattern, `${rel} must not match ${pattern}`);
  }
}

const offline = readFileSync(join(repoRoot, "src/goodsEvidence/offline.ts"), "utf8");
assert.match(offline, /not a SQLite outbox/);
assert.match(offline, /SIMULATED in-process draft shape/);

console.log("outbox.isolation.contract.test.ts: ok");
