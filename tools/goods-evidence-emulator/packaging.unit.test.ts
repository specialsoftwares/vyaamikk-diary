/**
 * INJECTED_PORT-adjacent packaging check (source isolation + fail-closed handlers).
 * Generated files live under functions/src/goodsEvidence. They are undeployed.
 * Label: INJECTED / not live deploy.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GRIN_BEGIN_EVIDENCE_CALLABLE,
  GRIN_MUTATE_CALLABLE,
  GRIN_READ_CALLABLE,
  GRIN_RECONCILE_CALLABLE,
  GRIN_REGISTER_CALLABLE,
  GRIN_RESERVE_EVIDENCE_CALLABLE,
  GRIN_UPLOAD_EVIDENCE_CALLABLE,
  grinFunctionsEnabled,
  handleGrinBeginEvidenceUpload,
  handleGrinMutation,
  handleGrinRead,
  handleGrinReconcile,
  handleGrinRegister,
  handleGrinReserveEvidence,
  handleGrinUploadEvidence,
} from "../../functions/src/goodsEvidence/callables";
import {
  DOMAIN_FILES,
  HASH_NODE,
  expectedGeneratedSource,
} from "./packageFunctionsGoodsEvidence";

const dir = dirname(fileURLToPath(import.meta.url));
const packaged = join(dir, "../../functions/src/goodsEvidence");
const sourceDir = join(dir, "../../src/goodsEvidence");
const functionsIndex = readFileSync(join(dir, "../../functions/src/index.ts"), "utf8");
const functionsTsconfig = readFileSync(join(dir, "../../functions/tsconfig.json"), "utf8");
const functionsPkg = readFileSync(join(dir, "../../functions/package.json"), "utf8");
const transportNames = readFileSync(
  join(dir, "../../src/services/grin/transport/callableNames.ts"),
  "utf8"
);
const composedSrc = readFileSync(join(packaged, "composed.ts"), "utf8");

assert.doesNotMatch(
  functionsIndex,
  /goodsEvidence|GoodsEvidenceRegisterAdapter|grin-g1|createInjectedGrinServerPort|serverPort|grinRegisterGoodsReceipt|grinReconcileCommand|grinMutateGoodsReceipt|grinReadGoodsReceipt|grinUploadEvidence|composed/
);
assert.match(functionsTsconfig, /"outDir": "lib"/);
assert.doesNotMatch(functionsTsconfig, /rootDir/);
assert.match(functionsPkg, /"main": "lib\/index.js"/);

assert.match(transportNames, new RegExp(`"${GRIN_REGISTER_CALLABLE}"`));
assert.match(transportNames, new RegExp(`"${GRIN_RECONCILE_CALLABLE}"`));
assert.match(transportNames, new RegExp(`"${GRIN_MUTATE_CALLABLE}"`));
assert.match(transportNames, new RegExp(`"${GRIN_READ_CALLABLE}"`));
assert.match(transportNames, new RegExp(`"${GRIN_RESERVE_EVIDENCE_CALLABLE}"`));
assert.match(transportNames, new RegExp(`"${GRIN_BEGIN_EVIDENCE_CALLABLE}"`));
assert.match(transportNames, new RegExp(`"${GRIN_UPLOAD_EVIDENCE_CALLABLE}"`));

assert.match(composedSrc, /request\.auth\.uid \/ AuthData\.uid/);
assert.match(composedSrc, /GRIN_GOODS_EVIDENCE_FUNCTIONS/);
assert.match(composedSrc, /uploadEvidence/);
assert.match(composedSrc, /stored bytes/);
assert.doesNotMatch(composedSrc, /from ["'][^"']*tools\/goods-evidence-emulator/);
assert.doesNotMatch(composedSrc, /from ["']firebase-admin["']/);
assert.doesNotMatch(composedSrc, /from ["']\.\.\/\.\.\/src\//);

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
  /from ["']firebase-admin["']/,
  /from ["']better-sqlite3["']/,
  /from ["'][^"']*tools\/goods-evidence-emulator/,
  /from ["'][^"']*tools\/goods-evidence-storage/,
];

for (const name of readdirSync(packaged)) {
  if (!name.endsWith(".ts")) continue;
  const src = readFileSync(join(packaged, name), "utf8");
  for (const pattern of forbidden) {
    assert.doesNotMatch(src, pattern, `${name} must not match ${pattern}`);
  }
}

for (const name of DOMAIN_FILES) {
  const raw = readFileSync(join(sourceDir, name), "utf8");
  const expected = expectedGeneratedSource(name, raw);
  const actual = readFileSync(join(packaged, name), "utf8");
  assert.equal(actual, expected, `${name} drifted from src/goodsEvidence`);
}
assert.equal(readFileSync(join(packaged, "hashNode.ts"), "utf8"), HASH_NODE);
assert.equal(
  JSON.parse(readFileSync(join(packaged, "generated.manifest.json"), "utf8")).source,
  "src/goodsEvidence"
);

assert.equal(grinFunctionsEnabled({}), false);
assert.equal(grinFunctionsEnabled({ GRIN_GOODS_EVIDENCE_FUNCTIONS: "1" }), false);
assert.equal(grinFunctionsEnabled({ GRIN_GOODS_EVIDENCE_FUNCTIONS: "TRUE" }), false);
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
  const read = await handleGrinRead("uid_1", { ledgerId: "l", receiptId: "r" });
  assert.equal(read.code, "policy_denied");
  const upload = await handleGrinUploadEvidence("uid_1", {});
  assert.equal(upload.code, "policy_denied");
  const reserve = await handleGrinReserveEvidence("uid_1", {});
  assert.equal(reserve.code, "policy_denied");
  const begin = await handleGrinBeginEvidenceUpload("uid_1", {});
  assert.equal(begin.code, "policy_denied");

  const previous = process.env.GRIN_GOODS_EVIDENCE_FUNCTIONS;
  process.env.GRIN_GOODS_EVIDENCE_FUNCTIONS = "true";
  try {
    const stillClosed = await handleGrinRegister("uid_1", { commandId: "command01" });
    assert.equal(stillClosed.code, "policy_denied");
    const readStillClosed = await handleGrinRead("uid_1", { ledgerId: "l", receiptId: "r" });
    assert.equal(readStillClosed.code, "policy_denied");
  } finally {
    if (previous == null) delete process.env.GRIN_GOODS_EVIDENCE_FUNCTIONS;
    else process.env.GRIN_GOODS_EVIDENCE_FUNCTIONS = previous;
  }

  console.log("tools/goods-evidence-emulator/packaging.unit.test.ts: ok (INJECTED / not live deploy)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
