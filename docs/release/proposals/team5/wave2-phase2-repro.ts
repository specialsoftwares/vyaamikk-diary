/**
 * Team 5 PHASE 2 independent re-execution of W2-01…W2-05 on merged e94b78c.
 * AI QA. Not production. Not G6. Mapping implementer tests is not closure.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sampleRegisterBody } from "@/goodsEvidence/testFixtures";
import { applyPendingLocalMigrations } from "@/localDb/applyPendingMigrations";
import { execStatements, migrateToV7, migrateToV8, migrateToV9, tableExists } from "@/localDb/migrate";
import { grinV10TablesPresent, migrateToV10 } from "@/localDb/migrateGrin";
import { MIGRATIONS_V1 } from "@/localDb/schema";
import { createFakeEvidenceUploadPort, createFakeGrinServerPort } from "@/services/grin/outbox/fakePorts";
import { openHostSqlite, SQLITE_HOST, type GrinSqlDb, type HostSqlite } from "@/services/grin/outbox/hostSqlite";
import { GrinOutbox, peekQueuedCommand } from "@/services/grin/outbox/outbox";
import { SQLITE_HOST_NOT_NATIVE_DEVICE } from "@/services/grin/outbox/types";
import {
  getGrinApplicationRepository,
  resetGrinApplicationRepositoryForTests,
  retireGrinOwnerSession,
  setGrinApplicationDbFactoryForTests,
  startGrinOwnerSession,
} from "@/services/grin/repository/appBinding";
import { GrinApplicationRepository } from "@/services/grin/repository/GrinApplicationRepository";
import { GRIN_APPLICATION_LEDGER_ID } from "@/services/grin/repository/labels";
import { GRIN_BINDING_RETIRED, GRIN_SESSION_RETIRED } from "@/services/grin/repository/sessionErrors";

import { GoodsEvidenceStorageAdapter } from "../../../../tools/goods-evidence-storage/adapter";
import { createInjectedGrinEvidencePort } from "../../../../tools/goods-evidence-storage/evidencePort";
import { FAKE_createInjectedFirestore, FAKE_seedOwner } from "../../../../tools/goods-evidence-storage/FAKE_injectedFirestore";
import { FAKE_MemoryBlobStore } from "../../../../tools/goods-evidence-storage/FAKE_memoryBlobStore";
import { evidenceObjectPath } from "../../../../tools/goods-evidence-storage/paths";
import { sha256Bytes, testClock } from "../../../../tools/goods-evidence-storage/testSupport";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

type FindingResult = {
  id: string;
  status: "reproduced-then-fixed" | "still-open";
  label: string;
  fileLine: string;
  evidence: string;
};

const results: FindingResult[] = [];

function record(entry: FindingResult): void {
  results.push(entry);
  console.log(`[${entry.label}] ${entry.id} ${entry.status.toUpperCase()}`);
  console.log(`  file:line ${entry.fileLine}`);
  console.log(`  ${entry.evidence}`);
}

function body(receiptId: string, supplier = "T5 P2 Supplier") {
  return sampleRegisterBody({
    receiptId,
    supplier: {
      name: { kind: "present", value: supplier },
      registration: { kind: "registered", gstin: "29BBBBB0000B1Z5" },
      address: { kind: "not_supplied" },
      contact: { kind: "not_supplied" },
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withHost<T>(run: (db: HostSqlite) => Promise<T>): Promise<T> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grin-t5-p2-"));
  const dbPath = path.join(tmp, "repro.sqlite");
  let db: HostSqlite | null = null;
  try {
    db = openHostSqlite(dbPath);
    assert.equal(db.executionLabel, SQLITE_HOST);
    return await run(db);
  } finally {
    try {
      db?.close();
    } catch {
      // ignore
    }
    resetGrinApplicationRepositoryForTests();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function asMigrateDb(db: GrinSqlDb): Parameters<typeof migrateToV9>[0] {
  return db as unknown as Parameters<typeof migrateToV9>[0];
}

async function reproW201(): Promise<void> {
  await withHost(async (db) => {
    const owner = "owner_p2_w201";
    const outbox = new GrinOutbox({ db, server: createFakeGrinServerPort() });
    outbox.ensureSchema();
    const stale = outbox.beginOwnerSession(owner);
    const repo = new GrinApplicationRepository({
      outbox,
      db,
      ownerUid: owner,
      ledgerId: GRIN_APPLICATION_LEDGER_ID,
      session: stale,
    });
    const src = fs.readFileSync(path.join(ROOT, "src/services/grin/repository/GrinApplicationRepository.ts"), "utf8");
    const noRevive = !/beginOwnerSession\(this\.ownerUid\)/.test(src) && !/private ensureSession/.test(src);
    outbox.endOwnerSession(owner);
    let threw = false;
    let queued = false;
    try {
      repo.createQueued(body("grcp_p2_revive"));
      queued = true;
    } catch (err) {
      threw = err instanceof Error && err.message === GRIN_SESSION_RETIRED;
    }
    record({
      id: "W2-01-ensureSession-beginOwnerSession-revive",
      status: noRevive && threw && !queued ? "reproduced-then-fixed" : "still-open",
      label: "SQLITE_HOST",
      fileLine: "src/services/grin/repository/GrinApplicationRepository.ts:386-395",
      evidence: `ensureSession absent=${String(noRevive)}; retired createQueued threw=${String(threw)} queued=${String(queued)}.`,
    });
  });

  await withHost(async (db) => {
    const owner = "owner_p2_fb";
    const outbox = new GrinOutbox({ db, server: createFakeGrinServerPort() });
    outbox.ensureSchema();
    const session = outbox.beginOwnerSession(owner);
    const repo = new GrinApplicationRepository({
      outbox,
      db,
      ownerUid: owner,
      ledgerId: GRIN_APPLICATION_LEDGER_ID,
      session,
    });
    repo.createQueued(body("grcp_p2_fallback", "Should not appear"));
    db.runSync(`UPDATE grin_local_receipts SET payload_json = ? WHERE receipt_id = ? AND owner_uid = ?`, [
      JSON.stringify({ receiptId: "grcp_p2_fallback" }),
      "grcp_p2_fallback",
      owner,
    ]);
    db.runSync(`UPDATE grin_outbox_commands SET frozen_payload_json = ? WHERE receipt_id = ? AND owner_uid = ?`, [
      JSON.stringify({ receiptId: "grcp_p2_fallback" }),
      "grcp_p2_fallback",
      owner,
    ]);
    const row = repo.list().find((item) => item.receiptId === "grcp_p2_fallback");
    const fixed = row?.custody === null && row.projection === "unknown_incomplete" && row.supplierName === null;
    record({
      id: "W2-01-fallbackListItem-custody-received",
      status: fixed ? "reproduced-then-fixed" : "still-open",
      label: "SQLITE_HOST",
      fileLine: "src/services/grin/repository/snapshot.ts:76-90",
      evidence: `incomplete list custody=${String(row?.custody)} projection=${row?.projection ?? "missing"} supplierName=${String(row?.supplierName)}.`,
    });
  });

  await withHost(async (db) => {
    setGrinApplicationDbFactoryForTests(() => db);
    const liveA = startGrinOwnerSession("owner_p2_bind");
    const repoA = getGrinApplicationRepository("owner_p2_bind", liveA.dispatchGeneration);
    repoA.createQueued(body("grcp_p2_bind_a"));
    let staleOk = false;
    try {
      getGrinApplicationRepository("owner_p2_bind", liveA.dispatchGeneration + 99);
    } catch (err) {
      staleOk = err instanceof Error && err.message === GRIN_BINDING_RETIRED;
    }
    const liveB = startGrinOwnerSession("owner_p2_bind_b");
    let crossOwner = false;
    try {
      getGrinApplicationRepository("owner_p2_bind", liveA.dispatchGeneration);
    } catch (err) {
      crossOwner = err instanceof Error && (err.message === GRIN_BINDING_RETIRED || err.message === GRIN_SESSION_RETIRED);
    }
    const bindingSrc = fs.readFileSync(path.join(ROOT, "src/services/grin/repository/appBinding.ts"), "utf8");
    const generationKeyed = /dispatchGeneration/.test(bindingSrc) && /ONLY `startGrinOwnerSession` may call beginOwnerSession/.test(bindingSrc);
    record({
      id: "W2-01-appBinding-uid-only-cache",
      status: generationKeyed && staleOk && crossOwner ? "reproduced-then-fixed" : "still-open",
      label: "SQLITE_HOST",
      fileLine: "src/services/grin/repository/appBinding.ts:25-125",
      evidence: `generation cache + startGrinOwnerSession-only begin. wrong-gen threw=${String(staleOk)} prior-uid threw=${String(crossOwner)} liveB=${liveB.ownerUid}.`,
    });
    retireGrinOwnerSession();
  });

  const listSrc = fs.readFileSync(path.join(ROOT, "src/screens/grin/GrinListScreen.tsx"), "utf8");
  const hostSrc = fs.readFileSync(path.join(ROOT, "src/screens/grin/GrinAdmittedSessionHost.tsx"), "utf8");
  const gateSrc = fs.readFileSync(path.join(ROOT, "src/screens/grin/GrinAdmissionGate.tsx"), "utf8");
  const screens = [
    "GrinListScreen.tsx",
    "GrinCreateScreen.tsx",
    "GrinDetailScreen.tsx",
    "GrinAmendScreen.tsx",
    "GrinQcScreen.tsx",
    "GrinEwbScreen.tsx",
    "GrinReturnScreen.tsx",
    "GrinPackScreen.tsx",
    "GrinHistoryScreen.tsx",
    "GrinExceptionsScreen.tsx",
    "GrinAttachmentsScreen.tsx",
  ];
  let fixtureGone = true;
  let liveRepo = true;
  for (const name of screens) {
    const src = fs.readFileSync(path.join(ROOT, "src/screens/grin", name), "utf8");
    if (src.includes("getGrinFixtureRepository")) fixtureGone = false;
    if (!src.includes("requireLiveGrinApplicationRepository")) liveRepo = false;
  }
  const hostBeforeChildren =
    hostSrc.includes("Admission is decided before children mount") &&
    /if \(storeBlocked \|\| !enabled \|\| !ownerUid\)/.test(hostSrc) &&
    gateSrc.includes("GrinAdmittedSessionHost") &&
    listSrc.includes("requireLiveGrinApplicationRepository");
  record({
    id: "W2-01-screens-repo-before-admission",
    status: hostBeforeChildren && fixtureGone && liveRepo ? "reproduced-then-fixed" : "still-open",
    label: "mounted-inert",
    fileLine: "src/screens/grin/GrinAdmittedSessionHost.tsx:21-46; GrinAdmissionGate.tsx:52-59",
    evidence: `admission host before children=${String(hostBeforeChildren)}; fixture screens remaining=${String(!fixtureGone)}; requireLive on remaining screens=${String(liveRepo)}. RN native screens not mounted here.`,
  });
}

async function reproW202(): Promise<void> {
  await withHost(async (db) => {
    const server = createFakeGrinServerPort();
    const box = new GrinOutbox({ db, server });
    box.ensureSchema();
    const session = box.beginOwnerSession("owner_p2_lease");
    box.persistDraftAndQueue(session, {
      ledgerId: "ledger_1",
      receiptId: "grcp_p2_lease",
      commandId: "gcmd_p2_lease",
      body: body("grcp_p2_lease"),
    });
    let release!: () => void;
    server.holdNextRegister = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = box.dispatchDue(session, "worker_same");
    await server.waitUntilRegisterEntered();
    const second = await box.dispatchDue(session, "worker_same");
    const skipped = second.results.find((r) => r.commandId === "gcmd_p2_lease")?.skipped;
    release();
    await first;
    const src = fs.readFileSync(path.join(ROOT, "src/services/grin/outbox/outbox.ts"), "utf8");
    const noSameWorker =
      !/OR lease_worker_id = \?/.test(src) && /void _workerId/.test(src);
    record({
      id: "W2-02-tryAcquireLease-same-worker-reclaim",
      status: noSameWorker && skipped === "lease_held" ? "reproduced-then-fixed" : "still-open",
      label: "SQLITE_HOST",
      fileLine: "src/services/grin/outbox/outbox.ts:1251-1308",
      evidence: `second same-worker dispatch skipped=${skipped ?? "none"}; same-worker SQL reclaim removed=${String(noSameWorker)}.`,
    });
  });

  await withHost(async (db) => {
    const server = createFakeGrinServerPort();
    const box = new GrinOutbox({ db, server });
    box.ensureSchema();
    const session = box.beginOwnerSession("owner_p2_rec");
    box.persistDraftAndQueue(session, {
      ledgerId: "ledger_1",
      receiptId: "grcp_p2_rec",
      commandId: "gcmd_p2_rec",
      body: body("grcp_p2_rec"),
    });
    server.dropNextResponse = true;
    let release!: () => void;
    server.holdNextRegister = new Promise<void>((resolve) => {
      release = resolve;
    });
    const inflight = box.dispatchDue(session, "worker_rec");
    await server.waitUntilRegisterEntered();
    box.endOwnerSession("owner_p2_rec");
    const before = server.reconcileCalls;
    release();
    const done = await inflight;
    const item = done.results.find((r) => r.commandId === "gcmd_p2_rec");
    record({
      id: "W2-02-reconcile-before-retirement",
      status: server.reconcileCalls === before && item?.skipped === "session_retired" ? "reproduced-then-fixed" : "still-open",
      label: "SQLITE_HOST",
      fileLine: "src/services/grin/outbox/outbox.ts:845-876",
      evidence: `reconcileCalls stayed ${before}→${server.reconcileCalls}; skipped=${item?.skipped ?? "none"}. skipStaleCompletion now runs before reconcile.`,
    });
  });

  await withHost(async (db) => {
    const evidence = createFakeEvidenceUploadPort();
    let nowMs = 4_000_000;
    const box = new GrinOutbox({
      db,
      server: createFakeGrinServerPort(),
      evidence,
      clock: { nowMs: () => nowMs },
      leaseTtlMs: 1_000,
    });
    box.ensureSchema();
    const session = box.beginOwnerSession("owner_p2_att");
    box.persistDraftAndQueue(session, {
      ledgerId: "ledger_1",
      receiptId: "grcp_p2_att",
      commandId: "gcmd_p2_att",
      body: body("grcp_p2_att"),
    });
    box.attachLocalFile(session, {
      ledgerId: "ledger_1",
      receiptId: "grcp_p2_att",
      evidenceId: "ev_p2_att",
      role: "original",
      localPath: "/tmp/grin-p2-att.pdf",
      category: "invoice",
      claimedSha256: "a".repeat(64),
      byteSize: 16,
    });
    const registered = await box.dispatchDue(session, "worker_att_a");
    assert.equal(registered.results[0]?.localState, "attachment_pending");
    let releaseUpload!: () => void;
    evidence.holdNextUpload = new Promise<void>((resolve) => {
      releaseUpload = resolve;
    });
    evidence.holdUploadRole = "original";
    const firstAttach = box.dispatchDue(session, "worker_att_a");
    await evidence.waitUntilUploadEntered();
    nowMs += 5_000;
    const stealerPromise = box.dispatchDue(session, "worker_att_b");
    const stealDeadline = Date.now() + 2_000;
    let stolen = peekQueuedCommand(db, "owner_p2_att", "ledger_1", "gcmd_p2_att");
    while (stolen?.leaseWorkerId !== "worker_att_b" && Date.now() < stealDeadline) {
      await sleep(10);
      stolen = peekQueuedCommand(db, "owner_p2_att", "ledger_1", "gcmd_p2_att");
    }
    releaseUpload();
    const [staleDone] = await Promise.all([firstAttach, stealerPromise]);
    const original = box.listLocalFiles("owner_p2_att", "ledger_1", "grcp_p2_att").find((f) => f.role === "original");
    const staleSkipped = staleDone.results[0]?.skipped === "lease_held" || staleDone.results[0]?.skipped === "session_retired";
    const staleDidNotWrite = staleDone.results[0]?.localState !== "issued" || staleSkipped;
    record({
      id: "W2-02-processAttachments-void-workerId",
      status: stolen?.leaseWorkerId === "worker_att_b" && staleDidNotWrite ? "reproduced-then-fixed" : "still-open",
      label: "SQLITE_HOST",
      fileLine: "src/services/grin/outbox/outbox.ts:1140-1184",
      evidence: `stale skipped=${staleDone.results[0]?.skipped ?? "none"} localState=${staleDone.results[0]?.localState} stolen=${stolen?.leaseWorkerId} originalDurable=${String(original?.originalDurable)}. workerId is used in skipStaleCompletion / attempt fence.`,
    });
  });
}

async function reproW203(): Promise<void> {
  const db = FAKE_createInjectedFirestore();
  const blobs = new FAKE_MemoryBlobStore();
  const owner = "owner_p2_w203";
  const ledger = "ledger_w203";
  const receipt = "receipt_w203";
  FAKE_seedOwner(db, owner, ledger, receipt);
  const adapter = new GoodsEvidenceStorageAdapter(db, blobs, testClock());
  const bytesInvoice = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]);
  const bytesOther = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9]);
  const files = new Map<string, Uint8Array>([
    ["/tmp/grin-p2-a.pdf", bytesInvoice],
    ["/tmp/grin-p2-b.pdf", bytesOther],
  ]);
  const port = createInjectedGrinEvidencePort({
    adapter,
    blobs,
    readLocalFile: async (localPath) => {
      const found = files.get(localPath);
      if (!found) throw new Error("missing");
      return found;
    },
  });
  const missing = await port.upload({
    uid: owner,
    ledgerId: ledger,
    receiptId: receipt,
    evidenceId: "ev_p2_cat",
    role: "original",
    localPath: "/tmp/grin-p2-a.pdf",
    claimedSha256: sha256Bytes(bytesInvoice),
    category: undefined,
    sizeBytes: bytesInvoice.byteLength,
  });
  const rawMissing = db.snapshot.get(evidenceObjectPath(owner, ledger, "ev_p2_cat"));
  record({
    id: "W2-03-resolveCategory-defaults-invoice",
    status: missing.ok === false && missing.originalDurable === false && !rawMissing ? "reproduced-then-fixed" : "still-open",
    label: "INJECTED",
    fileLine: "tools/goods-evidence-storage/evidencePort.ts:204-219,291-292",
    evidence: `missing category ok=${String(missing.ok)} durable=${String(missing.originalDurable)} stored=${rawMissing ? "present" : "absent"}. No silent invoice default.`,
  });

  const r1 = await port.upload({
    uid: owner,
    ledgerId: ledger,
    receiptId: receipt,
    evidenceId: "ev_p2_id",
    role: "original",
    localPath: "/tmp/grin-p2-a.pdf",
    claimedSha256: sha256Bytes(bytesInvoice),
    category: "invoice",
    sizeBytes: bytesInvoice.byteLength,
  });
  const r2 = await port.upload({
    uid: owner,
    ledgerId: ledger,
    receiptId: receipt,
    evidenceId: "ev_p2_id",
    role: "original",
    localPath: "/tmp/grin-p2-b.pdf",
    claimedSha256: sha256Bytes(bytesOther),
    category: "invoice",
    sizeBytes: bytesOther.byteLength,
  });
  const identityHeld =
    r1.ok === true &&
    r1.originalDurable === true &&
    r2.originalDurable === false &&
    r2.ok === false &&
    r1.evidenceId === "ev_p2_id" &&
    r1.claimedSha256 === sha256Bytes(bytesInvoice);
  record({
    id: "W2-03-verified-R1-durable-for-R2-different-hash",
    status: identityHeld ? "reproduced-then-fixed" : "still-open",
    label: "INJECTED",
    fileLine: "tools/goods-evidence-storage/evidencePort.ts:303-306,314-353",
    evidence: `R1 durable=${String(r1.originalDurable)} gen=${r1.generation}; R2 different hash durable=${String(r2.originalDurable)} ok=${String(r2.ok)}. c2ef669 same-bytes CS-02 is still not this case.`,
  });
}

async function reproW204Source(): Promise<void> {
  const rules = fs.readFileSync(path.join(ROOT, "tools/goods-evidence-storage/storage.rules"), "utf8");
  const live = fs.readFileSync(path.join(ROOT, "storage.rules"), "utf8");
  const retained =
    /function isRetainedOriginalState/.test(rules) &&
    /function canReadOriginal/.test(rules) &&
    /isRetainedOriginalState\(userId, objectKey\)/.test(rules);
  record({
    id: "W2-04-isolated-rules-read-requires-flight",
    status: retained && !live.includes("grinEvidence") ? "reproduced-then-fixed" : "still-open",
    label: "mounted-inert",
    fileLine: "tools/goods-evidence-storage/storage.rules:89-125,189-190",
    evidence: `retained original read path present=${String(retained)}; live storage.rules grinEvidence=${live.includes("grinEvidence") ? "PRESENT" : "absent"}. Emulator is a separate command.`,
  });
}

async function reproW205(): Promise<void> {
  const t3 = fs.readFileSync(path.join(ROOT, "src/localDb/migrateGrin.v9Startup.sqliteHost.test.ts"), "utf8");
  const t5 = fs.readFileSync(path.join(ROOT, "tools/grin-acceptance/startup/v9-v10-grin-off.sqliteHost.test.ts"), "utf8");
  const noCopy =
    !t3.includes("function applyInitV10Sequence") &&
    !t5.includes("function applyInitV10Sequence") &&
    t3.includes("applyPendingLocalMigrations") &&
    t5.includes("applyPendingLocalMigrations") &&
    t5.includes("initializeLocalDatabase");
  await withHost(async (db) => {
    execStatements(asMigrateDb(db), MIGRATIONS_V1, "v1");
    migrateToV7(asMigrateDb(db));
    migrateToV8(asMigrateDb(db));
    migrateToV9(asMigrateDb(db));
    db.runSync("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", ["schema_version", "9"]);
    applyPendingLocalMigrations(asMigrateDb(db) as never);
    db.execSync("DROP TABLE grin_outbox_commands");
    assert.equal(tableExists(asMigrateDb(db), "grin_outbox_commands"), false);
    applyPendingLocalMigrations(asMigrateDb(db) as never);
    record({
      id: "W2-05-tests-copy-applyInitV10Sequence",
      status: noCopy && grinV10TablesPresent(asMigrateDb(db)) ? "reproduced-then-fixed" : "still-open",
      label: "SQLITE_HOST",
      fileLine:
        "src/localDb/migrateGrin.v9Startup.sqliteHost.test.ts; tools/grin-acceptance/startup/v9-v10-grin-off.sqliteHost.test.ts",
      evidence: `copied applyInitV10Sequence gone=${String(noCopy)}; production orchestrator repaired dropped grin_outbox_commands=${String(grinV10TablesPresent(asMigrateDb(db)))}.`,
    });
  });
}

async function main(): Promise<void> {
  console.log("TEAM5_WAVE2_PHASE2_REPRO");
  console.log(`SQLITE_EXECUTION=${SQLITE_HOST}`);
  console.log(`NATIVE_DEVICE=not_claimed (${SQLITE_HOST_NOT_NATIVE_DEVICE})`);
  console.log("MAPPING_IS_NOT_CLOSURE=1");
  await reproW201();
  await reproW202();
  await reproW203();
  await reproW204Source();
  await reproW205();
  const fixed = results.filter((r) => r.status === "reproduced-then-fixed").map((r) => r.id);
  const open = results.filter((r) => r.status === "still-open").map((r) => r.id);
  console.log(`REPRODUCED_THEN_FIXED=${fixed.join(",") || "none"}`);
  console.log(`STILL_OPEN=${open.join(",") || "none"}`);
  console.log("wave2-phase2-repro.ts: done");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
