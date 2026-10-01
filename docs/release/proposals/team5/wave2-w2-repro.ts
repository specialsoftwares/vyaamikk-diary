/**
 * Team 5 independent Wave 2 reproductions (W2-01…W2-05).
 * AI QA. Not production. Not G6 / device / billing / public-release.
 * Mapping an existing green test to a finding is not closure.
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
import { DB_VERSION, MIGRATIONS_V1 } from "@/localDb/schema";
import { createFakeGrinServerPort } from "@/services/grin/outbox/fakePorts";
import { openHostSqlite, SQLITE_HOST, type GrinSqlDb, type HostSqlite } from "@/services/grin/outbox/hostSqlite";
import { GrinOutbox, peekQueuedCommand } from "@/services/grin/outbox/outbox";
import type { GrinEvidenceUploadPort } from "@/services/grin/outbox/ports";
import { SQLITE_HOST_NOT_NATIVE_DEVICE } from "@/services/grin/outbox/types";
import { GrinApplicationRepository } from "@/services/grin/repository/GrinApplicationRepository";
import { GRIN_APPLICATION_LEDGER_ID } from "@/services/grin/repository/labels";

import { GoodsEvidenceStorageAdapter } from "../../../../tools/goods-evidence-storage/adapter";
import { createInjectedGrinEvidencePort } from "../../../../tools/goods-evidence-storage/evidencePort";
import { FAKE_createInjectedFirestore, FAKE_seedOwner } from "../../../../tools/goods-evidence-storage/FAKE_injectedFirestore";
import { FAKE_MemoryBlobStore } from "../../../../tools/goods-evidence-storage/FAKE_memoryBlobStore";
import { evidenceObjectPath } from "../../../../tools/goods-evidence-storage/paths";
import { sha256Bytes } from "../../../../tools/goods-evidence-storage/testSupport";
import { testClock } from "../../../../tools/goods-evidence-storage/testSupport";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

type FindingResult = {
  id: string;
  reproduced: boolean;
  label: string;
  fileLine: string;
  evidence: string;
};

const results: FindingResult[] = [];

function record(entry: FindingResult): void {
  results.push(entry);
  const mark = entry.reproduced ? "REPRODUCED" : "NOT_REPRODUCED";
  console.log(`[${entry.label}] ${entry.id} ${mark}`);
  console.log(`  file:line ${entry.fileLine}`);
  console.log(`  ${entry.evidence}`);
}

function body(receiptId: string, supplier = "T5 Repro Supplier") {
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grin-t5-w2-"));
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
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function asMigrateDb(db: GrinSqlDb): Parameters<typeof migrateToV9>[0] {
  return db as unknown as Parameters<typeof migrateToV9>[0];
}

function applyDiaryV9(db: GrinSqlDb): void {
  execStatements(asMigrateDb(db), MIGRATIONS_V1, "v1");
  migrateToV7(asMigrateDb(db));
  migrateToV8(asMigrateDb(db));
  migrateToV9(asMigrateDb(db));
}

function readSchemaVersion(db: GrinSqlDb): number {
  const row = db.getFirstSync<{ value: string }>("SELECT value FROM meta WHERE key = ?", ["schema_version"]);
  return row ? parseInt(row.value, 10) || 1 : 1;
}

/** Copied sequence still present in the two W2-05 test files. Not production. */
function applyInitV10SequenceCopy(database: GrinSqlDb): void {
  let version = readSchemaVersion(database);
  if (version < 10) {
    migrateToV10(asMigrateDb(database));
    version = 10;
  }
  if (version >= 10 && !tableExists(asMigrateDb(database), "grin_local_receipts")) {
    migrateToV10(asMigrateDb(database));
  }
  database.runSync("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", ["schema_version", String(DB_VERSION)]);
}

