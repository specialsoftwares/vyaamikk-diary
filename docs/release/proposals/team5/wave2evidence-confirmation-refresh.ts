/**
 * Team 5 independent inspection of confirmation refresh after evidence
 * linkage at dcc325a9fb0d0094ab8bc05cc7ea3d27a7e2ab7a.
 *
 * Not Wave 2 acceptance. Not NATIVE_DEVICE. Not live deploy.
 * SQLITE_HOST outbox and joined pack-complete emulator runs are executed
 * separately. This file inspects production wiring + HOLDs + Packets A/B
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

function sliceProcessAttachments(outbox: string): string {
  const start = outbox.indexOf("private async processAttachments(");
  assert.notEqual(start, -1, "processAttachments missing");
  const next = outbox.indexOf("\n  private writeEvidenceUpload(", start);
  assert.notEqual(next, -1, "writeEvidenceUpload after processAttachments missing");
  return outbox.slice(start, next);
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
    build: Record<string, { env?: Record<string, string>; android?: { buildType?: string } }>;
  };
  assert.notEqual(eas.build.preview?.env?.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED, "1");
  assert.notEqual(eas.build.production?.env?.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED, "1");
  assert.doesNotMatch(readRepo("eas.json"), /GOODS_EVIDENCE/);
  assert.equal(eas.build.preview?.env?.EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED, "0");
  assert.equal(eas.build.production?.env?.EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED, "0");
  assert.equal(eas.build.preview?.env?.EXPO_PUBLIC_QUOTA_UPSELL_ENABLED, "0");
  assert.equal(eas.build.production?.env?.EXPO_PUBLIC_QUOTA_UPSELL_ENABLED, "0");
  assert.equal(eas.build.production?.android?.buildType, "app-bundle");
  assert.equal(eas.build.preview?.android?.buildType, "apk");
  console.log("GRIN default-off; purchase-entry 0 on preview/production; production AAB vs preview APK");

  const flag = stripComments(readRepo("src/goodsEvidence/featureFlag.ts"));
  assert.match(flag, /env\.runtimeKind === ["']store-or-standalone["']/);
  assert.match(flag, /process\.env\.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED === ["']1["']/);
  assert.match(flag, /if \(isGoodsEvidenceBlockedByStoreRuntime\(\)\) return false/);
  console.log("store-runtime block remains; public env === \"1\" is not sufficient");

  const legal = readRepo("src/config/legal.ts");
  assert.match(legal, /LEGAL_EFFECTIVE_DATE = "2026-07-27"/);
  console.log("legal date 2026-07-27");

  const liveStorage = readRepo("storage.rules");
  const liveFirestore = readRepo("firestore.rules");
  assert.doesNotMatch(liveStorage, /grinEvidence/);
  assert.doesNotMatch(liveFirestore, /goodsEvidence/);
  console.log("live Rules: no grinEvidence / goodsEvidence");

  const names = readRepo("src/services/grin/transport/callableNames.ts");
  assert.match(names, /GRIN_BEGIN_EVIDENCE_CALLABLE = "grinBeginEvidenceUpload"/);
  assert.doesNotMatch(names, /grinBeginEvidence"/);
  const packetA = readRepo("docs/release/packets/A_GRIN_BACKEND_EXPORTS_UNDEPLOYED.md");
  assert.match(packetA, /grinBeginEvidenceUpload/);
  assert.match(packetA, /Not `grinBeginEvidence`/);
  const packetB = readRepo("docs/release/packets/B_INTERNAL_TESTING_ADMISSION.md");
  assert.match(packetB, /production-profile AAB/);
  assert.match(packetB, /APK/);
  assert.match(packetB, /no trustworthy Play-track signal inside the app/);
  assert.match(packetB, /does \*\*not\*\* remove the store-runtime/);
  console.log("Packets A/B: grinBeginEvidenceUpload; Internal Testing AAB vs separate APK; no in-app Play-track; store-runtime unchanged");

  const outboxRaw = readRepo("src/services/grin/outbox/outbox.ts");
  const processAttachments = sliceProcessAttachments(outboxRaw);
  assert.match(processAttachments, /confirmed = await this\.readValidatedConfirmation\(session, workerId, snapshot\)/);
  assert.match(processAttachments, /const afterRead = this\.skipStaleCompletion\(session, workerId, snapshot\)/);
  assert.match(processAttachments, /confirmationPending \? "confirmation_refresh"/);
  assert.match(processAttachments, /pending \|\| confirmationPending \? "attachment_pending" : "issued"/);
  assert.match(processAttachments, /confirmed,/);
  assert.match(processAttachments, /Originals remain durable when confirmation refresh fails/);
  const writeCall = stripComments(readRepo("src/services/grin/outbox/outbox.ts"));
  assert.match(writeCall, /if \(args\.confirmed\) \{\s*this\.upsertConfirmedProjection/);
  assert.match(writeCall, /if \(current\.eventVersion > confirmed\.eventVersion\) return/);
  assert.match(writeCall, /if \(current\.eventVersion === confirmed\.eventVersion\) return/);
  const parser = readRepo("src/services/grin/outbox/confirmedProjection.ts");
  assert.match(parser, /Do not invent original \/ events \/ effective/);
  assert.match(parser, /eventVersion: raw\.eventVersion/);
  assert.doesNotMatch(parser, /eventVersion \+ 1/);
  console.log("processAttachments: readValidatedConfirmation after durables; skipStaleCompletion after await; confirmation_refresh recoverable; parse/upsert do not invent versions");

  const pack = readRepo("tools/goods-evidence-emulator/pack-complete.emulator.test.ts");
  assert.doesNotMatch(pack, /persistConfirmedProjection/);
  assert.doesNotMatch(pack, /markVerifiedDescriptor/);
  assert.doesNotMatch(pack, /expectedVersion/);
  assert.match(pack, /failConfirmAfterUploadOnce/);
  assert.match(pack, /getConfirmedProjection/);
  assert.match(pack, /GRIN_READ_CALLABLE/);
  assert.match(pack, /Unset hosts are not a pass/);
  const evidence = stripComments(readRepo("src/services/grin/transport/evidenceTransport.ts"));
  assert.doesNotMatch(evidence, /readAsStringAsync/);
  assert.doesNotMatch(evidence, /\batob\b/);
  const factory = evidence.slice(evidence.indexOf("export function createFirebaseJsGrinEvidenceTransport"));
  assert.doesNotMatch(factory.slice(0, 500), /readLocalBytes/);
  assert.match(factory.slice(0, 500), /readPrefix:\s*defaultReadPrefix/);
  assert.match(evidence, /readPrefixFromHandle/);
  console.log("pack-complete: no persistConfirmedProjection / markVerifiedDescriptor / expectedVersion; production transport omits full-file base64");

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

  console.log("wave2evidence-confirmation-refresh.ts: ok (inspection; not Wave 2 acceptance)");
}

void main();
