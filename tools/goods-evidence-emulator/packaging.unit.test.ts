/**
 * INJECTED_PORT-adjacent packaging check (source isolation + fail-closed handlers).
 * Generated files live under functions/src/goodsEvidence. They are undeployed.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  grinFunctionsEnabled,
  handleGrinMutation,
  handleGrinReconcile,
  handleGrinRegister,
} from "../../functions/src/goodsEvidence/callables";

const dir = dirname(fileURLToPath(import.meta.url));
const packaged = join(dir, "../../functions/src/goodsEvidence");
const functionsIndex = readFileSync(join(dir, "../../functions/src/index.ts"), "utf8");
const functionsTsconfig = readFileSync(join(dir, "../../functions/tsconfig.json"), "utf8");
const functionsPkg = readFileSync(join(dir, "../../functions/package.json"), "utf8");

assert.doesNotMatch(functionsIndex, /goodsEvidence|GoodsEvidenceRegisterAdapter|grin-g1/);
assert.match(functionsTsconfig, /"outDir": "lib"/);
assert.doesNotMatch(functionsTsconfig, /rootDir/);
assert.match(functionsPkg, /"main": "lib\/index.js"/);

const forbidden = [
  /from ["']react["']/,
  /from ["']react-native["']/,
  /from ["']@\//,
  /from ["']expo/,
  /from ["']@\/config/,
  /from ["']@\/localDb/,
  /from ["']@\/utils\/sha256Hex/,
  /EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED/,
  /isGoodsEvidenceEnabled/,
];

for (const name of readdirSync(packaged)) {
  if (!name.endsWith(".ts")) continue;
  const src = readFileSync(join(packaged, name), "utf8");
  for (const pattern of forbidden) {
    assert.doesNotMatch(src, pattern, `${name} must not match ${pattern}`);
  }
}

assert.equal(grinFunctionsEnabled({}), false);
assert.equal(grinFunctionsEnabled({ GRIN_GOODS_EVIDENCE_FUNCTIONS: "1" }), false);
assert.equal(grinFunctionsEnabled({ GRIN_GOODS_EVIDENCE_FUNCTIONS: "true" }), true);

async function main(): Promise<void> {
  const denied = await handleGrinRegister("uid_1", { commandId: "command01" });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "policy_denied");
  const unauth = await handleGrinRegister(null, {});
  assert.equal(unauth.code, "unauthenticated");
  const rec = await handleGrinReconcile("uid_1", { ledgerId: "l", commandId: "command01" });
  assert.equal(rec.code, "policy_denied");
  const mut = await handleGrinMutation("uid_1", {});
  assert.equal(mut.code, "policy_denied");

  const previous = process.env.GRIN_GOODS_EVIDENCE_FUNCTIONS;
  process.env.GRIN_GOODS_EVIDENCE_FUNCTIONS = "true";
  try {
    const stillClosed = await handleGrinRegister("uid_1", { commandId: "command01" });
    assert.equal(stillClosed.code, "policy_denied");
  } finally {
    if (previous == null) delete process.env.GRIN_GOODS_EVIDENCE_FUNCTIONS;
    else process.env.GRIN_GOODS_EVIDENCE_FUNCTIONS = previous;
  }

  console.log("tools/goods-evidence-emulator/packaging.unit.test.ts: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