async function reproW201(): Promise<void> {
  await withHost(async (db) => {
    const owner = "owner_w201";
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
    outbox.endOwnerSession(owner);
    assert.equal(outbox.isSessionCurrent(stale), false);
    let revived = false;
    let queuedOk = false;
    try {
      const created = repo.createQueued(body("grcp_w201_revive"));
      queuedOk = created.receiptId === "grcp_w201_revive" && created.localState === "queued";
      revived = queuedOk && outbox.isSessionCurrent(stale) === false;
      const listed = repo.list();
      revived = revived && listed.some((row) => row.receiptId === "grcp_w201_revive");
    } catch (err) {
      revived = false;
      queuedOk = false;
      console.log(`  ensureSession note: ${err instanceof Error ? err.message : String(err)}`);
    }
    record({
      id: "W2-01-ensureSession-beginOwnerSession-revive",
      reproduced: revived && queuedOk,
      label: "SQLITE_HOST",
      fileLine: "src/services/grin/repository/GrinApplicationRepository.ts:91-95",
      evidence:
        `endOwnerSession then createQueued ${queuedOk ? "queued a row" : "did not queue"} via ensureSession→beginOwnerSession; stale session remains non-current. persistDraftAndQueue is session-gated; ensureSession revives around that gate.`,
    });
  });

  await withHost(async (db) => {
    const owner = "owner_w201_fb";
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
    repo.createQueued(body("grcp_w201_fallback", "Should not appear"));
    db.runSync(`UPDATE grin_local_receipts SET payload_json = ? WHERE receipt_id = ? AND owner_uid = ?`, [
      JSON.stringify({ receiptId: "grcp_w201_fallback" }),
      "grcp_w201_fallback",
      owner,
    ]);
    db.runSync(`UPDATE grin_outbox_commands SET frozen_payload_json = ? WHERE receipt_id = ? AND owner_uid = ?`, [
      JSON.stringify({ receiptId: "grcp_w201_fallback" }),
      "grcp_w201_fallback",
      owner,
    ]);
    const listed = repo.list();
    const row = listed.find((item) => item.receiptId === "grcp_w201_fallback");
    const reproduced = row?.custody === "received" && row.supplierName === "grcp_w201_fallback";
    record({
      id: "W2-01-fallbackListItem-custody-received",
      reproduced: Boolean(reproduced),
      label: "SQLITE_HOST",
      fileLine: "src/services/grin/repository/GrinApplicationRepository.ts:120-126",
      evidence: `unparseable payload list item custody=${row?.custody ?? "missing"} supplierName=${row?.supplierName ?? "missing"} (hard-coded received; receiptId used as supplier).`,
    });
  });

  const bindingSrc = fs.readFileSync(path.join(ROOT, "src/services/grin/repository/appBinding.ts"), "utf8");
  const uidOnlyCache =
    /if \(binding\?\.ownerUid === uid\) return binding\.repo;/.test(bindingSrc) &&
    /type Binding = \{[\s\S]*ownerUid: string;[\s\S]*repo: GrinApplicationRepository;[\s\S]*\}/.test(bindingSrc) &&
    !/dispatchGeneration/.test(bindingSrc);
  record({
    id: "W2-01-appBinding-uid-only-cache",
    reproduced: uidOnlyCache,
    label: "mounted-inert",
    fileLine: "src/services/grin/repository/appBinding.ts:15-29",
    evidence:
      "Binding keyed only by ownerUid; getGrinApplicationRepository returns cached repo without session generation. Not SQLITE_HOST (getLocalDatabase / expo-sqlite). Combined with ensureSession revive above.",
  });

  const screensRoot = path.join(ROOT, "src/screens/grin");
  const appScreens = ["GrinListScreen.tsx", "GrinCreateScreen.tsx", "GrinDetailScreen.tsx"] as const;
  const callSites: string[] = [];
  let hooksBeforeAdmission = true;
  for (const name of appScreens) {
    const src = fs.readFileSync(path.join(screensRoot, name), "utf8");
    if (!src.includes("getGrinApplicationRepository")) hooksBeforeAdmission = false;
    if (!src.includes("GrinAdmissionGate")) hooksBeforeAdmission = false;
    if (name !== "GrinCreateScreen.tsx" && !/useFocusEffect[\s\S]*getGrinApplicationRepository|getGrinApplicationRepository[\s\S]*useFocusEffect/.test(src)) {
      hooksBeforeAdmission = false;
    }
    const lines = src.split("\n");
    lines.forEach((line, i) => {
      if (line.includes("getGrinApplicationRepository")) callSites.push(`${name}:${i + 1}`);
    });
  }
  const createSrc = fs.readFileSync(path.join(screensRoot, "GrinCreateScreen.tsx"), "utf8");
  const createCallsInSave = /const saved = getGrinApplicationRepository\(user\.uid\)\.createQueued/.test(createSrc);
  const listSrc = fs.readFileSync(path.join(screensRoot, "GrinListScreen.tsx"), "utf8");
  const listLoadUngated = /setItems\(getGrinApplicationRepository\(user\.uid\)\.list\(\)\)/.test(listSrc);
  const admissionNotInLoad = !/isGoodsEvidenceEnabled\(/.test(listSrc);
  record({
    id: "W2-01-screens-repo-before-admission",
    reproduced: hooksBeforeAdmission && createCallsInSave && listLoadUngated && admissionNotInLoad,
    label: "mounted-inert",
    fileLine: callSites.join(", "),
    evidence:
      "List/detail load() via useFocusEffect and create onSave call getGrinApplicationRepository. GrinAdmissionGate only wraps returned JSX; hooks still run. isGoodsEvidenceEnabled is not checked at the call site. RN not mounted.",
  });
}

async function reproW202(): Promise<void> {
  await withHost(async (db) => {
    const server = createFakeGrinServerPort();
    const box = new GrinOutbox({ db, server });
    box.ensureSchema();
    const session = box.beginOwnerSession("owner_w202_lease");
    box.persistDraftAndQueue(session, {
      ledgerId: "ledger_1",
      receiptId: "grcp_w202_lease",
      commandId: "gcmd_w202_lease",
      body: body("grcp_w202_lease"),
    });
    let release!: () => void;
    server.holdNextRegister = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = box.dispatchDue(session, "worker_same");
    await server.waitUntilRegisterEntered();
    const held = peekQueuedCommand(db, "owner_w202_lease", "ledger_1", "gcmd_w202_lease");
    server.refreshEnteredWait();
    const secondPromise = box.dispatchDue(session, "worker_same");
    const raced = await Promise.race([
      secondPromise.then((report) => ({ kind: "returned" as const, report })),
      sleep(250).then(() => ({ kind: "hung" as const })),
    ]);
    const skipped =
      raced.kind === "returned"
        ? raced.report.results.find((r) => r.commandId === "gcmd_w202_lease")?.skipped
        : undefined;
    const reproduced = raced.kind === "hung" || skipped !== "lease_held";
    release();
    await first;
    if (raced.kind === "hung") await secondPromise.catch(() => undefined);
    record({
      id: "W2-02-tryAcquireLease-same-worker-reclaim",
      reproduced,
      label: "SQLITE_HOST",
      fileLine: "src/services/grin/outbox/outbox.ts:1057-1108 (OR lease_worker_id = ? / leaseFree same worker)",
      evidence: `live lease worker=${held?.leaseWorkerId} until=${held?.leaseUntilMs}; second same-worker dispatchDue ${raced.kind}${skipped ? ` skipped=${skipped}` : ""}. Same-worker reclaim if hung or not lease_held.`,
    });
  });

  await withHost(async (db) => {
    const server = createFakeGrinServerPort();
    const box = new GrinOutbox({ db, server });
    box.ensureSchema();
    const session = box.beginOwnerSession("owner_w202_rec");
    box.persistDraftAndQueue(session, {
      ledgerId: "ledger_1",
      receiptId: "grcp_w202_rec",
      commandId: "gcmd_w202_rec",
      body: body("grcp_w202_rec"),
    });
    server.dropNextResponse = true;
    let release!: () => void;
    server.holdNextRegister = new Promise<void>((resolve) => {
      release = resolve;
    });
    const inflight = box.dispatchDue(session, "worker_rec");
    await server.waitUntilRegisterEntered();
    box.endOwnerSession("owner_w202_rec");
    const before = server.reconcileCalls;
    release();
    const done = await inflight;
    const item = done.results.find((r) => r.commandId === "gcmd_w202_rec");
    const reproduced = server.reconcileCalls > before;
    record({
      id: "W2-02-reconcile-before-retirement",
      reproduced,
      label: "SQLITE_HOST",
      fileLine: "src/services/grin/outbox/outbox.ts:699-712",
      evidence: `session ended during held register; dropNextResponse threw network_ambiguous; reconcileCalls ${before}→${server.reconcileCalls}; item skipped=${item?.skipped ?? "none"}. skipStaleCompletion runs after reconcile.`,
    });
  });

  await withHost(async (db) => {
    let releaseUpload!: () => void;
    let notifyEntered!: () => void;
    const entered = new Promise<void>((resolve) => {
      notifyEntered = resolve;
    });
    const holdUpload = new Promise<void>((resolve) => {
      releaseUpload = resolve;
    });
    const evidence: GrinEvidenceUploadPort = {
      portKind: "FAKE",
      async upload() {
        notifyEntered();
        await holdUpload;
        return { ok: true, originalDurable: true, generation: "stolen-gen", retryable: false };
      },
    };
    let nowMs = 3_000_000;
    const box = new GrinOutbox({
      db,
      server: createFakeGrinServerPort(),
      evidence,
      clock: { nowMs: () => nowMs },
      leaseTtlMs: 1_000,
    });
    box.ensureSchema();
    const session = box.beginOwnerSession("owner_w202_att");
    box.persistDraftAndQueue(session, {
      ledgerId: "ledger_1",
      receiptId: "grcp_w202_att",
      commandId: "gcmd_w202_att",
      body: body("grcp_w202_att"),
    });
    box.attachLocalFile(session, {
      ledgerId: "ledger_1",
      receiptId: "grcp_w202_att",
      evidenceId: "ev_w202_att",
      role: "original",
      localPath: "/tmp/grin-w202-att.pdf",
    });
    const registered = await box.dispatchDue(session, "worker_att_a");
    assert.equal(registered.results[0]?.localState, "attachment_pending");
    const firstAttach = box.dispatchDue(session, "worker_att_a");
    await entered;
    nowMs += 5_000;
    const stealerPromise = box.dispatchDue(session, "worker_att_b");
    const stealDeadline = Date.now() + 2_000;
    let stolen = peekQueuedCommand(db, "owner_w202_att", "ledger_1", "gcmd_w202_att");
    while (stolen?.leaseWorkerId !== "worker_att_b" && Date.now() < stealDeadline) {
      await sleep(10);
      stolen = peekQueuedCommand(db, "owner_w202_att", "ledger_1", "gcmd_w202_att");
    }
    releaseUpload();
    const [staleDone, stealer] = await Promise.all([firstAttach, stealerPromise]);
    const files = box.listLocalFiles("owner_w202_att", "ledger_1", "grcp_w202_att");
    const original = files.find((f) => f.role === "original");
    const outboxSrc = fs.readFileSync(path.join(ROOT, "src/services/grin/outbox/outbox.ts"), "utf8");
    const voidsWorker = /private async processAttachments\([\s\S]*?void workerId;/.test(outboxSrc);
    const staleWrote =
      original?.originalDurable === true || staleDone.results[0]?.localState === "issued";
    record({
      id: "W2-02-processAttachments-void-workerId",
      reproduced: voidsWorker && staleWrote,
      label: "SQLITE_HOST",
      fileLine: "src/services/grin/outbox/outbox.ts:960-965",
      evidence: `processAttachments voids workerId; after TTL steal leaseWorker=${stolen?.leaseWorkerId} stealerSkipped=${stealer.results[0]?.skipped ?? "none"} stale localState=${staleDone.results[0]?.localState} originalDurable=${String(original?.originalDurable)}. Stale worker still persisted upload.`,
    });
  });
}

async function reproW203(): Promise<void> {
  const db = FAKE_createInjectedFirestore();
  const blobs = new FAKE_MemoryBlobStore();
  const owner = "owner_w203";
  const ledger = "ledger_w203";
  const receipt = "receipt_w203";
  FAKE_seedOwner(db, owner, ledger, receipt);
  const adapter = new GoodsEvidenceStorageAdapter(db, blobs, testClock());
  const bytesInvoice = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]);
  const bytesOther = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9]);
  const files = new Map<string, Uint8Array>([
    ["/tmp/grin-w203-a.pdf", bytesInvoice],
    ["/tmp/grin-w203-b.pdf", bytesOther],
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
  assert.equal(port.portKind, "INJECTED");
  const first = await port.upload({
    uid: owner,
    ledgerId: ledger,
    receiptId: receipt,
    evidenceId: "ev_w203_cat",
    role: "original",
    localPath: "/tmp/grin-w203-a.pdf",
    claimedSha256: sha256Bytes(bytesInvoice),
  });
  const raw = db.snapshot.get(evidenceObjectPath(owner, ledger, "ev_w203_cat"));
  const stored = raw ? (JSON.parse(raw) as { category?: string; claimedSha256?: string }) : {};
  const categoryInvoice = first.ok === true && stored.category === "invoice";
  record({
    id: "W2-03-resolveCategory-defaults-invoice",
    reproduced: categoryInvoice,
    label: "INJECTED",
    fileLine: "tools/goods-evidence-storage/evidencePort.ts:106-116,176",
    evidence: `upload without originalCategory: ok=${String(first.ok)} stored.category=${stored.category ?? "missing"} (default invoice). GrinEvidenceUploadInput has no category field (src/services/grin/outbox/ports.ts:57-67).`,
  });

  const r1 = await port.upload({
    uid: owner,
    ledgerId: ledger,
    receiptId: receipt,
    evidenceId: "ev_w203_id",
    role: "original",
    localPath: "/tmp/grin-w203-a.pdf",
    claimedSha256: sha256Bytes(bytesInvoice),
  });
  const r2 = await port.upload({
    uid: owner,
    ledgerId: ledger,
    receiptId: receipt,
    evidenceId: "ev_w203_id",
    role: "original",
    localPath: "/tmp/grin-w203-b.pdf",
    claimedSha256: sha256Bytes(bytesOther),
  });
  const rawId = db.snapshot.get(evidenceObjectPath(owner, ledger, "ev_w203_id"));
  const storedId = rawId ? (JSON.parse(rawId) as { claimedSha256?: string; actualSha256?: string }) : {};
  const hashA = sha256Bytes(bytesInvoice);
  const hashB = sha256Bytes(bytesOther);
  const identityMiss =
    r1.ok === true &&
    r1.originalDurable === true &&
    r2.ok === true &&
    r2.originalDurable === true &&
    r2.generation === r1.generation &&
    hashA !== hashB &&
    storedId.claimedSha256 === hashA;
  record({
    id: "W2-03-verified-R1-durable-for-R2-different-hash",
    reproduced: identityMiss,
    label: "INJECTED",
    fileLine: "tools/goods-evidence-storage/evidencePort.ts:186-187",
    evidence: `R1 durable gen=${r1.generation} hashA=${hashA.slice(0, 8)}…; R2 different hashB=${hashB.slice(0, 8)}… originalDurable=${String(r2.originalDurable)} gen=${r2.generation} storedClaim=${storedId.claimedSha256?.slice(0, 8) ?? "missing"}…. mapVerified returns durable without re-checking hash. c2ef669 CS-02 replays the same bytes — not this identity case.`,
  });
}

async function reproW204Source(): Promise<void> {
  const rules = fs.readFileSync(path.join(ROOT, "tools/goods-evidence-storage/storage.rules"), "utf8");
  const live = fs.readFileSync(path.join(ROOT, "storage.rules"), "utf8");
  const isolatedGatesRead =
    /allow read: if ownerUserActive\(userId\)\s*&& admissionAllowsNewCommands\(userId\)\s*&& hasFlightReservation\(userId, objectKey\);/.test(
      rules
    );
  const flightIsReservedUploading =
    /data\.state == 'reserved'/.test(rules) && /data\.state == 'uploading'/.test(rules);
  const liveUntouched = !live.includes("grinEvidence");
  record({
    id: "W2-04-isolated-rules-read-requires-flight",
    reproduced: isolatedGatesRead && flightIsReservedUploading && liveUntouched,
    label: "mounted-inert",
    fileLine: "tools/goods-evidence-storage/storage.rules:44-49,80-83",
    evidence: `isolated original allow read requires hasFlightReservation reserved|uploading; live storage.rules grinEvidence=${liveUntouched ? "absent" : "PRESENT"}. Emulator execution is a separate command (wave2-w2-04-rules.emulator.ts).`,
  });
}

async function reproW205(): Promise<void> {
  const t3 = fs.readFileSync(path.join(ROOT, "src/localDb/migrateGrin.v9Startup.sqliteHost.test.ts"), "utf8");
  const t5 = fs.readFileSync(
    path.join(ROOT, "tools/grin-acceptance/startup/v9-v10-grin-off.sqliteHost.test.ts"),
    "utf8"
  );
  const stillCopied =
    t3.includes("function applyInitV10Sequence") &&
    t5.includes("function applyInitV10Sequence") &&
    !t3.includes("applyPendingLocalMigrations") &&
    !t5.includes("applyPendingLocalMigrations");

  await withHost(async (db) => {
    applyDiaryV9(db);
    db.runSync(
      `INSERT INTO entries_local (id, user_id, payload_json, sync_status, local_updated_at, remote_updated_at, version_number)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["v9_w205", "u_w205", JSON.stringify({ id: "v9_w205", title: "keep" }), "pending", 1, null, 1]
    );
    db.runSync("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", ["schema_version", "9"]);
    applyInitV10SequenceCopy(db);
    db.execSync("DROP TABLE grin_outbox_commands");
    assert.equal(tableExists(asMigrateDb(db), "grin_local_receipts"), true);
    assert.equal(tableExists(asMigrateDb(db), "grin_outbox_commands"), false);
    applyInitV10SequenceCopy(db);
    const copyLeftGap = tableExists(asMigrateDb(db), "grin_outbox_commands") === false;
    applyPendingLocalMigrations(asMigrateDb(db) as never);
    const productionRepaired = grinV10TablesPresent(asMigrateDb(db)) === true;
    record({
      id: "W2-05-tests-copy-applyInitV10Sequence",
      reproduced: stillCopied && copyLeftGap && productionRepaired,
      label: "SQLITE_HOST",
      fileLine:
        "src/localDb/migrateGrin.v9Startup.sqliteHost.test.ts:41-54; tools/grin-acceptance/startup/v9-v10-grin-off.sqliteHost.test.ts:38-51",
      evidence: `both tests still define applyInitV10Sequence and do not import applyPendingLocalMigrations. Copy repair checks only grin_local_receipts so dropped grin_outbox_commands stayed missing (${copyLeftGap}); production orchestrator repaired grinV10TablesPresent=${String(productionRepaired)}.`,
    });
  });
}

async function main(): Promise<void> {
  console.log("TEAM5_WAVE2_W2_REPRO");
  console.log(`SQLITE_EXECUTION=${SQLITE_HOST}`);
  console.log(`NATIVE_DEVICE=not_claimed (${SQLITE_HOST_NOT_NATIVE_DEVICE})`);
  console.log("MAPPING_IS_NOT_CLOSURE=1");
  await reproW201();
  await reproW202();
  await reproW203();
  await reproW204Source();
  await reproW205();
  const reproduced = results.filter((r) => r.reproduced).map((r) => r.id);
  const notReproduced = results.filter((r) => !r.reproduced).map((r) => r.id);
  console.log(`REPRODUCED=${reproduced.join(",") || "none"}`);
  console.log(`NOT_REPRODUCED=${notReproduced.join(",") || "none"}`);
  console.log("wave2-w2-repro.ts: done");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
