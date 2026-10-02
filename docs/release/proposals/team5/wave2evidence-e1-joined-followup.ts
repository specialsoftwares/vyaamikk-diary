/**
 * Team 5 PHASE 4 independent inspection of the joined
 * persistGrinOwnerSession → Functions-emulator proof at cd5b5f4.
 *
 * Not Wave 2 acceptance. Not NATIVE_DEVICE. Not live deploy.
 * The joined emulator round-trip is executed separately via
 * `npm run test:goods-evidence-g1-functions-emulator`.
 * This file inspects production wiring + injected boundaries and
 * proves unset emulator hosts fail (not a pass / not a skip).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function readRepo(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function main(): void {
  const indexSrc = readRepo("functions/src/index.ts");
  assert.doesNotMatch(indexSrc, /goodsEvidence|grinBegin|grinUpload|grinRegister|grinReserve/);
  console.log("HOLD functions/src/index.ts: no GRIN export");

  const appJson = JSON.parse(readRepo("app.json")) as {
    expo: { version: string; android: { versionCode: number } };
  };
  assert.equal(appJson.expo.version, "1.0.0");
  assert.equal(appJson.expo.android.versionCode, 23);
  console.log("version 1.0.0 / versionCode 23");

  const eas = JSON.parse(readRepo("eas.json")) as {
    build: Record<string, { env?: Record<string, string> }>;
  };
  assert.notEqual(eas.build.preview?.env?.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED, "1");
  assert.notEqual(eas.build.production?.env?.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED, "1");
  assert.equal(eas.build.preview?.env?.EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED, "0");
  assert.equal(eas.build.production?.env?.EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED, "0");
  assert.equal(eas.build.preview?.env?.EXPO_PUBLIC_QUOTA_UPSELL_ENABLED, "0");
  assert.equal(eas.build.production?.env?.EXPO_PUBLIC_QUOTA_UPSELL_ENABLED, "0");
  console.log("GRIN default-off; purchase-entry flags 0 on preview/production");

  const bindingSrc = stripComments(readRepo("src/services/grin/repository/appBinding.ts"));
  assert.match(bindingSrc, /server:\s*serverPortFactory\(\)/);
  assert.match(bindingSrc, /evidence:\s*evidencePortFactory\(\)/);
  assert.match(bindingSrc, /localOriginalHasher:\s*hasherFactory\(\)/);
  assert.match(bindingSrc, /function defaultGrinLocalOriginalHasherFactory[\s\S]*createAppLocalOriginalHasher\(\)/);
  console.log("persistGrinOwnerSession source wires server+evidence+localOriginalHasher=hasherFactory()");

  const hasherSrc = stripComments(readRepo("src/services/grin/repository/localOriginalHasher.ts"));
  assert.match(hasherSrc, /export function createAppLocalOriginalHasher/);
  assert.match(hasherSrc, /executionLabel:\s*APP_FILESYSTEM/);
  assert.doesNotMatch(hasherSrc, /from ["']node:fs["']/);
  console.log("hasher factory remains createAppLocalOriginalHasher / APP_FILESYSTEM");

  const joined = readRepo("tools/goods-evidence-emulator/functions-roundtrip.emulator.test.ts");
  assert.doesNotMatch(joined, /setGrinLocalOriginalHasherFactoryForTests/);
  assert.doesNotMatch(joined, /createSqliteHostLocalOriginalHasher/);
  assert.match(joined, /from "firebase\/functions"/);
  assert.match(joined, /httpsCallable,/);
  assert.match(joined, /const callable = httpsCallable\(fns, name\)/);
  assert.match(joined, /persistGrinOwnerSession\(\)/);
  assert.match(joined, /setGrinOriginalRetentionFsForTests/);
  assert.match(joined, /setGrinApplicationDbFactoryForTests/);
  assert.match(joined, /setGrinServerPortFactoryForTests/);
  assert.match(joined, /setGrinEvidencePortFactoryForTests/);
  assert.match(joined, /readFile\(path\)/);
  assert.doesNotMatch(joined, /jest\.mock|vi\.mock|mockHttpsCallable/);
  console.log("joined test: hasher factory not injected; httpsCallable not mocked");
  console.log("injected boundaries present: emulator hosts, auth token, Admin seed, SQLITE_HOST, HOST_FILESYSTEM, node readFile");

  const liveStorage = readRepo("storage.rules");
  const liveFirestore = readRepo("firestore.rules");
  assert.doesNotMatch(liveStorage, /grinEvidence/);
  assert.doesNotMatch(liveFirestore, /goodsEvidence/);
  console.log("live Rules: no grinEvidence / goodsEvidence");

  const unset = spawnSync(
    "npx",
    ["--yes", "tsx", "tools/goods-evidence-emulator/functions-roundtrip.emulator.test.ts"],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        FIRESTORE_EMULATOR_HOST: "",
        FIREBASE_AUTH_EMULATOR_HOST: "",
        FIREBASE_STORAGE_EMULATOR_HOST: "",
        FIREBASE_FUNCTIONS_EMULATOR_HOST: "",
        FUNCTIONS_EMULATOR_HOST: "",
      },
      encoding: "utf8",
    }
  );
  assert.notEqual(unset.status, 0, "unset emulator hosts must fail, not pass");
  const unsetMessage = `${unset.stderr ?? ""}\n${unset.stdout ?? ""}`;
  assert.match(unsetMessage, /required \(firebase emulators:exec\)\. Unset hosts are not a pass/);
  console.log("unset emulator hosts: failure (not counted as pass)");

  console.log("wave2evidence-e1-joined-followup.ts: ok (inspection; not Wave 2 acceptance)");
}

void main();
