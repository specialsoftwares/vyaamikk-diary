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
  G1_ADAPTER_FILES,
  G2_ADAPTER_FILES,
  HASH_NODE,
  expectedGeneratedAdapterSource,
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

const forbiddenDomain = [
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
  /from ["']firebase-admin\//,
  /from ["']better-sqlite3["']/,
  /from ["'][^"']*tools\/goods-evidence-emulator/,
  /from ["'][^"']*tools\/goods-evidence-storage/,
];

function walkTs(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name.endsWith(".ts")) out.push(p);
    else if (!name.includes(".")) {
      try {
        walkTs(p, out);
      } catch {
        // skip non-dir
      }
    }
  }
  return out;
}

for (const file of walkTs(packaged)) {
  const rel = file.slice(packaged.length + 1);
  const src = readFileSync(file, "utf8");
  const patterns = rel === "productionCompose.ts" ? forbiddenDomain.filter((p) => !String(p).includes("firebase-admin")) : forbiddenDomain;
  for (const pattern of patterns) {
    assert.doesNotMatch(src, pattern, `${rel} must not match ${pattern}`);
  }
}

const productionCompose = readFileSync(join(packaged, "productionCompose.ts"), "utf8");
assert.match(productionCompose, /from ["']firebase-admin\/app["']/);
assert.match(productionCompose, /from ["']firebase-admin\/firestore["']/);
assert.match(productionCompose, /from ["']firebase-admin\/storage["']/);
assert.match(productionCompose, /from ["']\.\/g1\/adapter["']/);
assert.match(productionCompose, /from ["']\.\/g2\/adapter["']/);
assert.match(productionCompose, /HASH_CHUNK_BYTES/);
assert.match(productionCompose, /MAX_PDF_ORIGINAL_BYTES/);
assert.match(productionCompose, /Date\.now\(\)/);
assert.match(productionCompose, /createProductionGrinCallables/);
assert.match(productionCompose, /async open\(path, generation\)/);
assert.match(productionCompose, /getStorage\(\)\.bucket\(storageBucket\)/);
assert.doesNotMatch(productionCompose, /handleGrinRegister/);
assert.doesNotMatch(productionCompose, /from ["'][^"']*tools\//);

const functionsEntryCompose = readFileSync(join(dir, "functions-entry/compose.ts"), "utf8");
assert.match(functionsEntryCompose, /createProductionGrinCallables as createIsolatedGrinCallables/);
assert.match(functionsEntryCompose, /functions\/src\/goodsEvidence\/productionCompose/);
assert.doesNotMatch(functionsEntryCompose, /GoodsEvidenceRegisterAdapter/);
assert.doesNotMatch(functionsEntryCompose, /goods-evidence-storage\/adapter/);

for (const name of DOMAIN_FILES) {
  const raw = readFileSync(join(sourceDir, name), "utf8");
  const expected = expectedGeneratedSource(name, raw);
  const actual = readFileSync(join(packaged, name), "utf8");
  assert.equal(actual, expected, `${name} drifted from src/goodsEvidence`);
}
assert.equal(readFileSync(join(packaged, "hashNode.ts"), "utf8"), HASH_NODE);

const g1Source = join(dir);
const g2Source = join(dir, "../goods-evidence-storage");
for (const name of G1_ADAPTER_FILES) {
  const expected = expectedGeneratedAdapterSource(readFileSync(join(g1Source, name), "utf8"));
  const actual = readFileSync(join(packaged, "g1", name), "utf8");
  assert.equal(actual, expected, `g1/${name} drifted from tools/goods-evidence-emulator`);
}
for (const name of G2_ADAPTER_FILES) {
  const expected = expectedGeneratedAdapterSource(readFileSync(join(g2Source, name), "utf8"));
  const actual = readFileSync(join(packaged, "g2", name), "utf8");
  assert.equal(actual, expected, `g2/${name} drifted from tools/goods-evidence-storage`);
}

const manifest = JSON.parse(readFileSync(join(packaged, "generated.manifest.json"), "utf8")) as {
  domainSource: string;
  g1AdapterSource: string;
  g2AdapterSource: string;
};
assert.equal(manifest.domainSource, "src/goodsEvidence");
assert.equal(manifest.g1AdapterSource, "tools/goods-evidence-emulator");
assert.equal(manifest.g2AdapterSource, "tools/goods-evidence-storage");

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
