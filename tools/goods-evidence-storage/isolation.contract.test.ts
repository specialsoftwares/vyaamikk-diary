/**
 * G2 isolation: adapter is not a live callable, FAKE_* is not production,
 * live storage.rules is unchanged, no public URL helper, no full-file base64.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(dir, "../..");

const adapterFiles = [
  "adapter.ts",
  "evidencePort.ts",
  "hash.ts",
  "ids.ts",
  "log.ts",
  "paths.ts",
  "retry.ts",
  "storageQuota.ts",
  "types.ts",
  "FAKE_memoryBlobStore.ts",
  "FAKE_injectedFirestore.ts",
].map((name) => join(dir, name));

const forbidden = [
  /from ["']react["']/,
  /from ["']react-native["']/,
  /from ["']@\/config/,
  /from ["']@\/localDb/,
  /from ["']@\/utils\/sha256Hex/,
  /from ["'][^"']*functions\/src/,
  /from ["']firebase-admin/,
  /EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED/,
  /isGoodsEvidenceEnabled/,
  /getDownloadURL/,
  /toString\(\s*["']base64["']\s*\)/,
];

for (const file of adapterFiles) {
  const src = readFileSync(file, "utf8");
  for (const pattern of forbidden) {
    assert.doesNotMatch(src, pattern, `${file} must not match ${pattern}`);
  }
}

const fakeBlob = readFileSync(join(dir, "FAKE_memoryBlobStore.ts"), "utf8");
assert.match(fakeBlob, /FAKE_/);
assert.match(fakeBlob, /not wired as production/i);

const functionsIndex = readFileSync(join(repoRoot, "functions/src/index.ts"), "utf8");
assert.doesNotMatch(
  functionsIndex,
  /goods-evidence-storage|GoodsEvidenceStorageAdapter|FAKE_MemoryBlobStore|createInjectedGrinEvidencePort/
);

const liveStorage = readFileSync(join(repoRoot, "storage.rules"), "utf8");
assert.doesNotMatch(liveStorage, /grinEvidence/);

const isolatedStorage = readFileSync(join(dir, "storage.rules"), "utf8");
assert.match(isolatedStorage, /hasFlightReservation/);
assert.match(isolatedStorage, /isRetainedOriginalState/);
assert.match(isolatedStorage, /canReadOriginal/);
assert.match(isolatedStorage, /hasDerivativeFlightReservation/);
assert.match(isolatedStorage, /pending_deletion|status/);
assert.doesNotMatch(isolatedStorage, /getDownloadURL/);

const packInputs = readFileSync(join(repoRoot, "src/goodsEvidence/evidencePackInputs.ts"), "utf8");
assert.match(packInputs, /assembleEvidencePackInputs/);
assert.match(packInputs, /invoice reference is not a retained invoice original/);
assert.match(packInputs, /packPayloadKind: "manifest_and_hashes"/);
assert.match(packInputs, /originalBytesBundled: false/);
assert.doesNotMatch(packInputs, /completeness:\s*["']complete["']/);
assert.doesNotMatch(packInputs, /toString\(\s*["']base64["']\s*\)/);

const evidencePort = readFileSync(join(dir, "evidencePort.ts"), "utf8");
assert.doesNotMatch(evidencePort, /actualSha256:\s*claimed/);
assert.doesNotMatch(evidencePort, /actualSha256\s*=\s*claimedSha256/);
assert.match(evidencePort, /storedActualSha256/);
assert.doesNotMatch(evidencePort, /toString\(\s*["']base64["']\s*\)/);

const appJson = readFileSync(join(repoRoot, "app.json"), "utf8");
assert.doesNotMatch(appJson, /GOODS_EVIDENCE/);

console.log("tools/goods-evidence-storage/isolation.contract.test.ts: ok");
