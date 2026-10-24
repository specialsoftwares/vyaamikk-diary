/**
 * Store release excludes GRIN. Routes and server callables stay in the tree.
 * Exclusion does not delete retained copies.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { __setRuntimeSignalsForTests } from "@/config/env";
import { isGoodsEvidenceEnabled } from "@/goodsEvidence/featureFlag";
import { INCLUDE_GRIN_IN_ACCOUNT_PURGE, GRIN_FIRESTORE_USER_COLLECTIONS, grinEvidenceStoragePrefix } from "../../functions/src/deletion/grinCleanupLists";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

const previousEnabled = process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED;
const previousAdmit = process.env.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT;
try {
  process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED = "1";
  delete process.env.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT;
  __setRuntimeSignalsForTests({ appOwnership: null, isDev: false, platform: "android" });
  assert.equal(isGoodsEvidenceEnabled(), false);

  process.env.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT = "1";
  __setRuntimeSignalsForTests({ appOwnership: null, isDev: false, platform: "android" });
  assert.equal(isGoodsEvidenceEnabled(), true);
  delete process.env.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT;
  __setRuntimeSignalsForTests({ appOwnership: null, isDev: false, platform: "android" });
  assert.equal(isGoodsEvidenceEnabled(), false);
} finally {
  if (previousEnabled === undefined) delete process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED;
  else process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED = previousEnabled;
  if (previousAdmit === undefined) delete process.env.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT;
  else process.env.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT = previousAdmit;
  __setRuntimeSignalsForTests(null);
}

const screens = readdirSync(resolve(root, "src/screens/grin")).filter((name) => name.endsWith("Screen.tsx"));
assert.ok(screens.length >= 11);
for (const name of screens) {
  assert.match(read(`src/screens/grin/${name}`), /GrinAdmissionGate/);
}
assert.match(read("app/(app)/composer/movement.tsx"), /isGoodsEvidenceEnabled\(\)/);
assert.match(read("src/services/savedRecords/grinHubEntry.ts"), /isGoodsEvidenceEnabled\(\)/);

const callables = read("functions/src/goodsEvidence/callables.ts");
assert.match(callables, /grinFunctionsEnabled\(\)/);
assert.equal(callables.includes('return env[GRIN_FUNCTIONS_ENV] === "true"'), true);
const names = [
  "grinRegisterGoodsReceipt",
  "grinReconcileCommand",
  "grinMutateGoodsReceipt",
  "grinReadGoodsReceipt",
  "grinReserveEvidence",
  "grinBeginEvidenceUpload",
  "grinUploadEvidence",
];
for (const name of names) {
  assert.match(read("functions/src/index.ts"), new RegExp(name));
  assert.match(read("functions/src/goodsEvidence/productionExports.ts"), new RegExp(name));
}
assert.match(read("functions/src/goodsEvidence/composed.ts"), /grinFunctionsEnabled\(env\)/);

assert.equal(INCLUDE_GRIN_IN_ACCOUNT_PURGE, false);
assert.equal(grinEvidenceStoragePrefix("owner-a"), "users/owner-a/grinEvidence/");
assert.ok(GRIN_FIRESTORE_USER_COLLECTIONS.includes("grinEvidenceObjectKeys"));
const purge = read("functions/src/deletion/finalPurge.ts");
assert.match(purge, /INCLUDE_GRIN_IN_ACCOUNT_PURGE/);
assert.match(purge, /deletionPolicyVersion\) >= 2/);
assert.match(purge, /force: true/);
assert.match(read("functions/src/deletion/grinCleanup.ts"), /if \(!INCLUDE_GRIN_IN_ACCOUNT_PURGE && params\.force !== true\)/);

console.log("goods evidence release scope: store runtime excluded, retained copies listed, purge flag off");
