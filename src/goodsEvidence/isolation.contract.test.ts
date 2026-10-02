/**
 * Slice 1 stays a bounded module: no diary save path, no billing, no PDF
 * services, no navigation, no SQLite migration, default-off flag only.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const moduleDir = join(repoRoot, "src/goodsEvidence");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.includes(".test.") && name !== "testFixtures.ts") {
      out.push(p);
    }
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const files = walk(moduleDir);
assert.ok(files.length > 0);

const forbidden = [
  /_saveLocks/,
  /completedSteps/,
  /clientRecordId/,
  /idempotencyKey/,
  /resolveOrCreateUserByPhone/,
  /retireIdentity/,
  /completeAccountDeletion/,
  /vyd_session_v2/,
  /vyd_language_v1/,
  /formatAmount/,
  /formatDate/,
  /formatTime/,
  /@\/services\/records/,
  /@\/services\/pdf/,
  /cashPaidPhotoService/,
  /@\/billing/,
  /PLAY_BILLING/,
  /expo-router/,
  /@\/localDb\/schema/,
  /firebase-admin/,
  /setDoc/,
  /updateDoc/,
];

for (const file of files) {
  const rel = relative(repoRoot, file);
  const src = stripComments(readFileSync(file, "utf8"));
  for (const pattern of forbidden) {
    assert.doesNotMatch(src, pattern, `${rel} must not touch ${pattern}`);
  }
}

const packInputs = stripComments(readFileSync(join(moduleDir, "evidencePackInputs.ts"), "utf8"));
assert.doesNotMatch(packInputs, /osConversionOccurred:\s*false/);
assert.match(packInputs, /normalizeOsConversionOccurred/);

const flag = readFileSync(join(moduleDir, "featureFlag.ts"), "utf8");
assert.match(flag, /process\.env\.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED === ["']1["']/);
assert.match(flag, /store-or-standalone/);
assert.match(flag, /env\.runtimeKind/);
assert.doesNotMatch(flag, /__setGoodsEvidenceEnabledForTests/);
assert.doesNotMatch(flag, /_testOverride/);
assert.doesNotMatch(stripComments(flag), /process\.env\s*\[/);

const ledger = readFileSync(join(moduleDir, "ledger.ts"), "utf8");
assert.match(ledger, /SIMULATED/);
assert.match(ledger, /Not a deployed callable/);
assert.match(ledger, /simulated-domain-test/);
assert.match(ledger, /originalSnapshotHash/);

const offline = readFileSync(join(moduleDir, "offline.ts"), "utf8");
assert.match(offline, /not a SQLite outbox/);

const appJson = readFileSync(join(repoRoot, "app.json"), "utf8");
assert.doesNotMatch(appJson, /GOODS_EVIDENCE/);
const eas = readFileSync(join(repoRoot, "eas.json"), "utf8");
assert.doesNotMatch(eas, /GOODS_EVIDENCE/);

console.log("goodsEvidence/isolation.contract.test.ts: ok");
