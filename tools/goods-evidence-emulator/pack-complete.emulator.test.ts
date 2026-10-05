/**
 * Joined complete-pack acceptance (not the SQLITE_HOST repository unit that
 * writes verification columns directly).
 *
 * Production repository/outbox composition → register receipt → attach actual
 * labelled synthetic files → real Firebase JS httpsCallable/Storage against the
 * isolated emulators → server stored-byte verification → writeEvidenceUpload
 * (not replaced) → SQLite close/reopen → exportPack.
 *
 * Synthetic bytes prove policy coverage and object identity only. They are not
 * legal truth, OCR, GST, or 2B evidence.
 *
 * Labels: EMULATOR / SQLITE_HOST / HOST_FILESYSTEM / not live deploy / not NATIVE_DEVICE.
 *
 * Transport uses production prefix/size hashing (16-byte sniff + File.size),
 * not the optional full-file byte-reader injection. Node putObject still
 * materializes the retained file up to MAX_PDF_ORIGINAL_BYTES for the
 * Firebase JS Storage SDK because Expo `File` is not on the host. That is
 * not device peak-memory proof. Production JS evidence transport hands an
 * Expo File Blob to uploadBytesResumable instead.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithCustomToken } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { connectStorageEmulator, getStorage } from "firebase/storage";

import { readPrefixFromHandle } from "../../src/goodsEvidence/boundedRead";
import { HASH_CHUNK_BYTES, MAX_PDF_ORIGINAL_BYTES } from "../../src/goodsEvidence/evidence";
import type { GrinConfirmedProjection } from "../../src/goodsEvidence/ports";
import { mayMarkComplete } from "../../src/goodsEvidence/evidencePack";
import { sampleRegisterBody } from "../../src/goodsEvidence/testFixtures";
import type { GrinOutbox } from "../../src/services/grin/outbox";
import { openHostSqlite, SQLITE_HOST, type HostSqlite } from "../../src/services/grin/outbox/hostSqlite";
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
import { GRIN_SESSION_RETIRED } from "../../src/services/grin/repository/sessionErrors";
import {
  resetGrinOriginalRetentionForTests,
  setGrinOriginalRetentionFsForTests,
  type GrinOriginalRetentionFs,
} from "../../src/screens/grin/grinOriginalRetention";
import {
  createFirebaseGrinEvidenceTransport,
  putReservedObjectWithJsStorage,
} from "../../src/services/grin/transport/evidenceTransport";
import { createFirebaseGrinTransport } from "../../src/services/grin/transport/firebaseTransport";
import {
  GRIN_BEGIN_EVIDENCE_CALLABLE,
  GRIN_READ_CALLABLE,
  GRIN_RESERVE_EVIDENCE_CALLABLE,
  GRIN_UPLOAD_EVIDENCE_CALLABLE,
} from "../../src/services/grin/transport/callableNames";

const PROJECT_ID = "demo-vyaamikk-grin-t1";
const STORAGE_BUCKET = `${PROJECT_ID}.appspot.com`;
const OWNER = "owner_pack_complete";
const REGION = "asia-south1";

type PackCategory = "invoice" | "lr_bilty" | "unloading" | "stock_accounting" | "gst";

const REQUIRED: readonly { category: PackCategory; label: string }[] = [
  { category: "invoice", label: "SYNTHETIC_INVOICE_NOT_LEGAL_TRUTH" },
  { category: "lr_bilty", label: "SYNTHETIC_LR_NOT_LEGAL_TRUTH" },
  { category: "unloading", label: "SYNTHETIC_UNLOADING_NOT_LEGAL_TRUTH" },
  { category: "stock_accounting", label: "SYNTHETIC_STOCK_NOT_LEGAL_TRUTH" },
  { category: "gst", label: "SYNTHETIC_GST_NOT_LEGAL_TRUTH" },
];

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

function labelledPdf(label: string): Uint8Array {
  const head = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]);
  const body = new TextEncoder().encode(label);
  const out = new Uint8Array(head.byteLength + body.byteLength);
  out.set(head);
  out.set(body, head.byteLength);
  return out;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function createHostFs(rootDir: string): GrinOriginalRetentionFs {
  function openHandle(filePath: string) {
    if (!fs.existsSync(filePath)) throw new Error("source_missing");
    const fd = fs.openSync(filePath, "r");
    try {
      const size = fs.fstatSync(fd).size;
      return {
        size,
        readBytes(length: number) {
          const buf = Buffer.alloc(Math.max(0, length));
          const n = fs.readSync(fd, buf, 0, buf.length, null);
          if (n <= 0) return new Uint8Array(0);
          const out = new Uint8Array(n);
          out.set(buf.subarray(0, n));
          return out;
        },
        close() {
          fs.closeSync(fd);
        },
      };
    } catch (error) {
      try {
        fs.closeSync(fd);
      } catch {
        // open failed after fd; do not leak
      }
      throw error;
    }
  }
  return {
    documentDirectory: rootDir,
    openHandle,
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

function evidenceId(receiptId: string, category: PackCategory): string {
  return `ev_${receiptId}_${category}`;
}

const RUNNABLE = new Set(["queued", "failed_retryable", "dispatching", "attachment_pending"]);

function hasRunnable(box: GrinOutbox, receiptId: string): boolean {
  return box
    .listCommandsForReceipt(OWNER, GRIN_APPLICATION_LEDGER_ID, receiptId)
    .some((item) => RUNNABLE.has(item.localState));
}

async function drainReceipt(
  box: GrinOutbox,
  session: { ownerUid: string; dispatchGeneration: number },
  worker: string,
  receiptId: string
): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    if (!hasRunnable(box, receiptId)) return;
    await box.dispatchDue(session, worker);
  }
  const commands = box.listCommandsForReceipt(OWNER, GRIN_APPLICATION_LEDGER_ID, receiptId);
  const files = box.listLocalFiles(OWNER, GRIN_APPLICATION_LEDGER_ID, receiptId);
  throw new Error(
    `did not drain ${receiptId} (${worker}) commands=${JSON.stringify(commands.map((item) => [item.commandType, item.localState]))} files=${JSON.stringify(files.map((item) => [item.evidenceId, item.originalDurable, item.uploadState]))}`
  );
}

async function main(): Promise<void> {
  const firestoreHost = requireEnv("FIRESTORE_EMULATOR_HOST");
  const authHost = requireEnv("FIREBASE_AUTH_EMULATOR_HOST");
  const storageHost = requireEnv("FIREBASE_STORAGE_EMULATOR_HOST");
  void firestoreHost;
  const functionsBind =
    process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST ?? process.env.FUNCTIONS_EMULATOR_HOST ?? "127.0.0.1:5002";
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
    "grin-pack-complete"
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

  const currentAuth = () => {
    const uid = jsAuth.currentUser?.uid;
    return uid ? { uid } : null;
  };

  async function withPersist<T>(
    label: string,
    fn: (input: {
      sqlite: HostSqlite;
      box: GrinOutbox;
      repo: ReturnType<typeof getGrinApplicationRepository>;
      session: NonNullable<ReturnType<typeof persistGrinOwnerSession>>;
      names: string[];
      tmp: string;
    }) => Promise<T>
  ): Promise<T> {
    const tmp = fs.mkdtempSync(join(tmpdir(), `grin-pack-${label}-`));
    const dbPath = join(tmp, "grin.sqlite");
    const retainRoot = join(tmp, "retain");
    fs.mkdirSync(retainRoot, { recursive: true });
    let sqlite: HostSqlite | null = openHostSqlite(dbPath);
    const names: string[] = [];
    const hostFs = createHostFs(retainRoot);
    try {
      assert.equal(sqlite.executionLabel, SQLITE_HOST);
      setGrinApplicationDbFactoryForTests(() => sqlite as HostSqlite);
      setGrinServerPortFactoryForTests(() =>
        createFirebaseGrinTransport({
          call: realCall,
          currentAuth,
        })
      );
      setGrinEvidencePortFactoryForTests(() =>
        createFirebaseGrinEvidenceTransport({
          currentAuth,
          readPrefix: async (path) => readPrefixFromHandle(() => hostFs.openHandle!(path)),
          fileSize: (path) => hostFs.fileSize(path),
          putObject: async (input) => {
            if (!input.localPath) throw new Error("missing local original");
            const buf = await readFile(input.localPath);
            if (buf.byteLength > MAX_PDF_ORIGINAL_BYTES) throw new Error("too_large");
            return putReservedObjectWithJsStorage({
              storage: jsStorage,
              storagePath: input.storagePath,
              bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
              contentType: input.contentType,
            });
          },
          call: async (name, data) => {
            names.push(name);
            return realCall(name, data);
          },
        })
      );
      setGrinOriginalRetentionFsForTests(hostFs);
      advanceGrinLiveToken(OWNER);
      const session = persistGrinOwnerSession();
      assert.ok(session, `${label} persistGrinOwnerSession`);
      const repo = getGrinApplicationRepository(OWNER, session.dispatchGeneration);
      const box = (repo as unknown as { outbox: GrinOutbox }).outbox;
      const hasher = (box as unknown as { localOriginalHasher: { executionLabel: string } | null }).localOriginalHasher;
      assert.equal(hasher?.executionLabel, APP_FILESYSTEM);
      return await fn({ sqlite, box, repo, session, names, tmp });
    } finally {
      retireGrinOwnerSession();
      resetGrinApplicationRepositoryForTests();
      resetGrinOriginalRetentionForTests();
      try {
        sqlite?.close();
      } catch {
        // ignore
      }
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  function writeCategoryFiles(
    tmp: string,
    receiptId: string,
    categories: readonly { category: PackCategory; label: string }[]
  ) {
    return categories.map((item) => {
      const bytes = labelledPdf(`${item.label}:${receiptId}`);
      const localPath = join(tmp, `${receiptId}-${item.category}.pdf`);
      fs.writeFileSync(localPath, bytes);
      return {
        ...item,
        bytes,
        localPath,
        hash: sha256(bytes),
        evidenceId: evidenceId(receiptId, item.category),
      };
    });
  }

  function attachAll(
    repo: ReturnType<typeof getGrinApplicationRepository>,
    receiptId: string,
    files: ReturnType<typeof writeCategoryFiles>
  ) {
    for (const file of files) {
      const attached = repo.attachOriginal({
        receiptId,
        evidenceId: file.evidenceId,
        category: file.category,
        localPath: file.localPath,
        claimedSha256: file.hash,
        byteSize: file.bytes.byteLength,
        mime: "application/pdf",
        captureProvenance: "imported_original",
        osConversionOccurred: "unknown",
      });
      assert.equal(attached.originalDurable, false);
    }
  }

  await withPersist("complete", async ({ sqlite, box, repo, session, names, tmp }) => {
    const receiptId = "receipt_pack_complete";
    repo.createQueued(sampleRegisterBody({ receiptId }));
    const files = writeCategoryFiles(tmp, receiptId, REQUIRED);
    attachAll(repo, receiptId, files);
    await drainReceipt(box, session, "worker_pack_complete", receiptId);
    assert.ok(names.includes(GRIN_RESERVE_EVIDENCE_CALLABLE));
    assert.ok(names.includes(GRIN_BEGIN_EVIDENCE_CALLABLE));
    assert.ok(names.includes(GRIN_UPLOAD_EVIDENCE_CALLABLE));

    const read = await realCall(GRIN_READ_CALLABLE, {
      ledgerId: GRIN_APPLICATION_LEDGER_ID,
      receiptId,
    });
    assert.equal((read as { ok?: boolean }).ok, true);
    const confirmed = (read as { confirmed: { events: Array<Record<string, unknown>>; eventVersion: number } }).confirmed;
    const verifiedEvents = confirmed.events.filter((event) => event.type === "evidence_verified");
    assert.equal(verifiedEvents.length, files.length, "each original must be server-verified");

    for (const file of files) {
      const row = box
        .listLocalFiles(OWNER, GRIN_APPLICATION_LEDGER_ID, receiptId)
        .find((item) => item.evidenceId === file.evidenceId);
      assert.equal(row?.originalDurable, true);
      assert.equal(row?.actualSha256, file.hash);
      assert.equal(row?.verifiedSizeBytes, file.bytes.byteLength);
      assert.equal(row?.mime, "application/pdf");
      assert.notEqual(row?.objectGeneration, "verified");
      assert.equal(typeof row?.objectGeneration, "string");
      const event = verifiedEvents.find((item) => {
        const changes = item.typedChanges as { evidenceId?: string; rawSha256?: string; byteSize?: number; generation?: string };
        return changes?.evidenceId === file.evidenceId;
      });
      assert.ok(event, `missing evidence_verified for ${file.evidenceId}`);
      const pointer = event.typedChanges as { rawSha256?: string; byteSize?: number; generation?: string };
      assert.equal(pointer.rawSha256, file.hash);
      assert.equal(pointer.byteSize, file.bytes.byteLength);
      assert.equal(row?.objectGeneration, pointer.generation);
    }

    box.persistConfirmedProjection(session, (read as { confirmed: GrinConfirmedProjection }).confirmed);

    retireGrinOwnerSession();
    sqlite.close();
    const reopened = openHostSqlite(join(tmp, "grin.sqlite"));
    try {
      setGrinApplicationDbFactoryForTests(() => reopened);
      advanceGrinLiveToken(OWNER);
      const reopenedSession = persistGrinOwnerSession();
      assert.ok(reopenedSession);
      const reopenedRepo = getGrinApplicationRepository(OWNER, reopenedSession.dispatchGeneration);
      const pack = reopenedRepo.exportPack(receiptId);
      assert.ok(pack);
      assert.equal(pack.exportKind, "manifest_and_pdf_summary");
      assert.equal(pack.bundledArtifacts, "none");
      assert.equal(pack.originalsBundled, false);
      assert.equal(pack.itcDisposition, "not_determined");
      assert.equal(pack.coverage, "complete");
      assert.equal(pack.completenessLabel, "complete");
      assert.equal(mayMarkComplete(pack.manifest), true);
      assert.equal(pack.manifest.supportPolicyVersion, 2);
      assert.equal(pack.manifest.integrity, "verified");
      const pinned = pack.manifest.pinnedCuts[0];
      assert.ok(pinned);
      assert.equal(pinned.eventVersion, confirmed.eventVersion);
      reopenedRepo.amend({
        receiptId,
        reason: "later warehouse note",
        changes: { warehouse: { kind: "present", value: "Bay Z" } },
      });
      const reopenedBox = (reopenedRepo as unknown as { outbox: GrinOutbox }).outbox;
      await drainReceipt(reopenedBox, reopenedSession, "worker_pack_amend", receiptId);
      assert.equal(pack.manifest.pinnedCuts[0]?.eventVersion, pinned.eventVersion);
      assert.equal(pack.manifest.pinnedCuts[0]?.headHash, pinned.headHash);
      const later = reopenedRepo.exportPack(receiptId);
      assert.ok(later);
      assert.equal(later.exportKind, "manifest_and_pdf_summary");
      assert.equal(later.originalsBundled, false);
      assert.equal(later.itcDisposition, "not_determined");
      assert.notEqual(later.manifest.pinnedCuts[0]?.headHash, pinned.headHash);
      assert.equal(pack.manifest.pinnedCuts[0]?.headHash, pinned.headHash);

      reopened.runSync(`UPDATE grin_local_evidence_files SET object_generation = ? WHERE evidence_id = ? AND owner_uid = ?`, [
        "verified",
        evidenceId(receiptId, "gst"),
        OWNER,
      ]);
      const wrongGen = reopenedRepo.exportPack(receiptId);
      assert.ok(wrongGen);
      assert.equal(wrongGen.completenessLabel, "incomplete");
      assert.equal(mayMarkComplete(wrongGen.manifest), false);
      assert.ok(wrongGen.manifest.incompleteReasons.length > 0);

      retireGrinOwnerSession();
      assert.throws(
        () => reopenedRepo.exportPack(receiptId),
        (err: unknown) => err instanceof Error && err.message === GRIN_SESSION_RETIRED
      );
    } finally {
      try {
        reopened.close();
      } catch {
        // ignore
      }
    }
  });

  await withPersist("interrupt", async ({ box, repo, session, tmp }) => {
    const receiptId = "receipt_pack_interrupt";
    repo.createQueued(sampleRegisterBody({ receiptId }));
    const files = writeCategoryFiles(tmp, receiptId, REQUIRED.filter((item) => item.category === "invoice"));
    attachAll(repo, receiptId, files);
    await box.dispatchDue(session, "worker_pack_interrupt");
    assert.equal(hasRunnable(box, receiptId), true);
    retireGrinOwnerSession();
    advanceGrinLiveToken(OWNER);
    const resumed = persistGrinOwnerSession();
    assert.ok(resumed);
    const resumedRepo = getGrinApplicationRepository(OWNER, resumed.dispatchGeneration);
    const resumedBox = (resumedRepo as unknown as { outbox: GrinOutbox }).outbox;
    await drainReceipt(resumedBox, resumed, "worker_pack_retry", receiptId);
    const row = resumedBox
      .listLocalFiles(OWNER, GRIN_APPLICATION_LEDGER_ID, receiptId)
      .find((item) => item.evidenceId === files[0]?.evidenceId);
    assert.equal(row?.originalDurable, true);
    assert.equal(row?.actualSha256, files[0]?.hash);
  });

  await withPersist("missing", async ({ box, repo, session, tmp }) => {
    const receiptId = "receipt_pack_missing";
    repo.createQueued(sampleRegisterBody({ receiptId }));
    const files = writeCategoryFiles(tmp, receiptId, REQUIRED.filter((item) => item.category !== "gst"));
    attachAll(repo, receiptId, files);
    await drainReceipt(box, session, "worker_pack_missing", receiptId);
    const pack = repo.exportPack(receiptId);
    assert.ok(pack);
    assert.equal(pack.completenessLabel, "incomplete");
    assert.equal(pack.coverage, "incomplete");
    assert.equal(pack.itcDisposition, "not_determined");
    assert.equal(pack.originalsBundled, false);
    assert.equal(mayMarkComplete(pack.manifest), false);
    assert.ok(pack.manifest.incompleteReasons.some((reason) => /gst/i.test(reason)));
  });

  await withPersist("corrupt", async ({ box, repo, session, tmp }) => {
    const receiptId = "receipt_pack_corrupt";
    repo.createQueued(sampleRegisterBody({ receiptId }));
    const files = writeCategoryFiles(tmp, receiptId, REQUIRED);
    attachAll(repo, receiptId, files);
    const gst = files.find((item) => item.category === "gst");
    assert.ok(gst);
    fs.writeFileSync(gst.localPath, labelledPdf("CORRUPTED_BYTES_NOT_THE_ATTACHED_ORIGINAL"));
    let last = "";
    let same = 0;
    for (let i = 0; i < 16; i += 1) {
      await box.dispatchDue(session, "worker_pack_corrupt");
      const snap = JSON.stringify(
        box.listLocalFiles(OWNER, GRIN_APPLICATION_LEDGER_ID, receiptId).map((item) => [item.evidenceId, item.originalDurable])
      );
      if (snap === last) same += 1;
      else {
        same = 0;
        last = snap;
      }
      if (same >= 2) break;
    }
    const gstRow = box.listLocalFiles(OWNER, GRIN_APPLICATION_LEDGER_ID, receiptId).find((item) => item.evidenceId === gst.evidenceId);
    assert.equal(gstRow?.originalDurable, false);
    const pack = repo.exportPack(receiptId);
    assert.ok(pack);
    assert.equal(pack.completenessLabel, "incomplete");
    assert.equal(mayMarkComplete(pack.manifest), false);
  });

  await withPersist("wrong-receipt", async ({ box, repo, session, tmp }) => {
    const wanted = "receipt_pack_wanted";
    const other = "receipt_pack_other";
    repo.createQueued(sampleRegisterBody({ receiptId: wanted }));
    repo.createQueued(sampleRegisterBody({ receiptId: other }));
    const files = writeCategoryFiles(tmp, other, REQUIRED);
    attachAll(repo, other, files);
    await drainReceipt(box, session, "worker_pack_other", other);
    const wantedPack = repo.exportPack(wanted);
    assert.ok(wantedPack);
    assert.equal(wantedPack.completenessLabel, "incomplete");
    assert.equal(wantedPack.missingOriginal, true);
    assert.equal(mayMarkComplete(wantedPack.manifest), false);
    const otherPack = repo.exportPack(other);
    assert.ok(otherPack);
    assert.equal(otherPack.completenessLabel, "complete");
  });

  console.log(
    `tools/goods-evidence-emulator/pack-complete.emulator.test.ts: ok (EMULATOR persistGrinOwnerSession writeEvidenceUpload exportPack / SQLITE_HOST / HOST_FILESYSTEM / ${SQLITE_HOST_NOT_NATIVE_DEVICE})`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
