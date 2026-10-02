/**
 * E1 round-trip: Firebase JS httpsCallable against the isolated Functions
 * emulator + Firestore + Storage. Does NOT mock httpsCallable.
 *
 * Injected boundaries (not a skip):
 * - Emulator hosts from firebase emulators:exec (Firestore 8090, Functions 5002,
 *   Storage 9201, Auth 9100). Unset hosts fail this test.
 * - GRIN_GOODS_EVIDENCE_FUNCTIONS=true on the emulator process only.
 * - Auth emulator custom token for the seeded uid.
 * - Admin seed of user/ledger/admission.
 * - Node readFile of the retained local original (test host filesystem).
 *   Production transport uses fetch / Expo FileSystem, not node:fs.
 *
 * Label: EMULATOR / not live deploy / not NATIVE_DEVICE.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithCustomToken } from "firebase/auth";
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
} from "firebase/functions";
import { connectStorageEmulator, getStorage } from "firebase/storage";

import { freezeCommand } from "../../src/goodsEvidence/command";
import { sampleRegisterBody } from "../../src/goodsEvidence/testFixtures";
import { createFirebaseGrinEvidenceTransport, putReservedObjectWithJsStorage } from "../../src/services/grin/transport/evidenceTransport";
import { createFirebaseGrinTransport } from "../../src/services/grin/transport/firebaseTransport";
import {
  GRIN_BEGIN_EVIDENCE_CALLABLE,
  GRIN_READ_CALLABLE,
  GRIN_REGISTER_CALLABLE,
  GRIN_RESERVE_EVIDENCE_CALLABLE,
  GRIN_UPLOAD_EVIDENCE_CALLABLE,
} from "../../src/services/grin/transport/callableNames";

const PROJECT_ID = "demo-vyaamikk-grin-t1";
const STORAGE_BUCKET = `${PROJECT_ID}.appspot.com`;
const OWNER = "owner_e1_roundtrip";
const LEDGER = "ledger_e1_roundtrip";
const RECEIPT = "receipt_e1_rt";
const COMMAND = "command_e1_rt";
const EVIDENCE = "evidence_e1_rt";
const REGION = "asia-south1";

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

async function main(): Promise<void> {
  const firestoreHost = requireEnv("FIRESTORE_EMULATOR_HOST");
  const authHost = requireEnv("FIREBASE_AUTH_EMULATOR_HOST");
  const storageHost = requireEnv("FIREBASE_STORAGE_EMULATOR_HOST");
  void firestoreHost;
  const functionsBind = process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST
    ?? process.env.FUNCTIONS_EMULATOR_HOST
    ?? "127.0.0.1:5002";
  const functions = splitHostPort(functionsBind, 5002);
  const auth = splitHostPort(authHost, 9100);
  const storage = splitHostPort(storageHost, 9201);

  const here = dirname(fileURLToPath(import.meta.url));
  const functionsRequire = createRequire(join(here, "../../functions/package.json"));
  const adminApp = functionsRequire("firebase-admin/app") as typeof import("firebase-admin/app");
  const adminAuth = functionsRequire("firebase-admin/auth") as typeof import("firebase-admin/auth");
  const adminFirestore = functionsRequire("firebase-admin/firestore") as typeof import("firebase-admin/firestore");

  if (adminApp.getApps().length === 0) {
    adminApp.initializeApp({ projectId: PROJECT_ID, storageBucket: STORAGE_BUCKET });
  }
  const db = adminFirestore.getFirestore();
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    // settings may only be applied once
  }
  await db.doc(`users/${OWNER}`).set({ uid: OWNER, status: "active" });
  await db.doc(`users/${OWNER}/goodsEvidenceLedgers/${LEDGER}`).set({
    ownerUid: OWNER,
    status: "active",
  });
  await db.doc(`users/${OWNER}/goodsEvidenceAdmission/runtime`).set({
    schemaVersion: 1,
    newCommands: "allow",
    reconciliation: "allow",
  });
  const customToken = await adminAuth.getAuth().createCustomToken(OWNER);

  const app = initializeApp(
    {
      apiKey: "demo-api-key",
      authDomain: `${PROJECT_ID}.firebaseapp.com`,
      projectId: PROJECT_ID,
      storageBucket: STORAGE_BUCKET,
      appId: "demo-app",
    },
    "grin-t1-e1-roundtrip"
  );
  const jsAuth = getAuth(app);
  connectAuthEmulator(jsAuth, `http://${auth.host}:${auth.port}`, { disableWarnings: true });
  const fns = getFunctions(app, REGION);
  connectFunctionsEmulator(fns, functions.host, functions.port);
  const jsStorage = getStorage(app);
  connectStorageEmulator(jsStorage, storage.host, storage.port);
  await signInWithCustomToken(jsAuth, customToken);
  assert.equal(jsAuth.currentUser?.uid, OWNER);

  async function realCall(name: string, data: unknown): Promise<unknown> {
    const callable = httpsCallable(fns, name);
    const result = await callable(data);
    return result.data;
  }

  const server = createFirebaseGrinTransport({
    call: realCall,
    currentAuth: () => {
      const uid = jsAuth.currentUser?.uid;
      return uid ? { uid } : null;
    },
  });

  const frozen = freezeCommand({
    commandId: COMMAND,
    type: "registerGoodsReceipt",
    ownerUid: OWNER,
    ledgerId: LEDGER,
    body: sampleRegisterBody({ receiptId: RECEIPT }),
  });
  const registered = await server.register({
    uid: OWNER,
    envelope: {
      commandId: frozen.commandId,
      type: "registerGoodsReceipt",
      ledgerId: frozen.ledgerId,
      body: frozen.body,
    },
    digest: frozen.digest,
  });
  assert.equal(registered.ok, true, "httpsCallable register against isolated Functions emulator");
  if (!registered.ok) throw new Error("expected register");
  assert.equal(registered.receiptId, RECEIPT);

  const pdf = new Uint8Array(64);
  pdf.set([0x25, 0x50, 0x44, 0x46]);
  pdf.fill(0x41, 4);
  const independent = createHash("sha256").update(pdf).digest("hex");
  const dir = await mkdtemp(join(tmpdir(), "grin-e1-"));
  const localPath = join(dir, "original.pdf");
  await writeFile(localPath, pdf);

  const names: string[] = [];
  const evidence = createFirebaseGrinEvidenceTransport({
    currentAuth: () => {
      const uid = jsAuth.currentUser?.uid;
      return uid ? { uid } : null;
    },
    readLocalBytes: async (path) => {
      const buf = await readFile(path);
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    },
    putObject: async (input) => {
      return putReservedObjectWithJsStorage({
        storage: jsStorage,
        storagePath: input.storagePath,
        bytes: input.bytes,
        contentType: input.contentType,
      });
    },
    call: async (name, data) => {
      names.push(name);
      return realCall(name, data);
    },
  });

  const uploaded = await evidence.upload({
    uid: OWNER,
    ledgerId: LEDGER,
    receiptId: RECEIPT,
    evidenceId: EVIDENCE,
    role: "original",
    localPath,
    claimedSha256: independent,
    category: "invoice",
    sizeBytes: pdf.byteLength,
  });
  assert.equal(uploaded.ok, true, "round-trip upload must succeed after stored-byte verify");
  assert.equal(uploaded.originalDurable, true);
  assert.equal(uploaded.actualSha256, independent);
  assert.equal(uploaded.evidenceId, EVIDENCE);
  assert.equal(uploaded.receiptId, RECEIPT);
  assert.equal(uploaded.ledgerId, LEDGER);
  assert.equal(uploaded.category, "invoice");
  assert.notEqual(uploaded.generation, "verified");
  assert.equal(uploaded.generation == null, false);
  assert.ok(names.includes(GRIN_RESERVE_EVIDENCE_CALLABLE));
  assert.ok(names.includes(GRIN_BEGIN_EVIDENCE_CALLABLE));
  assert.ok(names.includes(GRIN_UPLOAD_EVIDENCE_CALLABLE));
  assert.equal(names.includes(GRIN_REGISTER_CALLABLE), false);

  const read = await realCall(GRIN_READ_CALLABLE, { ledgerId: LEDGER, receiptId: RECEIPT });
  assert.equal((read as { ok?: boolean }).ok, true);
  const events = (read as { confirmed: { events: Array<{ type: string }>; original: { remarks: { kind: string } } } })
    .confirmed;
  assert.equal(events.original.remarks.kind, "not_supplied");
  assert.equal(
    events.events.some((event) => event.type === "evidence_verified"),
    true,
    "G1 pointer must be appended after stored-byte verify"
  );

  console.log(
    "tools/goods-evidence-emulator/functions-roundtrip.emulator.test.ts: ok (EMULATOR httpsCallable / not live deploy)"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
