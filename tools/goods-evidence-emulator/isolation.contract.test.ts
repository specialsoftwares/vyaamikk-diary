import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const adapterFiles = [
  "adapter.ts",
  "hash.ts",
  "limits.ts",
  "ids.ts",
  "log.ts",
  "paths.ts",
  "types.ts",
  "serial.ts",
  "retry.ts",
  "mutations.ts",
  "serverPort.ts",
].map((name) => join(dir, name));

assert.ok(adapterFiles.includes(join(dir, "adapter.ts")));
assert.ok(adapterFiles.includes(join(dir, "serverPort.ts")));

const forbidden = [
  /from ["']react["']/,
  /from ["']react-native["']/,
  /from ["']expo/,
  /from ["']@\/config/,
  /from ["']@\/localDb/,
  /from ["']@\/utils\/sha256Hex/,
  /from ["'][^"']*functions\/src/,
  /from ["']firebase-admin/,
  /EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED/,
  /isGoodsEvidenceEnabled/,
];

for (const file of adapterFiles) {
  const src = readFileSync(file, "utf8");
  for (const pattern of forbidden) {
    assert.doesNotMatch(src, pattern, `${file} must not match ${pattern}`);
  }
}

const functionsIndex = readFileSync(join(dir, "../../functions/src/index.ts"), "utf8");
assert.doesNotMatch(
  functionsIndex,
  /goodsEvidence|GoodsEvidenceRegisterAdapter|grin-g1|createInjectedGrinServerPort|serverPort|grinRegisterGoodsReceipt|grinReserveEvidence|grinUploadEvidence/
);

const functionsEntry = readFileSync(join(dir, "functions-entry/handlers.ts"), "utf8");
assert.match(functionsEntry, /createIsolatedGrinCallables/);
assert.match(functionsEntry, /grinUploadEvidence/);
assert.doesNotMatch(functionsEntry, /from ["'][^"']*functions\/src\/index/);
const functionsEntryCompose = readFileSync(join(dir, "functions-entry/compose.ts"), "utf8");
assert.match(functionsEntryCompose, /createProductionGrinCallables as createIsolatedGrinCallables/);
assert.doesNotMatch(functionsEntryCompose, /from ["']\.\.\/adapter["']/);

const functionsTsconfig = readFileSync(join(dir, "../../functions/tsconfig.json"), "utf8");
assert.match(functionsTsconfig, /"outDir": "lib"/);
assert.doesNotMatch(functionsTsconfig, /goodsEvidence/);

console.log("tools/goods-evidence-emulator/isolation.contract.test.ts: ok");
