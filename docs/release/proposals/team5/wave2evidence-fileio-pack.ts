/**
 * Team 5 independent inspection of file-IO + complete-pack at
 * 2cbacff6d21caae3d721127fb1a353e4c553be11.
 *
 * Not Wave 2 acceptance. Not NATIVE_DEVICE. Not live deploy.
 * Instrumented FileHandle tests and the joined pack emulator round-trip
 * are executed separately. This file inspects production wiring + HOLDs
 * and proves unset FIRESTORE_EMULATOR_HOST fails for pack-complete
 * (not a pass / not a skip).
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
  assert.doesNotMatch(readRepo("eas.json"), /GOODS_EVIDENCE/);
  assert.equal(eas.build.preview?.env?.EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED, "0");
  assert.equal(eas.build.production?.env?.EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED, "0");
  assert.equal(eas.build.preview?.env?.EXPO_PUBLIC_QUOTA_UPSELL_ENABLED, "0");
  assert.equal(eas.build.production?.env?.EXPO_PUBLIC_QUOTA_UPSELL_ENABLED, "0");
  console.log("GRIN default-off; purchase-entry flags 0 on preview/production");

  const flag = stripComments(readRepo("src/goodsEvidence/featureFlag.ts"));
  assert.match(flag, /env\.runtimeKind === ["']store-or-standalone["']/);
  assert.match(flag, /process\.env\.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED === ["']1["']/);
  assert.match(flag, /if \(isGoodsEvidenceBlockedByStoreRuntime\(\)\) return false/);
  console.log("store-runtime block remains; public env === \"1\" is not sufficient");

  const legal = readRepo("src/config/legal.ts");
  assert.match(legal, /LEGAL_EFFECTIVE_DATE = "2026-07-27"/);
  console.log("legal date 2026-07-27");

  const pkg = JSON.parse(readRepo("package.json")) as { dependencies: Record<string, string> };
  assert.match(pkg.dependencies.expo, /~54\./);
  assert.equal(pkg.dependencies["expo-file-system"], "~19.0.23");
  console.log("Expo SDK 54 / expo-file-system ~19.0.23");

  const liveStorage = readRepo("storage.rules");
  const liveFirestore = readRepo("firestore.rules");
  assert.doesNotMatch(liveStorage, /grinEvidence/);
  assert.doesNotMatch(liveFirestore, /goodsEvidence/);
  console.log("live Rules: no grinEvidence / goodsEvidence");

  const boundedRaw = readRepo("src/goodsEvidence/boundedRead.ts");
  assert.match(boundedRaw, /Never the sole admission check/);
  const bounded = stripComments(boundedRaw);
  assert.doesNotMatch(bounded, /expo-file-system/);
  assert.doesNotMatch(bounded, /readAsStringAsync/);
  assert.doesNotMatch(bounded, /\batob\b/);
  assert.doesNotMatch(bounded, /EncodingType/);
  assert.match(bounded, /handle\.readBytes/);
  assert.match(bounded, /closeOnce/);
  assert.match(bounded, /finally\s*\{\s*closeOnce\(\)/);
  assert.match(bounded, /const copy = new Uint8Array\(chunk\.byteLength\)/);
  assert.match(bounded, /copy\.set\(chunk\)/);
  assert.match(bounded, /total \+= chunk\.byteLength/);
  assert.match(bounded, /if \(total > maxBytes\) throw grinBoundedIoError\("too_large"\)/);
  assert.match(bounded, /advertised > maxBytes/);
  console.log("boundedRead: FileHandle.readBytes, copy, running maxBytes, close in finally; advertised size not sole");

  const retention = stripComments(readRepo("src/screens/grin/grinOriginalRetention.ts"));
  assert.doesNotMatch(retention, /readAsStringAsync/);
  assert.doesNotMatch(retention, /\batob\b/);
  assert.doesNotMatch(retention, /EncodingType/);
  assert.match(retention, /iterateBoundedChunks/);
  assert.match(retention, /file\.open\(\)/);
  assert.match(retention, /destHandle\.writeBytes\(chunk\)/);
  assert.match(retention, /sourceSize != null && sourceSize > maxBytes/);
  assert.match(retention, /await fs\.copyFile\(input\.sourcePath, dest, maxBytes\)/);
  assert.match(retention, /const hashed = await hashRetainedOriginal\(fs, dest, maxBytes, abort\)/);
  assert.match(retention, /if \(committed\.has\(localPath\)\) return/);
  assert.match(retention, /uncommitted\.add\(dest\)/);
  console.log("retention: size-check before copy when size available; hash after copy; discard uncommitted only");

  const hasher = stripComments(readRepo("src/services/grin/repository/localOriginalHasher.ts"));
  assert.doesNotMatch(hasher, /readAsStringAsync/);
  assert.doesNotMatch(hasher, /\batob\b/);
  assert.doesNotMatch(hasher, /from ["']node:fs["']/);
  assert.match(hasher, /iterateBoundedChunks/);
  assert.match(hasher, /executionLabel:\s*APP_FILESYSTEM/);
  console.log("hasher: iterateBoundedChunks via retention adapter; APP_FILESYSTEM; no node:fs");

  const evidence = stripComments(readRepo("src/services/grin/transport/evidenceTransport.ts"));
  assert.doesNotMatch(evidence, /readAsStringAsync/);
  assert.doesNotMatch(evidence, /\batob\b/);
  assert.doesNotMatch(evidence, /EncodingType/);
  assert.doesNotMatch(evidence, /arrayBuffer\(\)/);
  assert.match(evidence, /uploadBytesResumable/);
  assert.match(evidence, /readPrefixFromHandle/);
  assert.match(evidence, /iterateBoundedChunks/);
  assert.match(evidence, /MIME_SNIFF_BYTES/);
  const factory = evidence.slice(evidence.indexOf("export function createFirebaseJsGrinEvidenceTransport"));
  assert.match(factory.slice(0, 500), /readPrefix:\s*defaultReadPrefix/);
  assert.match(factory.slice(0, 500), /fileSize:\s*defaultFileSize/);
  assert.doesNotMatch(factory.slice(0, 500), /readLocalBytes/);
  assert.match(evidence, /data = new File\(input\.localPath\)/);
  console.log("transport: production factory omits readLocalBytes; prefix 16 + File.size; Expo File Blob putObject");

  const evidenceCeilings = stripComments(readRepo("src/goodsEvidence/evidence.ts"));
  assert.match(evidenceCeilings, /MAX_PDF_ORIGINAL_BYTES = 15 \* 1024 \* 1024/);
  assert.match(evidenceCeilings, /MAX_IMAGE_ORIGINAL_BYTES = 10 \* 1024 \* 1024/);
  assert.match(evidenceCeilings, /MAX_CONCURRENT_UPLOADS_PER_OWNER = 2/);
  assert.match(evidenceCeilings, /HASH_CHUNK_BYTES = 64 \* 1024/);
  console.log("ceilings: 15 MiB PDF / 10 MiB image / MAX_CONCURRENT_UPLOADS_PER_OWNER=2 / HASH_CHUNK_BYTES=64KiB");

  const pack = readRepo("tools/goods-evidence-emulator/pack-complete.emulator.test.ts");
  assert.doesNotMatch(pack, /markVerifiedDescriptor/);
  assert.doesNotMatch(pack, /setGrinLocalOriginalHasherFactoryForTests/);
  assert.doesNotMatch(pack, /readLocalBytes/);
  assert.match(pack, /writeEvidenceUpload/);
  assert.match(pack, /persistGrinOwnerSession\(\)/);
  assert.match(pack, /exportPack/);
  assert.match(pack, /httpsCallable/);
  assert.match(pack, /readPrefixFromHandle/);
  assert.match(pack, /fileSize: \(path\) => hostFs\.fileSize\(path\)/);
  assert.match(pack, /const buf = await readFile\(input\.localPath\)/);
  assert.match(pack, /Unset hosts are not a pass/);
  assert.match(pack, /receipt_pack_interrupt/);
  assert.match(pack, /receipt_pack_missing/);
  assert.match(pack, /receipt_pack_corrupt/);
  assert.match(pack, /receipt_pack_wanted/);
  console.log("pack-complete: joined persist/writeEvidenceUpload; no markVerifiedDescriptor; host putObject materializes");

  const repoUnit = readRepo("src/services/grin/repository/GrinApplicationRepository.test.ts");
  assert.match(repoUnit, /SQLITE_HOST repository unit helper\. Not writeEvidenceUpload/);
  assert.match(repoUnit, /function markVerifiedDescriptor/);
  assert.match(repoUnit, /SQLITE_EXECUTION=\$\{SQLITE_HOST\}/);
  console.log("GrinApplicationRepository.test.ts: markVerifiedDescriptor remains labelled SQLITE_HOST unit");

  const unset = spawnSync(
    "npx",
    ["--yes", "tsx", "tools/goods-evidence-emulator/pack-complete.emulator.test.ts"],
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
  console.log("unset FIRESTORE_EMULATOR_HOST: failure (not counted as pass)");

  console.log("wave2evidence-fileio-pack.ts: ok (inspection; not Wave 2 acceptance)");
}

void main();
