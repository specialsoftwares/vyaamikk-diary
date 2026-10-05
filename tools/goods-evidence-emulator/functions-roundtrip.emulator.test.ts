/**
 * E1 round-trip: Firebase JS httpsCallable against the isolated Functions
 * emulator + Firestore + Storage. Does NOT mock httpsCallable.
 *
 * Two proofs in this process:
 * 1. Direct createFirebaseGrinEvidenceTransport upload (callable wiring).
 * 2. persistGrinOwnerSession → processAttachments → the same real httpsCallable
 *    (app composition). Hasher is the production APP_FILESYSTEM factory.
 *
 * Injected boundaries (not a skip):
 * - Emulator hosts from firebase emulators:exec (Firestore 8090, Functions 5002,
 *   Storage 9201, Auth 9100). Unset hosts fail this test.
 * - GRIN_GOODS_EVIDENCE_FUNCTIONS=true on the emulator process only.
 * - Auth emulator custom token for the seeded uid.
 * - Admin seed of user/ledger/admission.
 * - SQLITE_HOST + HOST_FILESYSTEM retention chunks for the persist hasher.
 *   This emulator injects readLocalBytes. Production uses Expo FileHandle
 *   prefix + File Blob upload (not fetch/atob/readAsStringAsync).
 *
 * Label: EMULATOR / SQLITE_HOST / HOST_FILESYSTEM / not live deploy / not NATIVE_DEVICE.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
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
import { HASH_CHUNK_BYTES } from "../../src/goodsEvidence/evidence";
import { sampleRegisterBody } from "../../src/goodsEvidence/testFixtures";
import { openHostSqlite, SQLITE_HOST, type HostSqlite } from "../../src/services/grin/outbox/hostSqlite";
import type { GrinOutbox } from "../../src/services/grin/outbox/outbox";
import { APP_FILESYSTEM, SQLITE_HOST_NOT_NATIVE_DEVICE } from "../../src/services/grin/outbox/types";
import {
  GRIN_APPLICATION_LEDGER_ID,
  advanceGrinLiveToken,
  getGrinApplicationRepository,
  persistGrinOwnerSession,
  resetGrinApplicationRepositoryForTests,
  retireGrinOwnerSession,
  setGrinApplicationDbFactoryForTests,
  setGrinEvidencePortFactoryForTests,
  setGrinServerPortFactoryForTests,
} from "../../src/services/grin/repository";
import {
  resetGrinOriginalRetentionForTests,
  setGrinOriginalRetentionFsForTests,
  type GrinOriginalRetentionFs,
} from "../../src/screens/grin/grinOriginalRetention";
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
const RECEIPT_PERSIST = "receipt_e1_persist";
const EVIDENCE_PERSIST = "evidence_e1_persist";
const REGION = "asia-south1";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} required (firebase emulators:exec). Unset hosts are not a pass.`);
  }
  return value;
}

function createHostFs(rootDir: string): GrinOriginalRetentionFs {
  return {
    documentDirectory: rootDir,
    async ensureDir(dir) {
      fs.mkdirSync(dir, { recursive: true });
    },
    async copyFile(fromPath, toPath, maxBytes) {
      if (!fs.existsSync(fromPath)) throw new Error("source_missing");
      if (fs.statSync(fromPath).size > maxBytes) throw new Error("too_large");
      fs.mkdirSync(dirname(toPath), { recursive: true });
      const src = fs.openSync(fromPath, "r");
      const dest = fs.openSync(toPath, "w");
      try {
        const buf = Buffer.alloc(HASH_CHUNK_BYTES);
        let total = 0;
        for (;;) {
          const n = fs.readSync(src, buf, 0, HASH_CHUNK_BYTES, null);
          if (n <= 0) break;
          total += n;
          if (total > maxBytes) throw new Error("too_large");
          fs.writeSync(dest, buf, 0, n);
        }
      } finally {
        fs.closeSync(src);
        fs.closeSync(dest);
      }
    },
    async writeBytes(toPath, bytes) {
      fs.mkdirSync(dirname(toPath), { recursive: true });
      fs.writeFileSync(toPath, bytes);
    },
    async deleteFile(filePath) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    },
    async fileExists(filePath) {
      return fs.existsSync(filePath);
    },
    async fileSize(filePath) {
      if (!fs.existsSync(filePath)) return null;
      return fs.statSync(filePath).size;
    },
    async *readChunks(filePath) {
      if (!fs.existsSync(filePath)) throw new Error("source_missing");
      const fd = fs.openSync(filePath, "r");
      try {
        const buf = Buffer.alloc(HASH_CHUNK_BYTES);
        for (;;) {
          const n = fs.readSync(fd, buf, 0, HASH_CHUNK_BYTES, null);
          if (n <= 0) break;
          yield new Uint8Array(buf.subarray(0, n));
        }
      } finally {
        fs.closeSync(fd);
      }
    },
  };
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
  const here = dirname(fileURLToPath(import.meta.url));
  const composeSrc = fs.readFileSync(join(here, "functions-entry/compose.ts"), "utf8");
  assert.match(composeSrc, /createProductionGrinCallables as createIsolatedGrinCallables/);
  assert.doesNotMatch(composeSrc, /GoodsEvidenceRegisterAdapter/);

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
  await db.doc(`users/${OWNER}/goodsEvidenceLedgers/${GRIN_APPLICATION_LEDGER_ID}`).set({
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
      if (!input.bytes) throw new Error("emulator injection requires bytes");
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
  assert.equal(uploaded.ownerUid, OWNER);
  assert.equal(uploaded.mime, "application/pdf");
  assert.equal(uploaded.sizeBytes, pdf.byteLength);
  assert.equal(typeof uploaded.storagePath, "string");
  assert.equal(uploaded.storagePath == null, false);
  assert.equal(typeof uploaded.reservationId, "string");
  assert.equal(uploaded.evidenceId, EVIDENCE);
  assert.equal(uploaded.receiptId, RECEIPT);
  assert.equal(uploaded.ledgerId, LEDGER);
  assert.equal(uploaded.category, "invoice");
  assert.notEqual(uploaded.generation, "verified");
  assert.equal(uploaded.generation == null, false);
  assert.ok(names.includes(GRIN_RESERVE_EVIDENCE_CALLABLE));
  assert.ok(names.includes(GRIN_BEGIN_EVIDENCE_CALLABLE));
  assert.ok(names.includes(GRIN_UPLOAD_EVIDENCE_CALLABLE));
  assert.ok(
    names.indexOf(GRIN_RESERVE_EVIDENCE_CALLABLE) < names.indexOf(GRIN_BEGIN_EVIDENCE_CALLABLE),
    "client order is reserve then begin"
  );
  assert.ok(
    names.indexOf(GRIN_BEGIN_EVIDENCE_CALLABLE) < names.indexOf(GRIN_UPLOAD_EVIDENCE_CALLABLE),
    "client order is begin then PUT then verify/link (uploadEvidence)"
  );
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

  const persistTmp = fs.mkdtempSync(join(tmpdir(), "grin-e1-persist-"));
  const persistDbPath = join(persistTmp, "grin-persist.sqlite");
  const persistRetainRoot = join(persistTmp, "retain");
  fs.mkdirSync(persistRetainRoot, { recursive: true });
  let persistSqlite: HostSqlite | null = null;
  try {
    persistSqlite = openHostSqlite(persistDbPath);
    assert.equal(persistSqlite.executionLabel, SQLITE_HOST);
    console.log(`SQLITE_EXECUTION=${SQLITE_HOST}`);
    console.log(`HOST_FILESYSTEM=${process.platform} ${persistRetainRoot}`);
    console.log(`NATIVE_DEVICE=not_claimed (${SQLITE_HOST_NOT_NATIVE_DEVICE})`);

    const persistPdf = new Uint8Array(80);
    persistPdf.set([0x25, 0x50, 0x44, 0x46]);
    persistPdf.fill(0x42, 4);
    const persistIndependent = createHash("sha256").update(persistPdf).digest("hex");
    const persistLocalPath = join(persistTmp, "persist-original.pdf");
    fs.writeFileSync(persistLocalPath, persistPdf);

    const persistNames: string[] = [];
    const currentAuth = () => {
      const uid = jsAuth.currentUser?.uid;
      return uid ? { uid } : null;
    };
    setGrinApplicationDbFactoryForTests(() => persistSqlite as HostSqlite);
    setGrinServerPortFactoryForTests(() =>
      createFirebaseGrinTransport({
        call: realCall,
        currentAuth,
      })
    );
    setGrinEvidencePortFactoryForTests(() =>
      createFirebaseGrinEvidenceTransport({
        currentAuth,
        readLocalBytes: async (path) => {
          const buf = await readFile(path);
          return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
        },
        putObject: async (input) => {
          if (!input.bytes) throw new Error("emulator injection requires bytes");
          return putReservedObjectWithJsStorage({
            storage: jsStorage,
            storagePath: input.storagePath,
            bytes: input.bytes,
            contentType: input.contentType,
          });
        },
        call: async (name, data) => {
          persistNames.push(name);
          return realCall(name, data);
        },
      })
    );
    setGrinOriginalRetentionFsForTests(createHostFs(persistRetainRoot));

    advanceGrinLiveToken(OWNER);
    const persistSession = persistGrinOwnerSession();
    assert.ok(persistSession, "persistGrinOwnerSession must return a live session");
    const persistRepo = getGrinApplicationRepository(OWNER, persistSession.dispatchGeneration);
    const persistBox = (persistRepo as unknown as { outbox: GrinOutbox }).outbox;
    const persistHasher = (
      persistBox as unknown as { localOriginalHasher: { executionLabel: string } | null }
    ).localOriginalHasher;
    assert.equal(persistHasher?.executionLabel, APP_FILESYSTEM, "hasher factory must remain production APP_FILESYSTEM");

    persistRepo.createQueued(sampleRegisterBody({ receiptId: RECEIPT_PERSIST }));
    persistRepo.attachOriginal({
      receiptId: RECEIPT_PERSIST,
      evidenceId: EVIDENCE_PERSIST,
      category: "invoice",
      localPath: persistLocalPath,
      claimedSha256: persistIndependent,
      byteSize: persistPdf.byteLength,
      mime: "application/pdf",
      captureProvenance: "imported_original",
      osConversionOccurred: "unknown",
    });

    const registeredPersist = await persistBox.dispatchDue(persistSession, "worker_e1_persist");
    assert.ok(
      registeredPersist.results.some((item) => item.commandId && item.localState === "attachment_pending"),
      `register via persist outbox must reach attachment_pending: ${JSON.stringify(registeredPersist)}`
    );
    const uploadedPersist = await persistBox.dispatchDue(persistSession, "worker_e1_persist");
    assert.ok(
      uploadedPersist.results.some((item) => item.localState === "issued"),
      `processAttachments via persist outbox must issue after durable original: ${JSON.stringify(uploadedPersist)}`
    );

    const persistFiles = persistBox.listLocalFiles(OWNER, GRIN_APPLICATION_LEDGER_ID, RECEIPT_PERSIST);
    const persistOriginal = persistFiles.find((file) => file.role === "original");
    assert.equal(persistOriginal?.originalDurable, true);
    assert.equal(persistOriginal?.actualSha256, persistIndependent);
    assert.notEqual(persistOriginal?.objectGeneration, "verified");
    assert.ok(persistNames.includes(GRIN_RESERVE_EVIDENCE_CALLABLE));
    assert.ok(persistNames.includes(GRIN_BEGIN_EVIDENCE_CALLABLE));
    assert.ok(persistNames.includes(GRIN_UPLOAD_EVIDENCE_CALLABLE));

    const persistRead = await realCall(GRIN_READ_CALLABLE, {
      ledgerId: GRIN_APPLICATION_LEDGER_ID,
      receiptId: RECEIPT_PERSIST,
    });
    assert.equal((persistRead as { ok?: boolean }).ok, true);
    const persistEvents = (
      persistRead as { confirmed: { events: Array<{ type: string }> } }
    ).confirmed;
    assert.equal(
      persistEvents.events.some((event) => event.type === "evidence_verified"),
      true,
      "persist path must append evidence_verified after stored-byte verify"
    );

    retireGrinOwnerSession();
    persistSqlite.close();
    persistSqlite = openHostSqlite(persistDbPath);
    setGrinApplicationDbFactoryForTests(() => persistSqlite as HostSqlite);
    advanceGrinLiveToken(OWNER);
    const reopenedSession = persistGrinOwnerSession();
    assert.ok(reopenedSession);
    const reopenedRepo = getGrinApplicationRepository(OWNER, reopenedSession.dispatchGeneration);
    const reopenedBox = (reopenedRepo as unknown as { outbox: GrinOutbox }).outbox;
    const reopenedOriginal = reopenedBox
      .listLocalFiles(OWNER, GRIN_APPLICATION_LEDGER_ID, RECEIPT_PERSIST)
      .find((file) => file.role === "original");
    assert.equal(reopenedOriginal?.originalDurable, true);
    assert.equal(reopenedOriginal?.actualSha256, persistIndependent);
    const reopenedRow = persistSqlite.getFirstSync<{
      actual_sha256: string | null;
      original_durable: number;
    }>(
      `SELECT actual_sha256, original_durable FROM grin_local_evidence_files WHERE owner_uid = ? AND ledger_id = ? AND receipt_id = ? AND evidence_id = ?`,
      [OWNER, GRIN_APPLICATION_LEDGER_ID, RECEIPT_PERSIST, EVIDENCE_PERSIST]
    );
    assert.equal(reopenedRow?.actual_sha256, persistIndependent);
    assert.equal(reopenedRow?.original_durable, 1);
  } finally {
    retireGrinOwnerSession();
    resetGrinApplicationRepositoryForTests();
    resetGrinOriginalRetentionForTests();
    try {
      persistSqlite?.close();
    } catch {
      // ignore
    }
    fs.rmSync(persistTmp, { recursive: true, force: true });
  }

  console.log(
    "tools/goods-evidence-emulator/functions-roundtrip.emulator.test.ts: ok (EMULATOR persistGrinOwnerSession httpsCallable / SQLITE_HOST / HOST_FILESYSTEM / not live deploy)"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
