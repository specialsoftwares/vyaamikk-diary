/**
 * Team 5 PHASE 2 inspection of persistGrinOwnerSession production composition
 * at the corrected combined tree. Not a live callable. Not NATIVE_DEVICE.
 *
 * Does not mock httpsCallable. Does not dispatch the production JS ports
 * (that would hit live Firebase). Evidence durability of the wired JS
 * transport is the isolated Functions emulator round-trip.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isWave1OriginalCategory, WAVE1_ORIGINAL_CATEGORIES } from "@/goodsEvidence/evidence";
import { sampleRegisterBody } from "@/goodsEvidence/testFixtures";
import { openHostSqlite, SQLITE_HOST, type HostSqlite } from "@/services/grin/outbox/hostSqlite";
import { SQLITE_HOST_NOT_NATIVE_DEVICE } from "@/services/grin/outbox/types";
import type { GrinOutbox } from "@/services/grin/outbox/outbox";
import {
  GRIN_APPLICATION_EVIDENCE_PORT_LABEL,
  GRIN_APPLICATION_SERVER_PORT_LABEL,
  getGrinApplicationRepository,
  persistGrinOwnerSession,
  resetGrinApplicationRepositoryForTests,
  retireGrinOwnerSession,
  setGrinApplicationDbFactoryForTests,
  startGrinOwnerSession,
} from "@/services/grin/repository";
import type { GrinApplicationRepository } from "@/services/grin/repository/GrinApplicationRepository";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

type PortShape = {
  portKind?: string;
  transportKind?: string;
  compositionLabel?: string;
};

function outboxOf(repo: GrinApplicationRepository): GrinOutbox {
  const box = (repo as unknown as { outbox: GrinOutbox }).outbox;
  assert.ok(box, "production repository must hold the persistGrinOwnerSession outbox");
  return box;
}

function main(): void {
  const indexSrc = fs.readFileSync(path.join(ROOT, "functions/src/index.ts"), "utf8");
  assert.doesNotMatch(indexSrc, /goodsEvidence/);
  assert.doesNotMatch(indexSrc, /grinRegister|grinReserve|grinUpload|grinMutate|createComposedGrinCallables/);
  assert.doesNotMatch(indexSrc, /from ["']\.\/goodsEvidence/);
  console.log("HOLD functions/src/index.ts: no GRIN export");

  const pickerSrc = fs.readFileSync(path.join(ROOT, "src/screens/grin/grinOriginalPicker.ts"), "utf8");
  assert.doesNotMatch(pickerSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""), /quality:\s*0\.8/);
  assert.match(pickerSrc, /osConversionOccurred: "unknown"/);
  console.log("E4 picker quality 0.8 absent; osConversionOccurred unknown in production picker");

  const packInputs = fs.readFileSync(path.join(ROOT, "src/goodsEvidence/evidencePackInputs.ts"), "utf8");
  const packHardcodesFalse = /osConversionOccurred:\s*false/.test(packInputs);
  console.log(`E4 pack assembler osConversionOccurred hardcoded false=${String(packHardcodesFalse)}`);

  const bindingSrc = fs.readFileSync(path.join(ROOT, "src/services/grin/repository/appBinding.ts"), "utf8");
  assert.match(bindingSrc, /server:\s*serverPortFactory\(\)/);
  assert.match(bindingSrc, /evidence:\s*evidencePortFactory\(\)/);
  assert.match(bindingSrc, /createFirebaseJsGrinTransport/);
  assert.match(bindingSrc, /createFirebaseJsGrinEvidenceTransport/);
  assert.doesNotMatch(bindingSrc, /localOriginalHasher/);
  console.log("persistGrinOwnerSession source wires both factories; no localOriginalHasher");

  const required = ["stock_accounting", "payment", "gst", "return_document"] as const;
  for (const category of required) {
    assert.equal(isWave1OriginalCategory(category), true, category);
    assert.equal((WAVE1_ORIGINAL_CATEGORIES as readonly string[]).includes(category), true, category);
  }
  console.log(`E5 attach categories include ${required.join(",")}`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grin-t5-rereview-"));
  const dbPath = path.join(tmp, "rereview.sqlite");
  let db: HostSqlite | null = null;
  try {
    db = openHostSqlite(dbPath);
    assert.equal(db.executionLabel, SQLITE_HOST);
    console.log(`SQLITE_EXECUTION=${SQLITE_HOST}`);
    console.log(`NATIVE_DEVICE=not_claimed (${SQLITE_HOST_NOT_NATIVE_DEVICE})`);
    console.log(`HOST_FILESYSTEM=${os.platform()} ${tmp}`);

    resetGrinApplicationRepositoryForTests();
    setGrinApplicationDbFactoryForTests(() => db as HostSqlite);

    assert.equal(persistGrinOwnerSession(), null, "persist without live token must not start a session");

    const started = startGrinOwnerSession("owner_e1_rereview");
    const liveRepo = getGrinApplicationRepository(started.ownerUid, started.dispatchGeneration);
    const box = outboxOf(liveRepo);
    const server = (box as unknown as { server: PortShape }).server;
    const evidence = (box as unknown as { evidence: PortShape | null }).evidence;
    const hasher = (box as unknown as { localOriginalHasher: unknown }).localOriginalHasher;

    assert.ok(evidence, "production persistGrinOwnerSession must construct evidence port");
    assert.notEqual(evidence, null);
    assert.equal(server.portKind, "INJECTED");
    assert.equal(server.transportKind, "FIREBASE_JS_HTTPS_CALLABLE");
    assert.equal(server.compositionLabel, "not live deploy");
    assert.equal(evidence.portKind, "INJECTED");
    assert.equal(evidence.transportKind, "FIREBASE_JS_HTTPS_CALLABLE");
    assert.equal(evidence.compositionLabel, "not live deploy; fail-closed when unexported");
    assert.equal(hasher, null, "production binding still has no localOriginalHasher");
    assert.equal(
      GRIN_APPLICATION_SERVER_PORT_LABEL,
      "INJECTED / FIREBASE_JS_HTTPS_CALLABLE. Not live deploy."
    );
    assert.equal(
      GRIN_APPLICATION_EVIDENCE_PORT_LABEL,
      "INJECTED / FIREBASE_JS_HTTPS_CALLABLE evidence. Not live deploy; fail-closed when unexported."
    );
    console.log(
      `E1 persistGrinOwnerSession wired server=${String(server.compositionLabel)} evidence=${String(evidence.compositionLabel)} hasher=${String(hasher)}`
    );

    for (const category of required) {
      liveRepo.createQueued(sampleRegisterBody({ receiptId: `grcp_${category}` }));
      const attached = liveRepo.attachOriginal({
        receiptId: `grcp_${category}`,
        category,
        localPath: path.join(tmp, `${category}.pdf`),
        claimedSha256: "ab".repeat(32),
        byteSize: 32,
      });
      assert.equal(attached.originalDurable, false);
      assert.equal(attached.completeness, "not_complete");
    }
    console.log("E5 attachOriginal accepts stock_accounting/payment/gst/return_document; missing backend not success");

    retireGrinOwnerSession();
  } finally {
    try {
      db?.close();
    } catch {
      // ignore
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }

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
  console.log("E1 unset emulator hosts: failure (not counted as pass)");

  console.log("wave2evidence-e1-e5-rereview.ts: ok (inspection; not Wave 2 acceptance)");
}

main();
