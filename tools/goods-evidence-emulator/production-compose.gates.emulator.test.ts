/**
 * Production composition gates through the isolated Functions emulator.
 * Proves createProductionGrinCallables (not a parallel tools-only adapter).
 *
 * Label: EMULATOR / not live deploy / not NATIVE_DEVICE / not live IAM.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithCustomToken, signOut } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { connectStorageEmulator, getStorage } from "firebase/storage";

import { freezeCommand } from "../../src/goodsEvidence/command";
import { sampleRegisterBody } from "../../src/goodsEvidence/testFixtures";
import { putReservedObjectWithJsStorage } from "../../src/services/grin/transport/evidenceTransport";
import {
  GRIN_BEGIN_EVIDENCE_CALLABLE,
  GRIN_MUTATE_CALLABLE,
  GRIN_READ_CALLABLE,
  GRIN_RECONCILE_CALLABLE,
  GRIN_REGISTER_CALLABLE,
  GRIN_RESERVE_EVIDENCE_CALLABLE,
  GRIN_UPLOAD_EVIDENCE_CALLABLE,
} from "../../src/services/grin/transport/callableNames";

const PROJECT_ID = "demo-vyaamikk-grin-t1";
const STORAGE_BUCKET = `${PROJECT_ID}.appspot.com`;
const REGION = "asia-south1";
const OWNER = "owner_prod_gates";
const OTHER = "other_prod_gates";
const INACTIVE = "inactive_prod_gates";
const PENDING = "pending_prod_gates";
const LEDGER = "ledger_prod_gates";
const OTHER_LEDGER = "ledger_other_gates";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} required (firebase emulators:exec). Unset hosts are not a pass.`);
  }
  return value;
}

function splitHostPort(raw: string, fallbackPort: number): { host: string; port: number } {
  const trimmed = raw.replace(/^https?:\/\//, "");
  const [host, portText] = trimmed.split(":");
  const port = portText ? Number(portText) : fallbackPort;
  if (!host || !Number.isInteger(port)) {
    throw new Error(`invalid emulator host ${raw}`);
  }
  return { host, port };
}

function asRecord(value: unknown): Record<string, unknown> {
  assert.equal(value != null && typeof value === "object", true);
  return value as Record<string, unknown>;
}

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const composeSrc = readFileSync(join(here, "functions-entry/compose.ts"), "utf8");
  const productionSrc = readFileSync(
    join(here, "../../functions/src/goodsEvidence/productionCompose.ts"),
    "utf8"
  );
  assert.match(composeSrc, /createProductionGrinCallables as createIsolatedGrinCallables/);
  assert.match(productionSrc, /GoodsEvidenceRegisterAdapter/);
  assert.match(productionSrc, /GoodsEvidenceStorageAdapter/);
  assert.match(productionSrc, /wrapAdminBlobStore/);
  assert.match(productionSrc, /MAX_PDF_ORIGINAL_BYTES/);
  assert.match(productionSrc, /async open\(path, generation\)/);
  assert.match(productionSrc, /getStorage\(binding\.app\)\.bucket\(binding\.storageBucket\)/);
  assert.match(productionSrc, /resolveGrinAdminBinding/);
  assert.doesNotMatch(productionSrc, /from ["'][^"']*tools\//);

  const authHost = requireEnv("FIREBASE_AUTH_EMULATOR_HOST");
  requireEnv("FIRESTORE_EMULATOR_HOST");
  requireEnv("FIREBASE_STORAGE_EMULATOR_HOST");
  const functionsBind =
    process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST ?? process.env.FUNCTIONS_EMULATOR_HOST ?? "127.0.0.1:5002";
  const functions = splitHostPort(functionsBind, 5002);
  const auth = splitHostPort(authHost, 9100);
  const storage = splitHostPort(requireEnv("FIREBASE_STORAGE_EMULATOR_HOST"), 9201);

  const functionsRequire = createRequire(join(here, "../../functions/package.json"));
  const adminApp = functionsRequire("firebase-admin/app") as typeof import("firebase-admin/app");
  const adminAuth = functionsRequire("firebase-admin/auth") as typeof import("firebase-admin/auth");
  const adminFirestore = functionsRequire("firebase-admin/firestore") as typeof import("firebase-admin/firestore");
  const adminStorage = functionsRequire("firebase-admin/storage") as typeof import("firebase-admin/storage");

  if (adminApp.getApps().length === 0) {
    adminApp.initializeApp({ projectId: PROJECT_ID, storageBucket: STORAGE_BUCKET });
  }
  const db = adminFirestore.getFirestore();
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    // once
  }
  const bucket = adminStorage.getStorage().bucket(STORAGE_BUCKET);

  async function seedUser(
    uid: string,
    status: string,
    admission: "allow" | "deny" | "missing",
    ledgerId = LEDGER
  ): Promise<void> {
    await db.doc(`users/${uid}`).set({ uid, status });
    await db.doc(`users/${uid}/goodsEvidenceLedgers/${ledgerId}`).set({
      ownerUid: uid,
      status: "active",
    });
    const admissionRef = db.doc(`users/${uid}/goodsEvidenceAdmission/runtime`);
    if (admission === "missing") {
      await admissionRef.delete().catch(() => undefined);
    } else {
      await admissionRef.set({
        schemaVersion: 1,
        newCommands: admission,
        reconciliation: admission,
      });
    }
  }

  await seedUser(OWNER, "active", "allow");
  await seedUser(OTHER, "active", "allow", OTHER_LEDGER);
  await seedUser(INACTIVE, "inactive", "allow");
  await seedUser(PENDING, "pending_deletion", "allow");

  const app = initializeApp(
    {
      apiKey: "demo-api-key",
      authDomain: `${PROJECT_ID}.firebaseapp.com`,
      projectId: PROJECT_ID,
      storageBucket: STORAGE_BUCKET,
      appId: "demo-app",
    },
    "grin-prod-gates"
  );
  const jsAuth = getAuth(app);
  connectAuthEmulator(jsAuth, `http://${auth.host}:${auth.port}`, { disableWarnings: true });
  const fns = getFunctions(app, REGION);
  connectFunctionsEmulator(fns, functions.host, functions.port);
  const jsStorage = getStorage(app);
  connectStorageEmulator(jsStorage, storage.host, storage.port);

  async function callAs(uid: string | null, name: string, data: unknown): Promise<unknown> {
    if (uid == null) {
      await signOut(jsAuth);
    } else {
      const token = await adminAuth.getAuth().createCustomToken(uid);
      await signInWithCustomToken(jsAuth, token);
    }
    const callable = httpsCallable(fns, name);
    const result = await callable(data);
    return result.data;
  }

  function registerEnvelope(commandId: string, receiptId: string, extra?: string) {
    const frozen = freezeCommand({
      commandId,
      type: "registerGoodsReceipt",
      ownerUid: OWNER,
      ledgerId: LEDGER,
      body: sampleRegisterBody({
        receiptId,
        ...(extra ? { capturedAtClientUtc: "2026-09-28T04:01:00.000Z" } : {}),
      }),
    });
    return {
      envelope: {
        commandId: frozen.commandId,
        type: "registerGoodsReceipt",
        ledgerId: frozen.ledgerId,
        body: frozen.body,
      },
      digest: frozen.digest,
      frozen,
    };
  }

  const unauth = asRecord(await callAs(null, GRIN_REGISTER_CALLABLE, registerEnvelope("commandg1unauth", "receiptg1unauth")));
  assert.equal(unauth.ok, false);
  assert.equal(unauth.code, "unauthenticated");

  const inactive = asRecord(await callAs(INACTIVE, GRIN_REGISTER_CALLABLE, registerEnvelope("commandg1inact", "receiptg1inact")));
  assert.equal(inactive.ok, false);
  assert.equal(inactive.code, "forbidden");

  const pending = asRecord(await callAs(PENDING, GRIN_REGISTER_CALLABLE, registerEnvelope("commandg1pend", "receiptg1pend")));
  assert.equal(pending.ok, false);
  assert.equal(pending.code, "forbidden");

  await seedUser("denied_prod_gates", "active", "deny");
  const denied = asRecord(
    await callAs("denied_prod_gates", GRIN_REGISTER_CALLABLE, {
      envelope: {
        commandId: "commandg1denyxx",
        type: "registerGoodsReceipt",
        ledgerId: LEDGER,
        body: sampleRegisterBody({ receiptId: "receiptg1denyxx" }),
      },
    })
  );
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "policy_denied");

  const first = registerEnvelope("commandg1firstx", "receiptg1first");
  const registered = asRecord(await callAs(OWNER, GRIN_REGISTER_CALLABLE, first));
  assert.equal(registered.ok, true);
  assert.equal(registered.replayed, false);
  const serial = registered.serial;
  assert.equal(typeof serial, "number");

  const replay = asRecord(await callAs(OWNER, GRIN_REGISTER_CALLABLE, first));
  assert.equal(replay.ok, true);
  assert.equal(replay.replayed, true);
  assert.equal(replay.serial, serial);

  const lostResponse = asRecord(
    await callAs(OWNER, GRIN_RECONCILE_CALLABLE, {
      ledgerId: LEDGER,
      commandId: first.frozen.commandId,
    })
  );
  assert.equal(lostResponse.ok, true);
  assert.equal(lostResponse.replayed, true);
  assert.equal(lostResponse.serial, serial);

  const conflictBody = registerEnvelope("commandg1firstx", "receiptg1first", "changed");
  const conflict = asRecord(await callAs(OWNER, GRIN_REGISTER_CALLABLE, conflictBody));
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, "digest_conflict");

  const second = registerEnvelope("commandg1second", "receiptg1second");
  const registered2 = asRecord(await callAs(OWNER, GRIN_REGISTER_CALLABLE, second));
  assert.equal(registered2.ok, true);
  assert.equal(registered2.serial, Number(serial) + 1);

  const [concA, concB] = await Promise.all([
    callAs(OWNER, GRIN_REGISTER_CALLABLE, registerEnvelope("commandg1concA", "receiptg1concA")),
    callAs(OWNER, GRIN_REGISTER_CALLABLE, registerEnvelope("commandg1concB", "receiptg1concB")),
  ]);
  const concurrentA = asRecord(concA);
  const concurrentB = asRecord(concB);
  assert.equal(concurrentA.ok, true);
  assert.equal(concurrentB.ok, true);
  assert.notEqual(concurrentA.serial, concurrentB.serial);
  assert.equal(concurrentA.replayed, false);
  assert.equal(concurrentB.replayed, false);

  await seedUser("missing_adm_gates", "active", "missing");
  const missingAdmission = asRecord(
    await callAs("missing_adm_gates", GRIN_REGISTER_CALLABLE, {
      envelope: {
        commandId: "commandg1missxx",
        type: "registerGoodsReceipt",
        ledgerId: LEDGER,
        body: sampleRegisterBody({ receiptId: "receiptg1missxx" }),
      },
    })
  );
  assert.equal(missingAdmission.ok, false);
  assert.equal(missingAdmission.code, "policy_denied");

  await seedUser("malformed_adm_g", "active", "allow");
  await db.doc(`users/malformed_adm_g/goodsEvidenceAdmission/runtime`).set({
    schemaVersion: 1,
    newCommands: "ALLOW",
    reconciliation: "allow",
  });
  const malformed = asRecord(
    await callAs("malformed_adm_g", GRIN_REGISTER_CALLABLE, {
      envelope: {
        commandId: "commandg1malform",
        type: "registerGoodsReceipt",
        ledgerId: LEDGER,
        body: sampleRegisterBody({ receiptId: "receiptg1malform" }),
      },
    })
  );
  assert.equal(malformed.ok, false);
  assert.equal(malformed.code, "policy_denied");

  const cross = asRecord(
    await callAs(OTHER, GRIN_READ_CALLABLE, { ledgerId: LEDGER, receiptId: "receiptg1first" })
  );
  assert.equal(cross.ok, false);
  assert.ok(cross.code === "forbidden" || cross.code === "policy_denied" || cross.code === "not_found");

  const crossLedger = asRecord(
    await callAs(OWNER, GRIN_READ_CALLABLE, { ledgerId: OTHER_LEDGER, receiptId: "receiptg1first" })
  );
  assert.equal(crossLedger.ok, false);
  assert.ok(crossLedger.code === "forbidden" || crossLedger.code === "policy_denied" || crossLedger.code === "not_found");

  const pdf = new Uint8Array(64);
  pdf.set([0x25, 0x50, 0x44, 0x46]);
  pdf.fill(0x41, 4);
  const independent = createHash("sha256").update(pdf).digest("hex");
  const reserve = asRecord(
    await callAs(OWNER, GRIN_RESERVE_EVIDENCE_CALLABLE, {
      ledgerId: LEDGER,
      receiptId: "receiptg1first",
      evidenceId: "evidenceg1okxx",
      category: "invoice",
      mime: "application/pdf",
      claimedSha256: independent,
      claimedByteSize: pdf.byteLength,
    })
  );
  assert.equal(reserve.ok, true);
  const storagePath = String(reserve.storagePath);
  const began = asRecord(
    await callAs(OWNER, GRIN_BEGIN_EVIDENCE_CALLABLE, {
      ledgerId: LEDGER,
      receiptId: "receiptg1first",
      evidenceId: "evidenceg1okxx",
    })
  );
  assert.equal(began.ok, true);
  await putReservedObjectWithJsStorage({
    storage: jsStorage,
    storagePath,
    bytes: pdf,
    contentType: "application/pdf",
  });
  const verified = asRecord(
    await callAs(OWNER, GRIN_UPLOAD_EVIDENCE_CALLABLE, {
      ledgerId: LEDGER,
      receiptId: "receiptg1first",
      evidenceId: "evidenceg1okxx",
    })
  );
  assert.equal(verified.ok, true);
  assert.equal(verified.originalDurable, true);
  assert.equal(verified.actualSha256, independent);
  const generation = String(verified.generation);
  assert.notEqual(generation, "verified");

  const wrongHashPdf = new Uint8Array(pdf);
  wrongHashPdf[8] = 0x99;
  const wrongClaim = createHash("sha256").update(wrongHashPdf).digest("hex");
  const badReserve = asRecord(
    await callAs(OWNER, GRIN_RESERVE_EVIDENCE_CALLABLE, {
      ledgerId: LEDGER,
      receiptId: "receiptg1first",
      evidenceId: "evidenceg1badh",
      category: "invoice",
      mime: "application/pdf",
      claimedSha256: wrongClaim,
      claimedByteSize: pdf.byteLength,
    })
  );
  assert.equal(badReserve.ok, true);
  await callAs(OWNER, GRIN_BEGIN_EVIDENCE_CALLABLE, {
    ledgerId: LEDGER,
    receiptId: "receiptg1first",
    evidenceId: "evidenceg1badh",
  });
  await putReservedObjectWithJsStorage({
    storage: jsStorage,
    storagePath: String(badReserve.storagePath),
    bytes: pdf,
    contentType: "application/pdf",
  });
  const badHash = asRecord(
    await callAs(OWNER, GRIN_UPLOAD_EVIDENCE_CALLABLE, {
      ledgerId: LEDGER,
      receiptId: "receiptg1first",
      evidenceId: "evidenceg1badh",
    })
  );
  assert.equal(badHash.originalDurable, false);

  const wrongSizeReserve = asRecord(
    await callAs(OWNER, GRIN_RESERVE_EVIDENCE_CALLABLE, {
      ledgerId: LEDGER,
      receiptId: "receiptg1first",
      evidenceId: "evidenceg1size",
      category: "invoice",
      mime: "application/pdf",
      claimedSha256: independent,
      claimedByteSize: pdf.byteLength + 8,
    })
  );
  assert.equal(wrongSizeReserve.ok, true);
  await callAs(OWNER, GRIN_BEGIN_EVIDENCE_CALLABLE, {
    ledgerId: LEDGER,
    receiptId: "receiptg1first",
    evidenceId: "evidenceg1size",
  });
  await putReservedObjectWithJsStorage({
    storage: jsStorage,
    storagePath: String(wrongSizeReserve.storagePath),
    bytes: pdf,
    contentType: "application/pdf",
  });
  const wrongSize = asRecord(
    await callAs(OWNER, GRIN_UPLOAD_EVIDENCE_CALLABLE, {
      ledgerId: LEDGER,
      receiptId: "receiptg1first",
      evidenceId: "evidenceg1size",
    })
  );
  assert.equal(wrongSize.originalDurable, false);

  const genReserve = asRecord(
    await callAs(OWNER, GRIN_RESERVE_EVIDENCE_CALLABLE, {
      ledgerId: LEDGER,
      receiptId: "receiptg1first",
      evidenceId: "evidenceg1genx",
      category: "invoice",
      mime: "application/pdf",
      claimedSha256: independent,
      claimedByteSize: pdf.byteLength,
    })
  );
  assert.equal(genReserve.ok, true);
  await callAs(OWNER, GRIN_BEGIN_EVIDENCE_CALLABLE, {
    ledgerId: LEDGER,
    receiptId: "receiptg1first",
    evidenceId: "evidenceg1genx",
  });
  const genPath = String(genReserve.storagePath);
  await putReservedObjectWithJsStorage({
    storage: jsStorage,
    storagePath: genPath,
    bytes: pdf,
    contentType: "application/pdf",
  });
  const [beforeMeta] = await bucket.file(genPath).getMetadata();
  const replaced = new Uint8Array(pdf);
  replaced[8] = 0x77;
  await bucket.file(genPath).save(Buffer.from(replaced), {
    contentType: "application/pdf",
    resumable: false,
    metadata: { contentType: "application/pdf" },
  });
  const [afterMeta] = await bucket.file(genPath).getMetadata();
  assert.notEqual(String(afterMeta.generation), String(beforeMeta.generation));
  const wrongGeneration = asRecord(
    await callAs(OWNER, GRIN_UPLOAD_EVIDENCE_CALLABLE, {
      ledgerId: LEDGER,
      receiptId: "receiptg1first",
      evidenceId: "evidenceg1genx",
    })
  );
  assert.equal(wrongGeneration.originalDurable, false);

  const wrongPathReserve = asRecord(
    await callAs(OWNER, GRIN_RESERVE_EVIDENCE_CALLABLE, {
      ledgerId: LEDGER,
      receiptId: "receiptg1first",
      evidenceId: "evidenceg1path",
      category: "invoice",
      mime: "application/pdf",
      claimedSha256: independent,
      claimedByteSize: pdf.byteLength,
    })
  );
  assert.equal(wrongPathReserve.ok, true);
  await callAs(OWNER, GRIN_BEGIN_EVIDENCE_CALLABLE, {
    ledgerId: LEDGER,
    receiptId: "receiptg1first",
    evidenceId: "evidenceg1path",
  });
  try {
    await putReservedObjectWithJsStorage({
      storage: jsStorage,
      storagePath: `${String(wrongPathReserve.storagePath)}_wrong`,
      bytes: pdf,
      contentType: "application/pdf",
    });
    throw new Error("client PUT to unbound path must be denied by Storage Rules");
  } catch (err) {
    const code = typeof err === "object" && err && "code" in err ? String((err as { code: unknown }).code) : "";
    assert.equal(code, "storage/unauthorized");
  }
  const wrongPath = asRecord(
    await callAs(OWNER, GRIN_UPLOAD_EVIDENCE_CALLABLE, {
      ledgerId: LEDGER,
      receiptId: "receiptg1first",
      evidenceId: "evidenceg1path",
    })
  );
  assert.equal(wrongPath.originalDurable, false);

  const otherReceiptReserve = asRecord(
    await callAs(OWNER, GRIN_RESERVE_EVIDENCE_CALLABLE, {
      ledgerId: LEDGER,
      receiptId: "receiptg1second",
      evidenceId: "evidenceg1assoc",
      category: "invoice",
      mime: "application/pdf",
      claimedSha256: independent,
      claimedByteSize: pdf.byteLength,
    })
  );
  assert.equal(otherReceiptReserve.ok, true);
  await callAs(OWNER, GRIN_BEGIN_EVIDENCE_CALLABLE, {
    ledgerId: LEDGER,
    receiptId: "receiptg1second",
    evidenceId: "evidenceg1assoc",
  });
  await putReservedObjectWithJsStorage({
    storage: jsStorage,
    storagePath: String(otherReceiptReserve.storagePath),
    bytes: pdf,
    contentType: "application/pdf",
  });
  const wrongAssociation = asRecord(
    await callAs(OWNER, GRIN_UPLOAD_EVIDENCE_CALLABLE, {
      ledgerId: LEDGER,
      receiptId: "receiptg1first",
      evidenceId: "evidenceg1assoc",
    })
  );
  assert.equal(wrongAssociation.ok === true && wrongAssociation.originalDurable === true, false);

  const linkedOriginalPath = storagePath;
  const [linkedExists] = await bucket.file(linkedOriginalPath).exists();
  assert.equal(linkedExists, true);

  await db.doc(`users/${OWNER}/goodsEvidenceAdmission/runtime`).set({
    schemaVersion: 1,
    newCommands: "deny",
    reconciliation: "allow",
  });
  const afterDeny = asRecord(await callAs(OWNER, GRIN_REGISTER_CALLABLE, registerEnvelope("commandg1afterd", "receiptg1afterd")));
  assert.equal(afterDeny.ok, false);
  assert.equal(afterDeny.code, "policy_denied");

  const mutateWhileDenied = asRecord(
    await callAs(OWNER, GRIN_MUTATE_CALLABLE, {
      envelope: {
        commandId: "commandg1amend1",
        type: "amendFields",
        ledgerId: LEDGER,
        body: {
          receiptId: "receiptg1first",
          expectedVersion: 1,
          fields: { remarks: { kind: "text", text: "should deny newCommands" } },
        },
      },
    })
  );
  assert.equal(mutateWhileDenied.ok, false);
  assert.equal(mutateWhileDenied.code, "policy_denied");

  const reserveWhileDenied = asRecord(
    await callAs(OWNER, GRIN_RESERVE_EVIDENCE_CALLABLE, {
      ledgerId: LEDGER,
      receiptId: "receiptg1first",
      evidenceId: "evidenceg1deny",
      category: "invoice",
      mime: "application/pdf",
      claimedSha256: independent,
      claimedByteSize: pdf.byteLength,
    })
  );
  assert.equal(reserveWhileDenied.ok, false);

  const [originalSurvived] = await bucket.file(linkedOriginalPath).exists();
  assert.equal(originalSurvived, true);
  const receiptSnap = await db.doc(`users/${OWNER}/goodsEvidenceLedgers/${LEDGER}/receipts/receiptg1first`).get();
  assert.equal(receiptSnap.exists, true);

  const reconcileWhileDenied = asRecord(
    await callAs(OWNER, GRIN_RECONCILE_CALLABLE, {
      ledgerId: LEDGER,
      commandId: first.frozen.commandId,
    })
  );
  assert.equal(reconcileWhileDenied.ok, true);
  assert.equal(reconcileWhileDenied.serial, serial);

  console.log("production-compose.gates.emulator.test.ts: ok (EMULATOR / PRODUCTION_ADMIN_COMPOSED)");
  console.log(
    "NOT_ESTABLISHED=live IAM conditions, Admin bypass of Rules, NATIVE_DEVICE, Play-installed; G1 readReceipt still requires newCommands=allow"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
