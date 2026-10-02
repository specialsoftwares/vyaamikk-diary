/**
 * Team 5 PHASE 3 independent inspection of persistGrinOwnerSession hasher
 * and pack os_conversion mapping at coordinator closeout d4b6e1f.
 *
 * Not Wave 2 acceptance. Not NATIVE_DEVICE. Not live deploy.
 * SQLITE_HOST may inject retention fs; that is HOST_FILESYSTEM, not the
 * SQLITE_HOST node-crypto hasher, and not NATIVE_DEVICE.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  HASH_CHUNK_BYTES,
  hashBoundedChunks,
  normalizeOsConversionOccurred,
} from "@/goodsEvidence/evidence";
import { assembleEvidencePackInputs } from "@/goodsEvidence/evidencePackInputs";
import { sampleRegisterBody } from "@/goodsEvidence/testFixtures";
import type { ImmutableGrin } from "@/goodsEvidence/types";
import { createFakeEvidenceUploadPort, createFakeGrinServerPort } from "@/services/grin/outbox/fakePorts";
import { openHostSqlite, SQLITE_HOST, type HostSqlite } from "@/services/grin/outbox/hostSqlite";
import type { GrinOutbox } from "@/services/grin/outbox/outbox";
import {
  APP_FILESYSTEM,
  SQLITE_HOST_NOT_NATIVE_DEVICE,
  type GrinLocalOriginalHasher,
} from "@/services/grin/outbox/types";
import {
  GRIN_APPLICATION_EVIDENCE_PORT_LABEL,
  GRIN_APPLICATION_LEDGER_ID,
  getGrinApplicationRepository,
  persistGrinOwnerSession,
  resetGrinApplicationRepositoryForTests,
  retireGrinOwnerSession,
  setGrinApplicationDbFactoryForTests,
  setGrinEvidencePortFactoryForTests,
  setGrinServerPortFactoryForTests,
  startGrinOwnerSession,
} from "@/services/grin/repository";
import type { GrinApplicationRepository } from "@/services/grin/repository/GrinApplicationRepository";
import { createGrinSha256ChunkHasher } from "@/screens/grin/grinOriginalHash";
import {
  resetGrinOriginalRetentionForTests,
  setGrinOriginalRetentionFsForTests,
  type GrinOriginalRetentionFs,
} from "@/screens/grin/grinOriginalRetention";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

type PortShape = {
  portKind?: string;
  transportKind?: string;
  compositionLabel?: string;
};

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

function outboxOf(repo: GrinApplicationRepository): GrinOutbox {
  const box = (repo as unknown as { outbox: GrinOutbox }).outbox;
  assert.ok(box, "production repository must hold the persistGrinOwnerSession outbox");
  return box;
}

function createHostFs(rootDir: string): GrinOriginalRetentionFs {
  return {
    documentDirectory: rootDir,
    async ensureDir(dir: string) {
      fs.mkdirSync(dir, { recursive: true });
    },
    async copyFile(fromPath: string, toPath: string) {
      if (!fs.existsSync(fromPath)) throw new Error("source_missing");
      fs.mkdirSync(path.dirname(toPath), { recursive: true });
      fs.copyFileSync(fromPath, toPath);
    },
    async writeBytes(toPath: string, bytes: Uint8Array) {
      fs.mkdirSync(path.dirname(toPath), { recursive: true });
      fs.writeFileSync(toPath, bytes);
    },
    async deleteFile(filePath: string) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    },
    async fileExists(filePath: string) {
      return fs.existsSync(filePath);
    },
    async fileSize(filePath: string) {
      if (!fs.existsSync(filePath)) return null;
      return fs.statSync(filePath).size;
    },
    async *readChunks(filePath: string) {
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

async function assertIndependentSha256(): Promise<void> {
  const hashSrc = fs.readFileSync(path.join(ROOT, "src/screens/grin/grinOriginalHash.ts"), "utf8");
  assert.match(hashSrc, /0x0fc19dc6/, "FIPS 180-4 K[16] must be 0x0fc19dc6");
  assert.doesNotMatch(hashSrc, /0x0fc19cd6/, "transposed FIPS K 0x0fc19cd6 must be absent");
  assert.equal(HASH_CHUNK_BYTES, 64 * 1024);

  const cases: Array<[string, Uint8Array]> = [
    ["empty", new Uint8Array()],
    ["abc", new Uint8Array([97, 98, 99])],
    ["pdf-prefix", new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a])],
    ["gt64KiB", new Uint8Array(HASH_CHUNK_BYTES + 17).map((_, i) => i & 0xff)],
  ];
  for (const [label, bytes] of cases) {
    const node = sha256(bytes);
    const hasher = createGrinSha256ChunkHasher();
    if (bytes.byteLength) hasher.update(bytes);
    assert.equal(hasher.digestHex(), node, `${label} createGrinSha256ChunkHasher vs node`);
    async function* chunks() {
      if (bytes.byteLength) yield bytes;
    }
    const bounded = await hashBoundedChunks(chunks(), createGrinSha256ChunkHasher(), HASH_CHUNK_BYTES);
    assert.equal(bounded.sha256, node, `${label} hashBoundedChunks vs node`);
    assert.equal(bounded.byteSize, bytes.byteLength);
    console.log(`SHA256 ${label} node=${node} production=match bytes=${bytes.byteLength}`);
  }
}

function assertPackDoesNotInventFalse(): void {
  const packSrc = stripComments(
    fs.readFileSync(path.join(ROOT, "src/goodsEvidence/evidencePackInputs.ts"), "utf8")
  );
  assert.doesNotMatch(packSrc, /osConversionOccurred:\s*false/);
  assert.match(packSrc, /normalizeOsConversionOccurred/);

  const snapshot = {
    receiptId: "grcp_pack",
    issuedNumber: "GRIN-TEST-1",
    reportedArrivalAt: "2026-09-28T03:30:00.000Z",
    warehouse: { kind: "present", value: "Main godown" },
    supplier: {
      name: { kind: "present", value: "Sample Supplier" },
      registration: { kind: "registered", gstin: "29BBBBB0000B1Z5" },
    },
    commercial: { supplierInvoiceNumber: { kind: "present", value: "INV-1" } },
    lines: [{ physicallyReceived: { kind: "present" } }],
  } as unknown as ImmutableGrin;

  const baseOriginal = {
    evidenceId: "ev_pack",
    ownerUid: "owner_pack",
    ledgerId: "ledger_pack",
    receiptId: "grcp_pack",
    category: "invoice",
    mime: "application/pdf",
    byteSize: 32,
    rawSha256: "ab".repeat(32),
    generation: "gen-1",
    originalFileName: "original",
    state: "verified",
    captureProvenance: "imported_original",
  };

  const omitted = assembleEvidencePackInputs({
    ownerUid: "owner_pack",
    ledgerId: "ledger_pack",
    purchaseCaseId: "case-grcp_pack",
    confirmedCuts: [
      {
        receiptId: "grcp_pack",
        events: [],
        originalSnapshot: snapshot,
        eventVersion: 1,
        headHash: "aa".repeat(32),
      },
    ],
    originals: [baseOriginal],
  });
  assert.equal(omitted.verifiedOriginals.length, 1);
  assert.equal(omitted.verifiedOriginals[0]?.osConversionOccurred, "unknown");

  const fromNull = assembleEvidencePackInputs({
    ownerUid: "owner_pack",
    ledgerId: "ledger_pack",
    purchaseCaseId: "case-grcp_pack",
    confirmedCuts: [
      {
        receiptId: "grcp_pack",
        events: [],
        originalSnapshot: snapshot,
        eventVersion: 1,
        headHash: "aa".repeat(32),
      },
    ],
    originals: [{ ...baseOriginal, osConversionOccurred: undefined }],
  });
  assert.equal(fromNull.verifiedOriginals[0]?.osConversionOccurred, "unknown");

  const explicitUnknown = assembleEvidencePackInputs({
    ownerUid: "owner_pack",
    ledgerId: "ledger_pack",
    purchaseCaseId: "case-grcp_pack",
    confirmedCuts: [
      {
        receiptId: "grcp_pack",
        events: [],
        originalSnapshot: snapshot,
        eventVersion: 1,
        headHash: "aa".repeat(32),
      },
    ],
    originals: [{ ...baseOriginal, osConversionOccurred: "unknown" }],
  });
  assert.equal(explicitUnknown.verifiedOriginals[0]?.osConversionOccurred, "unknown");

  const explicitFalse = assembleEvidencePackInputs({
    ownerUid: "owner_pack",
    ledgerId: "ledger_pack",
    purchaseCaseId: "case-grcp_pack",
    confirmedCuts: [
      {
        receiptId: "grcp_pack",
        events: [],
        originalSnapshot: snapshot,
        eventVersion: 1,
        headHash: "aa".repeat(32),
      },
    ],
    originals: [{ ...baseOriginal, osConversionOccurred: false }],
  });
  assert.equal(explicitFalse.verifiedOriginals[0]?.osConversionOccurred, false);

  assert.equal(normalizeOsConversionOccurred(null), "unknown");
  assert.equal(normalizeOsConversionOccurred(undefined), "unknown");
  assert.equal(normalizeOsConversionOccurred(""), "unknown");
  assert.equal(normalizeOsConversionOccurred(false), false);
  console.log("pack normalizeOsConversionOccurred: omitted/null/unknown stay unknown; explicit false preserved");
}

function assertNoGrinExport(): void {
  const indexSrc = fs.readFileSync(path.join(ROOT, "functions/src/index.ts"), "utf8");
  assert.doesNotMatch(indexSrc, /goodsEvidence/);
  assert.doesNotMatch(indexSrc, /grinRegister|grinReserve|grinUpload|grinMutate|createComposedGrinCallables/);
  assert.doesNotMatch(indexSrc, /from ["']\.\/goodsEvidence/);
  console.log("HOLD functions/src/index.ts: no GRIN export");
}

function assertPersistWiresHasher(): void {
  const bindingSrc = stripComments(
    fs.readFileSync(path.join(ROOT, "src/services/grin/repository/appBinding.ts"), "utf8")
  );
  assert.match(bindingSrc, /server:\s*serverPortFactory\(\)/);
  assert.match(bindingSrc, /evidence:\s*evidencePortFactory\(\)/);
  assert.match(bindingSrc, /localOriginalHasher:\s*hasherFactory\(\)/);
  assert.match(bindingSrc, /createAppLocalOriginalHasher/);
  assert.match(bindingSrc, /function defaultGrinLocalOriginalHasherFactory/);
  const hasherSrc = fs.readFileSync(
    path.join(ROOT, "src/services/grin/repository/localOriginalHasher.ts"),
    "utf8"
  );
  assert.match(hasherSrc, /createGrinSha256ChunkHasher/);
  assert.match(hasherSrc, /APP_FILESYSTEM/);
  assert.doesNotMatch(hasherSrc, /createSqliteHostLocalOriginalHasher/);
  console.log("persistGrinOwnerSession source wires server+evidence+localOriginalHasher=hasherFactory()");
}

async function main(): Promise<void> {
  assertNoGrinExport();
  assertPersistWiresHasher();
  await assertIndependentSha256();
  assertPackDoesNotInventFalse();

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grin-t5-e4-followup-"));
  const dbPath = path.join(tmp, "followup.sqlite");
  const retainRoot = path.join(tmp, "retain");
  fs.mkdirSync(retainRoot, { recursive: true });
  let db: HostSqlite | null = null;

  try {
    db = openHostSqlite(dbPath);
    assert.equal(db.executionLabel, SQLITE_HOST);
    console.log(`SQLITE_EXECUTION=${SQLITE_HOST}`);
    console.log(`HOST_FILESYSTEM=${os.platform()} ${retainRoot}`);
    console.log(`NATIVE_DEVICE=not_claimed (${SQLITE_HOST_NOT_NATIVE_DEVICE})`);

    resetGrinApplicationRepositoryForTests();
    setGrinApplicationDbFactoryForTests(() => db as HostSqlite);

    assert.equal(persistGrinOwnerSession(), null, "persist without live token must not start a session");

    const started = startGrinOwnerSession("owner_e4_persist");
    const liveRepo = getGrinApplicationRepository(started.ownerUid, started.dispatchGeneration);
    const box = outboxOf(liveRepo);
    const server = (box as unknown as { server: PortShape }).server;
    const evidence = (box as unknown as { evidence: PortShape | null }).evidence;
    const hasher = (box as unknown as { localOriginalHasher: GrinLocalOriginalHasher | null })
      .localOriginalHasher;

    assert.ok(evidence, "production persistGrinOwnerSession must construct evidence port");
    assert.notEqual(hasher, null, "persistGrinOwnerSession hasher must not be null");
    assert.equal(hasher?.executionLabel, APP_FILESYSTEM);
    assert.equal(typeof hasher?.createHasher, "function");
    assert.equal(typeof hasher?.chunksForPath, "function");
    assert.equal(server.portKind, "INJECTED");
    assert.equal(server.transportKind, "FIREBASE_JS_HTTPS_CALLABLE");
    assert.equal(server.compositionLabel, "not live deploy");
    assert.equal(evidence.portKind, "INJECTED");
    assert.equal(evidence.transportKind, "FIREBASE_JS_HTTPS_CALLABLE");
    assert.equal(evidence.compositionLabel, "not live deploy; fail-closed when unexported");
    assert.equal(
      GRIN_APPLICATION_EVIDENCE_PORT_LABEL,
      "INJECTED / FIREBASE_JS_HTTPS_CALLABLE evidence. Not live deploy; fail-closed when unexported."
    );
    console.log(
      `persistGrinOwnerSession hasher=${hasher?.executionLabel} server=${String(server.compositionLabel)} evidence=${String(evidence.compositionLabel)}`
    );

    liveRepo.createQueued(
      sampleRegisterBody({
        receiptId: "grcp_pdf_attach",
        supplier: {
          name: { kind: "present", value: "E4 Followup" },
          registration: { kind: "registered", gstin: "29BBBBB0000B1Z5" },
          address: { kind: "not_supplied" },
          contact: { kind: "not_supplied" },
        },
      })
    );
    const pdfBytes = new Uint8Array(Buffer.from("%PDF-1.4 e4-followup"));
    const pdfPath = path.join(retainRoot, "source.pdf");
    fs.writeFileSync(pdfPath, pdfBytes);
    const attached = liveRepo.attachOriginal({
      receiptId: "grcp_pdf_attach",
      category: "invoice",
      localPath: pdfPath,
      claimedSha256: sha256(pdfBytes),
      byteSize: pdfBytes.byteLength,
      mime: "application/pdf",
      captureProvenance: "imported_original",
      osConversionOccurred: "unknown",
    });
    assert.equal(attached.originalDurable, false, "missing backend must not look like success");
    const storedPdf = db.getFirstSync<{
      capture_provenance: string | null;
      os_conversion_occurred: string | null;
      claimed_mime: string | null;
    }>(
      `SELECT capture_provenance, os_conversion_occurred, claimed_mime FROM grin_local_evidence_files WHERE owner_uid = ? AND receipt_id = ? AND claimed_sha256 = ?`,
      ["owner_e4_persist", "grcp_pdf_attach", sha256(pdfBytes)]
    );
    assert.equal(storedPdf?.capture_provenance, "imported_original");
    assert.equal(storedPdf?.os_conversion_occurred, "unknown");
    assert.equal(storedPdf?.claimed_mime, "application/pdf");
    console.log("PDF attach stored unknown conversion + claimed mime");

    db.runSync(
      `INSERT INTO grin_local_evidence_files (
         id, owner_uid, ledger_id, receipt_id, evidence_id, role, local_path,
         claimed_sha256, byte_size, category, upload_state, original_durable, retain_local,
         capture_provenance, os_conversion_occurred, claimed_mime, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, NULL, NULL, ?, ?)`,
      [
        "legacy-null-conversion",
        "owner_e4_persist",
        GRIN_APPLICATION_LEDGER_ID,
        "grcp_pdf_attach",
        "ev_legacy_null",
        "original",
        path.join(retainRoot, "legacy.pdf"),
        "cd".repeat(32),
        16,
        "weighment",
        "local_only",
        "imported_original",
        Date.now(),
        Date.now(),
      ]
    );
    const legacy = box
      .listLocalFiles("owner_e4_persist", GRIN_APPLICATION_LEDGER_ID, "grcp_pdf_attach")
      .find((file) => file.evidenceId === "ev_legacy_null");
    assert.ok(legacy);
    assert.equal(legacy.osConversionOccurred, "unknown", "older NULL rows must stay unknown, not false");
    console.log("legacy SQL NULL os_conversion_occurred maps to unknown, not false");

    retireGrinOwnerSession();
    db.close();
    db = openHostSqlite(dbPath);
    setGrinApplicationDbFactoryForTests(() => db as HostSqlite);
    const reopenedSession = startGrinOwnerSession("owner_e4_persist");
    const reopenedRepo = getGrinApplicationRepository("owner_e4_persist", reopenedSession.dispatchGeneration);
    const reopenedPdf = db.getFirstSync<{
      capture_provenance: string | null;
      os_conversion_occurred: string | null;
      claimed_mime: string | null;
    }>(
      `SELECT capture_provenance, os_conversion_occurred, claimed_mime FROM grin_local_evidence_files WHERE owner_uid = ? AND receipt_id = ? AND claimed_sha256 = ?`,
      ["owner_e4_persist", "grcp_pdf_attach", sha256(pdfBytes)]
    );
    assert.equal(reopenedPdf?.os_conversion_occurred, "unknown");
    assert.equal(reopenedPdf?.claimed_mime, "application/pdf");
    const reopenedBox = outboxOf(reopenedRepo);
    const reopenedLegacy = reopenedBox
      .listLocalFiles("owner_e4_persist", GRIN_APPLICATION_LEDGER_ID, "grcp_pdf_attach")
      .find((item) => item.evidenceId === "ev_legacy_null");
    assert.equal(reopenedLegacy?.osConversionOccurred, "unknown");
    console.log("sqlite reopen retained unknown conversion + claimed mime");

    retireGrinOwnerSession();
    setGrinServerPortFactoryForTests(() => createFakeGrinServerPort());
    setGrinEvidencePortFactoryForTests(() => createFakeEvidenceUploadPort());
    setGrinOriginalRetentionFsForTests(createHostFs(retainRoot));

    const hasherPdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]);
    const hasherPdfPath = path.join(retainRoot, "hasher.pdf");
    fs.writeFileSync(hasherPdfPath, hasherPdfBytes);
    const independent = sha256(hasherPdfBytes);
    const productionHasher = createGrinSha256ChunkHasher();
    productionHasher.update(hasherPdfBytes);
    assert.equal(productionHasher.digestHex(), independent, "durable-path bytes must match node before upload");

    const sessionH = startGrinOwnerSession("owner_e4_hasher");
    const repoH = getGrinApplicationRepository("owner_e4_hasher", sessionH.dispatchGeneration);
    const boxH = outboxOf(repoH);
    const hasherH = (boxH as unknown as { localOriginalHasher: GrinLocalOriginalHasher | null })
      .localOriginalHasher;
    assert.notEqual(hasherH, null);
    assert.equal(hasherH?.executionLabel, APP_FILESYSTEM, "durable path must use persist hasher, not SQLITE_HOST inject");
    const evidenceH = (boxH as unknown as { evidence: { portKind?: string } | null }).evidence;
    assert.equal(evidenceH?.portKind, "FAKE", "upload success is FAKE port; hasher still hashes retained bytes");

    repoH.createQueued(
      sampleRegisterBody({
        receiptId: "grcp_hasher",
        supplier: {
          name: { kind: "present", value: "Hasher" },
          registration: { kind: "registered", gstin: "29BBBBB0000B1Z5" },
          address: { kind: "not_supplied" },
          contact: { kind: "not_supplied" },
        },
      })
    );
    repoH.attachOriginal({
      receiptId: "grcp_hasher",
      category: "invoice",
      localPath: hasherPdfPath,
      claimedSha256: independent,
      byteSize: hasherPdfBytes.byteLength,
      mime: "application/pdf",
      captureProvenance: "imported_original",
      osConversionOccurred: "unknown",
    });
    const registered = await boxH.dispatchDue(sessionH, "worker_e4_hasher");
    assert.ok(registered.results.some((item) => item.commandId && item.localState === "attachment_pending"));
    const uploaded = await boxH.dispatchDue(sessionH, "worker_e4_hasher");
    assert.ok(uploaded.results.some((item) => item.localState === "issued"));
    const durable = boxH
      .listLocalFiles("owner_e4_hasher", GRIN_APPLICATION_LEDGER_ID, "grcp_hasher")
      .find((file) => file.role === "original");
    assert.equal(durable?.originalDurable, true, "persistGrinOwnerSession hasher must admit known retained bytes");
    assert.equal(durable?.osConversionOccurred, "unknown");
    assert.equal(durable?.actualSha256, independent);
    console.log(
      `persist-hasher durable path originalDurable=true actualSha256=${durable?.actualSha256} hasher=${hasherH?.executionLabel}`
    );
  } finally {
    retireGrinOwnerSession();
    resetGrinApplicationRepositoryForTests();
    resetGrinOriginalRetentionForTests();
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
  console.log("unset emulator hosts: failure (not counted as pass)");

  console.log("wave2evidence-e4-hasher-followup.ts: ok (inspection; not Wave 2 acceptance)");
}

void main();
