/**
 * SQLITE_HOST GRIN outbox tests. Real SQLite via Python stdlib.
 * Not NATIVE_DEVICE process-death proof.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { HASH_CHUNK_BYTES } from "@/goodsEvidence/evidence";
import { sampleRegisterBody } from "@/goodsEvidence/testFixtures";
import { execStatements, migrateToV7, migrateToV8, migrateToV9 } from "@/localDb/migrate";
import { migrateToV10, grinV10TablesPresent, GRIN_CONFIRMED_COLUMNS, GRIN_EVIDENCE_CAPTURE_COLUMNS, GRIN_EVIDENCE_DESCRIPTOR_COLUMNS } from "@/localDb/migrateGrin";
import { MIGRATIONS_V1 } from "@/localDb/schema";
import { createFakeEvidenceUploadPort, createFakeGrinServerPort } from "./fakePorts";
import { openHostSqlite, SQLITE_HOST, type HostSqlite } from "./hostSqlite";
import { createSqliteHostLocalOriginalHasher } from "./hostLocalOriginalHasher";
import { GrinOutbox, peekQueuedCommand, setOutboxCrashHook } from "./outbox";
import { DURABLE_ORIGINAL_UPLOAD_CONDITION, MAX_CONCURRENT_UPLOADS_PER_OWNER, SQLITE_HOST_NOT_NATIVE_DEVICE } from "./types";
import type { GrinSqlDb } from "./hostSqlite";

function asMigrateDb(db: GrinSqlDb): Parameters<typeof migrateToV9>[0] {
  return db as unknown as Parameters<typeof migrateToV9>[0];
}

function applyDiaryV9(db: GrinSqlDb): void {
  execStatements(asMigrateDb(db), MIGRATIONS_V1, "v1");
  migrateToV7(asMigrateDb(db));
  migrateToV8(asMigrateDb(db));
  migrateToV9(asMigrateDb(db));
}

function body(receiptId: string, remarks?: string) {
  return sampleRegisterBody({
    receiptId,
    remarks: remarks
      ? { kind: "present", value: remarks }
      : { kind: "not_supplied" },
  });
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grin-t3-"));
  const dbPath = path.join(tmp, "grin-outbox.sqlite");
  let db: HostSqlite | null = null;

  const reopen = (): HostSqlite => {
    db?.close();
    db = openHostSqlite(dbPath);
    assert.equal(db.executionLabel, SQLITE_HOST);
    return db;
  };

  try {
    db = openHostSqlite(dbPath);
    assert.equal(db.executionLabel, SQLITE_HOST);
    console.log(`SQLITE_EXECUTION=${SQLITE_HOST}`);
    console.log(`NATIVE_DEVICE=not_claimed (${SQLITE_HOST_NOT_NATIVE_DEVICE})`);

    applyDiaryV9(db);
    db.runSync(
      `INSERT INTO entries_local (id, user_id, payload_json, sync_status, local_updated_at, remote_updated_at, version_number)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["keep_diary_1", "u1", JSON.stringify({ id: "keep_diary_1", title: "Site note" }), "pending", 1, null, 1]
    );
    db.runSync(
      `INSERT INTO sync_queue (id, user_id, op, entity, entity_id, payload_json, created_at, attempts, last_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL)`,
      ["sync_keep", "u1", "create", "entry", "keep_diary_1", "{\"id\":\"keep_diary_1\"}", 1]
    );
    db.runSync(
      `INSERT INTO form_drafts (id, user_id, draft_kind, scope_key, entry_id, payload_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["draft_keep", "u1", "note", "scope", null, "{\"ok\":true}", 1]
    );

    migrateToV10(asMigrateDb(db));
    assert.equal(grinV10TablesPresent(asMigrateDb(db)), true);
    for (const column of GRIN_CONFIRMED_COLUMNS) {
      const info: Array<{ name: string }> = db.getAllSync<{ name: string }>(
        "PRAGMA table_info(grin_local_receipts)"
      );
      assert.equal(info.some((row: { name: string }) => row.name === column), true, column);
    }
    for (const column of [...GRIN_EVIDENCE_DESCRIPTOR_COLUMNS, ...GRIN_EVIDENCE_CAPTURE_COLUMNS]) {
      const info: Array<{ name: string }> = db.getAllSync<{ name: string }>(
        "PRAGMA table_info(grin_local_evidence_files)"
      );
      assert.equal(info.some((row: { name: string }) => row.name === column), true, column);
    }
    assert.equal(MAX_CONCURRENT_UPLOADS_PER_OWNER, 2);
    assert.equal(HASH_CHUNK_BYTES, 64 * 1024);
    const kept = db.getFirstSync<{ id: string; payload_json: string }>(
      "SELECT id, payload_json FROM entries_local WHERE id = ?",
      ["keep_diary_1"]
    );
    assert.equal(kept?.id, "keep_diary_1");
    assert.ok(kept?.payload_json.includes("keep_diary_1"));
    const keptQueue = db.getFirstSync<{ entity_id: string }>(
      "SELECT entity_id FROM sync_queue WHERE id = ?",
      ["sync_keep"]
    );
    assert.equal(keptQueue?.entity_id, "keep_diary_1");
    const keptDraft = db.getFirstSync<{ id: string }>(
      "SELECT id FROM form_drafts WHERE id = ?",
      ["draft_keep"]
    );
    assert.equal(keptDraft?.id, "draft_keep");
    const origin = db.getFirstSync<{ dispatch_generation: number }>(
      "SELECT dispatch_generation FROM entries_local WHERE id = ?",
      ["keep_diary_1"]
    );
    assert.equal(Number(origin?.dispatch_generation ?? -1), 0);

    const originalsDir = path.join(tmp, "originals");
    fs.mkdirSync(originalsDir, { recursive: true });
    const localOriginalHasher = createSqliteHostLocalOriginalHasher();
    assert.equal(localOriginalHasher.executionLabel, SQLITE_HOST);
    const writeKnownOriginal = (name: string, bytes: Uint8Array) => {
      const localPath = path.join(originalsDir, name);
      fs.writeFileSync(localPath, bytes);
      return {
        localPath,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        sizeBytes: bytes.byteLength,
      };
    };

    const server = createFakeGrinServerPort();
    const evidence = createFakeEvidenceUploadPort({ failOriginalTimes: 1 });
    let box = new GrinOutbox({ db, server, evidence, maxAttempts: 2, localOriginalHasher });

    const sessionA1 = box.beginOwnerSession("owner_a");
    const queued = box.persistDraftAndQueue(sessionA1, {
      ledgerId: "ledger_1",
      receiptId: "grcp_stable_1",
      commandId: "gcmd_stable01",
      body: body("grcp_stable_1", "first"),
    });
    assert.equal(queued.localState, "queued");
    assert.equal(queued.receiptId, "grcp_stable_1");
    assert.equal(queued.commandId, "gcmd_stable01");
    assert.equal(queued.issuedNumber, null);
    assert.equal(queued.serverRegisteredAtUtc, null);
    assert.ok(queued.digest.length > 0);
    const frozenDigest = queued.digest;

    const mutated = box.saveDraft(sessionA1, {
      ledgerId: "ledger_1",
      receiptId: "grcp_stable_1",
      body: body("grcp_stable_1", "edited after queue"),
    });
    assert.equal(mutated.ok, false);
    if (mutated.ok) throw new Error("expected digest_conflict");
    assert.equal(mutated.code, "digest_conflict");
    const stillQueued = peekQueuedCommand(db, "owner_a", "ledger_1", "gcmd_stable01");
    assert.equal(stillQueued?.digest, frozenDigest);
    assert.equal(stillQueued?.localState, "queued");
    const frozenBody = stillQueued?.frozenPayload as { remarks?: { value?: string } };
    assert.notEqual(frozenBody?.remarks?.value, "edited after queue");

    const conflictedAdmit = box.persistDraftAndQueue(sessionA1, {
      ledgerId: "ledger_1",
      receiptId: "grcp_stable_1",
      commandId: "gcmd_stable01",
      body: body("grcp_stable_1", "silent mutate"),
    });
    assert.equal(conflictedAdmit.localState, "conflicted");
    assert.equal(conflictedAdmit.issuedNumber, null);

    const q2 = box.persistDraftAndQueue(sessionA1, {
      ledgerId: "ledger_1",
      receiptId: "grcp_retry_1",
      commandId: "gcmd_retry_01",
      body: body("grcp_retry_1"),
    });
    assert.equal(q2.localState, "queued");
    const retryOriginal = writeKnownOriginal("grin-orig-1.bin", Buffer.from("grin-retry-original-bytes"));
    box.attachLocalFile(sessionA1, {
      ledgerId: "ledger_1",
      receiptId: "grcp_retry_1",
      evidenceId: "ev_orig_1",
      role: "original",
      localPath: retryOriginal.localPath,
      claimedSha256: retryOriginal.sha256,
      byteSize: retryOriginal.sizeBytes,
      category: "invoice",
      captureProvenance: "imported_original",
    });
    box.attachLocalFile(sessionA1, {
      ledgerId: "ledger_1",
      receiptId: "grcp_retry_1",
      evidenceId: "ev_orig_1",
      role: "thumbnail",
      localPath: "/tmp/grin-thumb-1.jpg",
      byteSize: 4,
    });

    db = reopen();
    box = new GrinOutbox({ db, server, evidence, maxAttempts: 2, localOriginalHasher });
    const afterRestart = box.getRecord("owner_a", "ledger_1", "grcp_retry_1");
    assert.equal(afterRestart?.receiptId, "grcp_retry_1");
    assert.equal(afterRestart?.commandId, "gcmd_retry_01");
    assert.equal(afterRestart?.localState, "queued");
    assert.equal(afterRestart?.issuedNumber, null);
    assert.equal(afterRestart?.serverRegisteredAtUtc, null);

    const sessionA2 = box.beginOwnerSession("owner_a");
    assert.notEqual(sessionA2.dispatchGeneration, sessionA1.dispatchGeneration);

    const issuedPending = await box.dispatchDue(sessionA2, "worker_a");
    const retryResult = issuedPending.results.find((r) => r.commandId === "gcmd_retry_01");
    assert.equal(retryResult?.localState, "attachment_pending");
    assert.equal(retryResult?.issuedNumber, "GRIN/MAIN/FY2026-27/000001");
    assert.equal(server.serialsIssued, 1);
    const pendingRow = box.getRecord("owner_a", "ledger_1", "grcp_retry_1");
    assert.equal(pendingRow?.localState, "attachment_pending");
    assert.equal(pendingRow?.issuedNumber, "GRIN/MAIN/FY2026-27/000001");
    assert.equal(pendingRow?.serverRegisteredAtUtc, "2026-09-28T12:00:00.000Z");

    const earlyRelease = box.releaseLocalOriginalIfDurable("owner_a", "ledger_1", "ev_orig_1");
    assert.equal(earlyRelease.ok, false);
    if (earlyRelease.ok) throw new Error("expected refuse");
    assert.match(earlyRelease.reason, /Thumbnail or metadata upload success is not a durable-upload/);
    assert.equal(earlyRelease.reason, DURABLE_ORIGINAL_UPLOAD_CONDITION);

    const afterThumb = await box.dispatchDue(sessionA2, "worker_a");
    assert.equal(afterThumb.results[0]?.localState, "attachment_pending");
    assert.equal(evidence.thumbnailSuccesses >= 1, true);
    assert.equal(evidence.originalAttempts, 1);
    const filesAfterThumb = box.listLocalFiles("owner_a", "ledger_1", "grcp_retry_1");
    const original = filesAfterThumb.find((f) => f.role === "original");
    const thumb = filesAfterThumb.find((f) => f.role === "thumbnail");
    assert.equal(original?.retainLocal, true);
    assert.equal(original?.originalDurable, false);
    assert.equal(thumb?.uploadState, "uploaded_derivative");
    assert.equal(thumb?.originalDurable, false);

    const afterOrig = await box.dispatchDue(sessionA2, "worker_a");
    assert.equal(afterOrig.results[0]?.localState, "issued");
    const filesAfterOrig = box.listLocalFiles("owner_a", "ledger_1", "grcp_retry_1");
    assert.equal(filesAfterOrig.find((f) => f.role === "original")?.originalDurable, true);
    assert.equal(filesAfterOrig.find((f) => f.role === "original")?.retainLocal, true);
    assert.equal(filesAfterOrig.find((f) => f.role === "original")?.category, "invoice");
    assert.equal(filesAfterOrig.find((f) => f.role === "original")?.actualSha256, retryOriginal.sha256);
    assert.equal(filesAfterOrig.find((f) => f.role === "original")?.claimedSha256, retryOriginal.sha256);
    assert.notEqual(filesAfterOrig.find((f) => f.role === "original")?.objectGeneration, "verified");
    assert.equal(filesAfterOrig.find((f) => f.role === "original")?.mime, "application/pdf");
    assert.equal(filesAfterOrig.find((f) => f.role === "original")?.verifiedSizeBytes, retryOriginal.sizeBytes);
    assert.equal(filesAfterOrig.find((f) => f.role === "original")?.captureProvenance, "imported_original");
    const released = box.releaseLocalOriginalIfDurable("owner_a", "ledger_1", "ev_orig_1");
    assert.equal(released.ok, true);
    assert.equal(box.listLocalFiles("owner_a", "ledger_1", "grcp_retry_1").find((f) => f.role === "original")?.retainLocal, false);

    server.dropNextResponse = true;
    const lost = box.persistDraftAndQueue(sessionA2, {
      ledgerId: "ledger_1",
      receiptId: "grcp_lost_1",
      commandId: "gcmd_lost_01",
      body: body("grcp_lost_1"),
    });
    assert.equal(lost.issuedNumber, null);
    const lostReport = await box.dispatchDue(sessionA2, "worker_a");
    const lostItem = lostReport.results.find((r) => r.commandId === "gcmd_lost_01");
    assert.equal(lostItem?.localState, "issued");
    assert.equal(lostItem?.replayed, true);
    assert.equal(server.serialsIssued, 2);
    assert.ok(server.reconcileCalls >= 1);
    assert.equal(box.getRecord("owner_a", "ledger_1", "grcp_lost_1")?.issuedNumber, "GRIN/MAIN/FY2026-27/000002");

    const holdBody = box.persistDraftAndQueue(sessionA2, {
      ledgerId: "ledger_1",
      receiptId: "grcp_lease_1",
      commandId: "gcmd_lease_01",
      body: body("grcp_lease_1"),
    });
    assert.equal(holdBody.localState, "queued");
    let releaseHold!: () => void;
    server.holdNextRegister = new Promise<void>((resolve) => {
      releaseHold = resolve;
    });
    const firstWorker = box.dispatchDue(sessionA2, "worker_dup_1");
    await server.waitUntilRegisterEntered();
    const secondWorker = await box.dispatchDue(sessionA2, "worker_dup_2");
    assert.equal(
      secondWorker.results.some((r) => r.commandId === "gcmd_lease_01" && r.skipped === "lease_held"),
      true
    );
    releaseHold();
    const firstDone = await firstWorker;
    assert.equal(firstDone.results.find((r) => r.commandId === "gcmd_lease_01")?.localState, "issued");
    server.holdNextRegister = null;
    const serialsAfterLease = server.serialsIssued;

    const sessionB = box.beginOwnerSession("owner_b");
    assert.equal(box.listForOwner("owner_b").length, 0);
    assert.equal(box.listForOwnerAndLedger("owner_a", "ledger_1").some((r) => r.receiptId === "grcp_lost_1"), true);
    assert.equal(box.listForOwnerAndLedger("owner_a", "ledger_other").length, 0);
    assert.ok(box.listForOwner("owner_a").some((r) => r.receiptId === "grcp_lost_1"));
    const bFlush = await box.dispatchDue(sessionB, "worker_b");
    assert.equal(bFlush.processed, 0);
    assert.equal(server.serialsIssued, serialsAfterLease);
    assert.equal(box.getRecord("owner_b", "ledger_1", "grcp_lost_1"), null);
    assert.equal(box.getRecord("owner_a", "ledger_1", "grcp_lost_1")?.ownerUid, "owner_a");

    box.endOwnerSession("owner_a");
    const stale = await box.dispatchDue(sessionA2, "worker_stale");
    assert.equal(stale.processed, 0);
    const sessionA3 = box.beginOwnerSession("owner_a");
    assert.notEqual(sessionA3.dispatchGeneration, sessionA2.dispatchGeneration);
    const genQueued = box.persistDraftAndQueue(sessionA3, {
      ledgerId: "ledger_1",
      receiptId: "grcp_gen_1",
      commandId: "gcmd_gen_001",
      body: body("grcp_gen_1"),
    });
    assert.equal(genQueued.localState, "queued");
    const genFlush = await box.dispatchDue(sessionA3, "worker_a3");
    assert.equal(genFlush.results.find((r) => r.commandId === "gcmd_gen_001")?.localState, "issued");

    const perm = box.persistDraftAndQueue(sessionA3, {
      ledgerId: "ledger_1",
      receiptId: "grcp_perm_1",
      commandId: "gcmd_perm_01",
      body: body("grcp_perm_1"),
    });
    assert.equal(perm.localState, "queued");
    server.denyCode = "invalid";
    const permFlush = await box.dispatchDue(sessionA3, "worker_a3");
    const permItem = permFlush.results.find((r) => r.commandId === "gcmd_perm_01");
    assert.equal(permItem?.localState, "failed_permanent");
    assert.equal(box.getRecord("owner_a", "ledger_1", "grcp_perm_1")?.lastErrorActionable, "fix_command_payload");
    assert.equal(box.getRecord("owner_a", "ledger_1", "grcp_perm_1")?.issuedNumber, null);
    server.denyCode = null;

    server.denyCode = "unauthenticated";
    const retryable = box.persistDraftAndQueue(sessionA3, {
      ledgerId: "ledger_1",
      receiptId: "grcp_auth_1",
      commandId: "gcmd_auth_01",
      body: body("grcp_auth_1"),
    });
    assert.equal(retryable.localState, "queued");
    const r1 = await box.dispatchDue(sessionA3, "worker_a3");
    assert.equal(r1.results.find((r) => r.commandId === "gcmd_auth_01")?.localState, "failed_retryable");
    const r2 = await box.dispatchDue(sessionA3, "worker_a3");
    assert.equal(r2.results.find((r) => r.commandId === "gcmd_auth_01")?.localState, "failed_permanent");
    assert.equal(box.getRecord("owner_a", "ledger_1", "grcp_auth_1")?.lastErrorActionable, "retry_exhausted");
    server.denyCode = null;

    setOutboxCrashHook(() => {
      throw new Error("injected crash");
    });
    try {
      box.persistDraftAndQueue(sessionA3, {
        ledgerId: "ledger_1",
        receiptId: "grcp_crash_1",
        commandId: "gcmd_crash01",
        body: body("grcp_crash_1"),
      });
      assert.fail("expected injected crash");
    } catch (e) {
      assert.equal((e as Error).message, "injected crash");
    } finally {
      setOutboxCrashHook(null);
    }
    assert.equal(box.getRecord("owner_a", "ledger_1", "grcp_crash_1"), null);
    assert.equal(peekQueuedCommand(db, "owner_a", "ledger_1", "gcmd_crash01"), null);
    assert.ok(box.getRecord("owner_a", "ledger_1", "grcp_perm_1"));

    const draft = box.persistDraft(sessionA3, {
      ledgerId: "ledger_1",
      receiptId: "grcp_draft_1",
      commandId: "gcmd_draft01",
      body: body("grcp_draft_1", "draft-only"),
    });
    assert.equal(draft.localState, "draft");
    assert.equal(draft.issuedNumber, null);
    setOutboxCrashHook(() => {
      throw new Error("injected crash after receipt");
    });
    try {
      box.persistDraftAndQueue(sessionA3, {
        ledgerId: "ledger_1",
        receiptId: "grcp_draft_1",
        commandId: "gcmd_draft01",
        body: body("grcp_draft_1", "draft-only"),
      });
      assert.fail("expected injected crash");
    } catch (e) {
      assert.equal((e as Error).message, "injected crash after receipt");
    } finally {
      setOutboxCrashHook(null);
    }
    const draftAfter = box.getRecord("owner_a", "ledger_1", "grcp_draft_1");
    assert.equal(draftAfter?.localState, "draft");
    assert.equal(peekQueuedCommand(db, "owner_a", "ledger_1", "gcmd_draft01"), null);

    const queuedThenCrash = box.persistDraftAndQueue(sessionA3, {
      ledgerId: "ledger_1",
      receiptId: "grcp_disp_1",
      commandId: "gcmd_disp_01",
      body: body("grcp_disp_1"),
    });
    assert.equal(queuedThenCrash.localState, "queued");
    setOutboxCrashHook((phase) => {
      if (phase === "after_dispatching") throw new Error("injected crash after dispatching");
    });
    try {
      await box.dispatchDue(sessionA3, "worker_crash_disp");
      assert.fail("expected injected crash");
    } catch (e) {
      assert.equal((e as Error).message, "injected crash after dispatching");
    } finally {
      setOutboxCrashHook(null);
    }
    db = reopen();
    box = new GrinOutbox({ db, server, evidence, maxAttempts: 2, localOriginalHasher });
    const midDispatch = box.getRecord("owner_a", "ledger_1", "grcp_disp_1");
    assert.equal(midDispatch?.localState, "dispatching");
    assert.equal(midDispatch?.commandId, "gcmd_disp_01");
    assert.equal(midDispatch?.issuedNumber, null);
    const sessionA4 = box.beginOwnerSession("owner_a");
    const recovered = await box.recoverAfterRestart(sessionA4, "worker_recover");
    assert.equal(recovered.results.find((r) => r.commandId === "gcmd_disp_01")?.localState, "issued");
    assert.equal(box.getRecord("owner_a", "ledger_1", "grcp_disp_1")?.issuedNumber != null, true);

    const retireQueued = box.persistDraftAndQueue(sessionA4, {
      ledgerId: "ledger_1",
      receiptId: "grcp_retire_1",
      commandId: "gcmd_retire01",
      body: body("grcp_retire_1"),
    });
    assert.equal(retireQueued.localState, "queued");
    box.attachLocalFile(sessionA4, {
      ledgerId: "ledger_1",
      receiptId: "grcp_retire_1",
      evidenceId: "ev_retire_1",
      role: "original",
      localPath: "/tmp/grin-retire.bin",
      category: "weighment",
      byteSize: 8,
    });
    const hold = box.applyAccountRetirementHold("owner_a");
    assert.ok(hold.retainedUnsyncCount > 0);
    const purge = box.purgeOwnerLocalGrin("owner_a");
    assert.equal(purge.ok, false);
    if (purge.ok) throw new Error("expected purge refuse");
    assert.equal(purge.code, "unsync_evidence_retained");
    assert.equal(box.getRecord("owner_a", "ledger_1", "grcp_retire_1")?.localState, "queued");
    assert.equal(box.listLocalFiles("owner_a", "ledger_1", "grcp_retire_1")[0]?.retainLocal, true);
    assert.equal(box.listLocalFiles("owner_a", "ledger_1", "grcp_retire_1")[0]?.localPath, "/tmp/grin-retire.bin");

    const reconcilesBeforeThrow = server.reconcileCalls;
    server.throwNonNetworkAfterCommit = true;
    const thrown = box.persistDraftAndQueue(sessionA4, {
      ledgerId: "ledger_1",
      receiptId: "grcp_throw_1",
      commandId: "gcmd_throw01",
      body: body("grcp_throw_1"),
    });
    assert.equal(thrown.issuedNumber, null);
    await assert.rejects(
      () => box.dispatchDue(sessionA4, "worker_throw"),
      (err: unknown) => err instanceof TypeError && err.message === "clock_failure"
    );
    assert.equal(server.reconcileCalls, reconcilesBeforeThrow);
    const thrownRow = box.getRecord("owner_a", "ledger_1", "grcp_throw_1");
    assert.equal(thrownRow?.issuedNumber, null);
    assert.equal(thrownRow?.serverRegisteredAtUtc, null);

    const sessionC = box.beginOwnerSession("owner_c");
    const amendQueued = box.persistDraftAndQueue(sessionC, {
      ledgerId: "ledger_1",
      receiptId: "grcp_amend_1",
      commandId: "gcmd_amend01",
      commandType: "amendFields",
      body: { receiptId: "grcp_amend_1", expectedVersion: 1 },
    });
    assert.equal(amendQueued.localState, "queued");
    assert.equal(amendQueued.issuedNumber, null);
    const amendFlush = await box.dispatchDue(sessionC, "worker_c");
    const amendItem = amendFlush.results.find((r) => r.commandId === "gcmd_amend01");
    assert.equal(amendItem?.skipped, "unsupported_type");
    assert.notEqual(amendItem?.localState, "dispatching");
    assert.equal(amendItem?.localState, "queued");
    const amendRow = peekQueuedCommand(db, "owner_c", "ledger_1", "gcmd_amend01");
    assert.equal(amendRow?.commandType, "amendFields");
    assert.equal(amendRow?.localState, "queued");
    assert.equal(amendRow?.leaseWorkerId, null);
    assert.equal(amendRow?.leaseUntilMs, null);
    assert.equal(box.getRecord("owner_c", "ledger_1", "grcp_amend_1")?.localState, "queued");
    assert.equal(box.getRecord("owner_c", "ledger_1", "grcp_amend_1")?.issuedNumber, null);

    const mutateServer = createFakeGrinServerPort({ mutate: true });
    const mutateBox = new GrinOutbox({ db, server: mutateServer, evidence, maxAttempts: 2 });
    const sessionD = mutateBox.beginOwnerSession("owner_d");
    const mutateQueued = mutateBox.persistDraftAndQueue(sessionD, {
      ledgerId: "ledger_1",
      receiptId: "grcp_amend_d",
      commandId: "gcmd_amend_d",
      commandType: "amendFields",
      body: { receiptId: "grcp_amend_d", expectedVersion: 1 },
    });
    assert.equal(mutateQueued.localState, "queued");
    const mutateFlush = await mutateBox.dispatchDue(sessionD, "worker_d");
    const mutateItem = mutateFlush.results.find((r) => r.commandId === "gcmd_amend_d");
    assert.equal(mutateItem?.skipped, undefined);
    assert.equal(mutateItem?.localState, "issued");
    assert.equal(mutateItem?.issuedNumber, null);
    assert.equal(mutateServer.serialsIssued, 0);
    const mutatePeek = peekQueuedCommand(db, "owner_d", "ledger_1", "gcmd_amend_d");
    assert.equal(mutatePeek?.localState, "issued");
    assert.equal(mutatePeek?.leaseWorkerId, null);
    assert.equal(mutateBox.getRecord("owner_d", "ledger_1", "grcp_amend_d")?.issuedNumber, null);

    // ER-1: same-owner session retirement during in-flight register must not persist issuedNumber.
    const er1Server = createFakeGrinServerPort();
    const er1Box = new GrinOutbox({ db, server: er1Server });
    const sessionEr1 = er1Box.beginOwnerSession("owner_er1");
    const er1Queued = er1Box.persistDraftAndQueue(sessionEr1, {
      ledgerId: "ledger_1",
      receiptId: "grcp_er1_1",
      commandId: "gcmd_er1_001",
      body: body("grcp_er1_1"),
    });
    assert.equal(er1Queued.localState, "queued");
    let releaseEr1!: () => void;
    er1Server.holdNextRegister = new Promise<void>((resolve) => {
      releaseEr1 = resolve;
    });
    const er1Inflight = er1Box.dispatchDue(sessionEr1, "worker_er1");
    await er1Server.waitUntilRegisterEntered();
    er1Box.endOwnerSession("owner_er1");
    releaseEr1();
    const er1Done = await er1Inflight;
    er1Server.holdNextRegister = null;
    const er1Item = er1Done.results.find((r) => r.commandId === "gcmd_er1_001");
    assert.equal(er1Item?.skipped, "session_retired");
    assert.equal(er1Done.processed, 0);
    assert.equal(er1Box.getRecord("owner_er1", "ledger_1", "grcp_er1_1")?.issuedNumber, null);
    assert.equal(er1Box.getRecord("owner_er1", "ledger_1", "grcp_er1_1")?.localState, "dispatching");
    assert.equal(er1Server.serialsIssued, 1);
    const sessionEr1b = er1Box.beginOwnerSession("owner_er1");
    const er1Recover = await er1Box.dispatchDue(sessionEr1b, "worker_er1_b");
    const er1Recovered = er1Recover.results.find((r) => r.commandId === "gcmd_er1_001");
    assert.equal(er1Recovered?.localState, "issued");
    assert.equal(er1Recovered?.replayed, true);
    assert.equal(er1Server.serialsIssued, 1);
    assert.equal(er1Box.getRecord("owner_er1", "ledger_1", "grcp_er1_1")?.issuedNumber, "GRIN/MAIN/FY2026-27/000001");

    // ER-1: stale worker must not persist after another worker takes the lease during await.
    let nowMs = 2_000_000;
    const leaseClock = { nowMs: () => nowMs };
    const leaseServer = createFakeGrinServerPort();
    const leaseBox = new GrinOutbox({ db, server: leaseServer, clock: leaseClock, leaseTtlMs: 1_000 });
    const sessionLease = leaseBox.beginOwnerSession("owner_er2");
    const leaseQueued = leaseBox.persistDraftAndQueue(sessionLease, {
      ledgerId: "ledger_1",
      receiptId: "grcp_er2_1",
      commandId: "gcmd_er2_001",
      body: body("grcp_er2_1"),
    });
    assert.equal(leaseQueued.localState, "queued");
    let releaseLease!: () => void;
    leaseServer.holdNextRegister = new Promise<void>((resolve) => {
      releaseLease = resolve;
    });
    const staleWorker = leaseBox.dispatchDue(sessionLease, "worker_er2_a");
    await leaseServer.waitUntilRegisterEntered();
    nowMs += 5_000;
    const winnerWorker = leaseBox.dispatchDue(sessionLease, "worker_er2_b");
    const stealDeadline = Date.now() + 2_000;
    let stolen = peekQueuedCommand(db, "owner_er2", "ledger_1", "gcmd_er2_001");
    while (stolen?.leaseWorkerId !== "worker_er2_b" && Date.now() < stealDeadline) {
      await Promise.resolve();
      stolen = peekQueuedCommand(db, "owner_er2", "ledger_1", "gcmd_er2_001");
    }
    assert.equal(stolen?.leaseWorkerId, "worker_er2_b");
    releaseLease();
    const [staleDone, winnerDone] = await Promise.all([staleWorker, winnerWorker]);
    leaseServer.holdNextRegister = null;
    assert.equal(staleDone.results.find((r) => r.commandId === "gcmd_er2_001")?.skipped, "lease_held");
    assert.equal(staleDone.results.find((r) => r.commandId === "gcmd_er2_001")?.issuedNumber, null);
    assert.equal(winnerDone.results.find((r) => r.commandId === "gcmd_er2_001")?.localState, "issued");
    assert.equal(leaseServer.serialsIssued, 1);
    assert.equal(leaseBox.getRecord("owner_er2", "ledger_1", "grcp_er2_1")?.issuedNumber, "GRIN/MAIN/FY2026-27/000001");

    const erMutServer = createFakeGrinServerPort({ mutate: true });
    const erMutBox = new GrinOutbox({ db, server: erMutServer });
    const sessionErMut = erMutBox.beginOwnerSession("owner_er3");
    const erMutQueued = erMutBox.persistDraftAndQueue(sessionErMut, {
      ledgerId: "ledger_1",
      receiptId: "grcp_er3_1",
      commandId: "gcmd_er3_001",
      commandType: "amendFields",
      body: { receiptId: "grcp_er3_1", expectedVersion: 1 },
    });
    assert.equal(erMutQueued.localState, "queued");
    let releaseMut!: () => void;
    erMutServer.holdNextMutate = new Promise<void>((resolve) => {
      releaseMut = resolve;
    });
    const erMutInflight = erMutBox.dispatchDue(sessionErMut, "worker_er3");
    await erMutServer.waitUntilMutateEntered();
    erMutBox.endOwnerSession("owner_er3");
    releaseMut();
    const erMutDone = await erMutInflight;
    erMutServer.holdNextMutate = null;
    assert.equal(erMutDone.results.find((r) => r.commandId === "gcmd_er3_001")?.skipped, "session_retired");
    assert.equal(erMutDone.processed, 0);
    assert.equal(erMutBox.getRecord("owner_er3", "ledger_1", "grcp_er3_1")?.localState, "dispatching");
    const sessionErMut2 = erMutBox.beginOwnerSession("owner_er3");
    const erMutRecover = await erMutBox.dispatchDue(sessionErMut2, "worker_er3_b");
    assert.equal(erMutRecover.results.find((r) => r.commandId === "gcmd_er3_001")?.localState, "issued");
    assert.equal(erMutRecover.results.find((r) => r.commandId === "gcmd_er3_001")?.replayed, true);
    assert.equal(erMutBox.getRecord("owner_er3", "ledger_1", "grcp_er3_1")?.issuedNumber, null);

    // W2-01: retired persist must throw session_retired and must not self-revive.
    const sessionRetirePersist = box.beginOwnerSession("owner_w201");
    box.endOwnerSession("owner_w201");
    assert.throws(
      () =>
        box.persistDraftAndQueue(sessionRetirePersist, {
          ledgerId: "ledger_1",
          receiptId: "grcp_w201_1",
          commandId: "gcmd_w201_01",
          body: body("grcp_w201_1"),
        }),
      (err: unknown) => err instanceof Error && err.message === "session_retired"
    );
    assert.throws(
      () =>
        box.persistMutationAndQueue(sessionRetirePersist, {
          ledgerId: "ledger_1",
          receiptId: "grcp_w201_1",
          commandId: "gcmd_w201_m1",
          type: "amendFields",
          body: { receiptId: "grcp_w201_1", expectedVersion: 1 },
        }),
      (err: unknown) => err instanceof Error && err.message === "session_retired"
    );
    assert.equal(box.getRecord("owner_w201", "ledger_1", "grcp_w201_1"), null);
    const runtimeW201 = db.getFirstSync<{ session_active: number; dispatch_generation: number }>(
      "SELECT session_active, dispatch_generation FROM grin_owner_runtime WHERE owner_uid = ?",
      ["owner_w201"]
    );
    assert.equal(Number(runtimeW201?.session_active), 0);

    // W2-01 / W2-02: persistMutationAndQueue is a real queue, not an always-refusing stub.
    const mutSession = mutateBox.beginOwnerSession("owner_w201b");
    const issuedFirst = mutateBox.persistDraftAndQueue(mutSession, {
      ledgerId: "ledger_1",
      receiptId: "grcp_w201b",
      commandId: "gcmd_w201b_r",
      body: body("grcp_w201b"),
    });
    assert.equal(issuedFirst.localState, "queued");
    const issuedFlush = await mutateBox.dispatchDue(mutSession, "worker_w201b");
    assert.equal(issuedFlush.results.find((r) => r.commandId === "gcmd_w201b_r")?.localState, "issued");
    const serialsBeforeMut = mutateServer.serialsIssued;
    const mutQueued = mutateBox.persistMutationAndQueue(mutSession, {
      ledgerId: "ledger_1",
      receiptId: "grcp_w201b",
      commandId: "gcmd_w201b_m2",
      type: "recordQc",
      body: { receiptId: "grcp_w201b", expectedVersion: 1 },
    });
    assert.equal(mutQueued.commandId, "gcmd_w201b_m2");
    assert.equal(peekQueuedCommand(db, "owner_w201b", "ledger_1", "gcmd_w201b_m2")?.localState, "queued");
    const againSame = mutateBox.persistMutationAndQueue(mutSession, {
      ledgerId: "ledger_1",
      receiptId: "grcp_w201b",
      commandId: "gcmd_w201b_m2",
      type: "recordQc",
      body: { receiptId: "grcp_w201b", expectedVersion: 1 },
    });
    assert.equal(againSame.commandId, "gcmd_w201b_m2");
    const mutDispatch = await mutateBox.dispatchDue(mutSession, "worker_w201b");
    assert.equal(mutDispatch.results.find((r) => r.commandId === "gcmd_w201b_m2")?.localState, "issued");
    assert.equal(mutateServer.serialsIssued, serialsBeforeMut);
    assert.equal(mutateBox.getRecord("owner_w201b", "ledger_1", "grcp_w201b")?.issuedNumber != null, true);

    const mutConflictSession = mutateBox.beginOwnerSession("owner_w201c");
    const mutConflictQueued = mutateBox.persistMutationAndQueue(mutConflictSession, {
      ledgerId: "ledger_1",
      receiptId: "grcp_w201c",
      commandId: "gcmd_w201c_m",
      type: "amendFields",
      body: { receiptId: "grcp_w201c", expectedVersion: 1 },
    });
    assert.equal(mutConflictQueued.localState, "queued");
    const mutConflictIdempotent = mutateBox.persistMutationAndQueue(mutConflictSession, {
      ledgerId: "ledger_1",
      receiptId: "grcp_w201c",
      commandId: "gcmd_w201c_m",
      type: "amendFields",
      body: { receiptId: "grcp_w201c", expectedVersion: 1 },
    });
    assert.equal(mutConflictIdempotent.localState, "queued");
    const conflictedMut = mutateBox.persistMutationAndQueue(mutConflictSession, {
      ledgerId: "ledger_1",
      receiptId: "grcp_w201c",
      commandId: "gcmd_w201c_m",
      type: "amendFields",
      body: { receiptId: "grcp_w201c", expectedVersion: 99 },
    });
    assert.equal(conflictedMut.localState, "conflicted");

    // W2-02: concurrent dispatchDue with the same worker name must not both own the live attempt.
    const sameWorkerServer = createFakeGrinServerPort();
    const sameWorkerBox = new GrinOutbox({ db, server: sameWorkerServer });
    const sessionSame = sameWorkerBox.beginOwnerSession("owner_same");
    sameWorkerBox.persistDraftAndQueue(sessionSame, {
      ledgerId: "ledger_1",
      receiptId: "grcp_same_1",
      commandId: "gcmd_same_01",
      body: body("grcp_same_1"),
    });
    let releaseSame!: () => void;
    sameWorkerServer.holdNextRegister = new Promise<void>((resolve) => {
      releaseSame = resolve;
    });
    const firstSame = sameWorkerBox.dispatchDue(sessionSame, "worker_same");
    await sameWorkerServer.waitUntilRegisterEntered();
    const firstAttempt = peekQueuedCommand(db, "owner_same", "ledger_1", "gcmd_same_01");
    assert.ok(firstAttempt?.leaseAttemptId);
    const secondSame = await sameWorkerBox.dispatchDue(sessionSame, "worker_same");
    assert.equal(
      secondSame.results.some((r) => r.commandId === "gcmd_same_01" && r.skipped === "lease_held"),
      true
    );
    assert.equal(peekQueuedCommand(db, "owner_same", "ledger_1", "gcmd_same_01")?.leaseAttemptId, firstAttempt?.leaseAttemptId);
    releaseSame();
    const firstSameDone = await firstSame;
    sameWorkerServer.holdNextRegister = null;
    assert.equal(firstSameDone.results.find((r) => r.commandId === "gcmd_same_01")?.localState, "issued");
    assert.equal(sameWorkerServer.serialsIssued, 1);

    // W2-02: expiry takeover; old success and old failure must not clobber the new attempt.
    let fenceNow = 3_000_000;
    const fenceClock = { nowMs: () => fenceNow };
    const fenceServer = createFakeGrinServerPort();
    const fenceBox = new GrinOutbox({ db, server: fenceServer, clock: fenceClock, leaseTtlMs: 1_000 });
    const sessionFence = fenceBox.beginOwnerSession("owner_fence");
    fenceBox.persistDraftAndQueue(sessionFence, {
      ledgerId: "ledger_1",
      receiptId: "grcp_fence_1",
      commandId: "gcmd_fence01",
      body: body("grcp_fence_1"),
    });
    let releaseFenceOld!: () => void;
    fenceServer.holdNextRegister = new Promise<void>((resolve) => {
      releaseFenceOld = resolve;
    });
    const oldAttemptDispatch = fenceBox.dispatchDue(sessionFence, "worker_fence_old");
    await fenceServer.waitUntilRegisterEntered();
    fenceNow += 5_000;
    fenceServer.holdNextRegister = null;
    fenceServer.refreshEnteredWait();
    const newAttemptDispatch = fenceBox.dispatchDue(sessionFence, "worker_fence_new");
    const stealUntil = Date.now() + 2_000;
    let stolenFence = peekQueuedCommand(db, "owner_fence", "ledger_1", "gcmd_fence01");
    while (stolenFence?.leaseWorkerId !== "worker_fence_new" && Date.now() < stealUntil) {
      await Promise.resolve();
      stolenFence = peekQueuedCommand(db, "owner_fence", "ledger_1", "gcmd_fence01");
    }
    assert.equal(stolenFence?.leaseWorkerId, "worker_fence_new");
    const newAttemptId = stolenFence?.leaseAttemptId;
    assert.ok(newAttemptId);
    assert.notEqual(newAttemptId, firstAttempt?.leaseAttemptId);
    const newDone = await newAttemptDispatch;
    assert.equal(newDone.results.find((r) => r.commandId === "gcmd_fence01")?.localState, "issued");
    assert.equal(fenceBox.getRecord("owner_fence", "ledger_1", "grcp_fence_1")?.issuedNumber, "GRIN/MAIN/FY2026-27/000001");
    fenceServer.denyCode = "invalid";
    releaseFenceOld();
    const oldDone = await oldAttemptDispatch;
    fenceServer.denyCode = null;
    fenceServer.holdNextRegister = null;
    assert.equal(oldDone.results.find((r) => r.commandId === "gcmd_fence01")?.skipped, "lease_held");
    assert.equal(oldDone.results.find((r) => r.commandId === "gcmd_fence01")?.issuedNumber, null);
    assert.notEqual(fenceBox.getRecord("owner_fence", "ledger_1", "grcp_fence_1")?.localState, "failed_permanent");
    assert.equal(fenceBox.getRecord("owner_fence", "ledger_1", "grcp_fence_1")?.issuedNumber, "GRIN/MAIN/FY2026-27/000001");
    assert.equal(peekQueuedCommand(db, "owner_fence", "ledger_1", "gcmd_fence01")?.leaseAttemptId, null);

    // W2-02: retirement BEFORE an ambiguous failure would start reconcile.
    const retireServer = createFakeGrinServerPort();
    const retireBox = new GrinOutbox({ db, server: retireServer });
    const sessionRetireRpc = retireBox.beginOwnerSession("owner_retire_rpc");
    retireBox.persistDraftAndQueue(sessionRetireRpc, {
      ledgerId: "ledger_1",
      receiptId: "grcp_retire_rpc",
      commandId: "gcmd_retrpc01",
      body: body("grcp_retire_rpc"),
    });
    const reconcilesBeforeAmbiguous = retireServer.reconcileCalls;
    let releaseRetireRpc!: () => void;
    retireServer.holdNextRegister = new Promise<void>((resolve) => {
      releaseRetireRpc = resolve;
    });
    const retireInflight = retireBox.dispatchDue(sessionRetireRpc, "worker_retire_rpc");
    await retireServer.waitUntilRegisterEntered();
    retireBox.endOwnerSession("owner_retire_rpc");
    retireServer.dropNextResponse = true;
    releaseRetireRpc();
    const retireAmbiguous = await retireInflight;
    retireServer.holdNextRegister = null;
    assert.equal(retireAmbiguous.results.find((r) => r.commandId === "gcmd_retrpc01")?.skipped, "session_retired");
    assert.equal(retireServer.reconcileCalls, reconcilesBeforeAmbiguous);
    assert.equal(retireBox.getRecord("owner_retire_rpc", "ledger_1", "grcp_retire_rpc")?.issuedNumber, null);
    const sessionRetireReplay = retireBox.beginOwnerSession("owner_retire_rpc");
    const replayedRetire = await retireBox.dispatchDue(sessionRetireReplay, "worker_retire_rpc2");
    assert.equal(replayedRetire.results.find((r) => r.commandId === "gcmd_retrpc01")?.localState, "issued");
    assert.equal(replayedRetire.results.find((r) => r.commandId === "gcmd_retrpc01")?.replayed, true);
    assert.equal(retireServer.serialsIssued, 1);

    // W2-02: SQLITE_HOST reopen replay without a second serial (not NATIVE_DEVICE).
    const replayServer = createFakeGrinServerPort();
    replayServer.dropNextResponse = true;
    let replayBox = new GrinOutbox({ db, server: replayServer });
    const sessionReplay1 = replayBox.beginOwnerSession("owner_replay");
    replayBox.persistDraftAndQueue(sessionReplay1, {
      ledgerId: "ledger_1",
      receiptId: "grcp_replay_1",
      commandId: "gcmd_replay01",
      body: body("grcp_replay_1"),
    });
    const lostReplay = await replayBox.dispatchDue(sessionReplay1, "worker_replay");
    assert.equal(lostReplay.results.find((r) => r.commandId === "gcmd_replay01")?.replayed, true);
    assert.equal(replayServer.serialsIssued, 1);
    db = reopen();
    replayBox = new GrinOutbox({ db, server: replayServer });
    const sessionReplay2 = replayBox.beginOwnerSession("owner_replay");
    const afterReopen = await replayBox.recoverAfterRestart(sessionReplay2, "worker_replay2");
    const replayItem = afterReopen.results.find((r) => r.commandId === "gcmd_replay01");
    assert.ok(replayItem == null || replayItem.localState === "issued" || replayItem.skipped);
    assert.equal(replayBox.getRecord("owner_replay", "ledger_1", "grcp_replay_1")?.issuedNumber, "GRIN/MAIN/FY2026-27/000001");
    assert.equal(replayServer.serialsIssued, 1);

    // W2-02 / W2-03: account switch during original and derivative upload; derivative failure; identity fence.
    const evServer = createFakeGrinServerPort();
    const evPort = createFakeEvidenceUploadPort();
    const evBox = new GrinOutbox({ db, server: evServer, evidence: evPort, localOriginalHasher });
    const sessionEv = evBox.beginOwnerSession("owner_ev");
    evBox.persistDraftAndQueue(sessionEv, {
      ledgerId: "ledger_1",
      receiptId: "grcp_ev_1",
      commandId: "gcmd_ev_0001",
      body: body("grcp_ev_1"),
    });
    const switchOriginal = writeKnownOriginal("grin-switch.bin", Buffer.from("grin-switch-original-bytes"));
    evBox.attachLocalFile(sessionEv, {
      ledgerId: "ledger_1",
      receiptId: "grcp_ev_1",
      evidenceId: "ev_switch_1",
      role: "original",
      localPath: switchOriginal.localPath,
      claimedSha256: switchOriginal.sha256,
      byteSize: switchOriginal.sizeBytes,
      category: "ewb",
      captureProvenance: "imported_original",
    });
    evBox.attachLocalFile(sessionEv, {
      ledgerId: "ledger_1",
      receiptId: "grcp_ev_1",
      evidenceId: "ev_switch_1",
      role: "thumbnail",
      localPath: "/tmp/grin-switch.jpg",
      byteSize: 3,
    });
    const registeredEv = await evBox.dispatchDue(sessionEv, "worker_ev");
    assert.equal(registeredEv.results.find((r) => r.commandId === "gcmd_ev_0001")?.localState, "attachment_pending");

    evPort.failNextDerivative = true;
    evPort.remainingOriginalFails = 5;
    const derivFail = await evBox.dispatchDue(sessionEv, "worker_ev");
    assert.equal(derivFail.results.find((r) => r.commandId === "gcmd_ev_0001")?.localState, "attachment_pending");
    const afterDerivFail = evBox.listLocalFiles("owner_ev", "ledger_1", "grcp_ev_1");
    assert.notEqual(afterDerivFail.find((f) => f.role === "thumbnail")?.uploadState, "uploaded_derivative");
    assert.equal(afterDerivFail.find((f) => f.role === "original")?.originalDurable, false);

    evPort.holdUploadRole = "original";
    evPort.remainingOriginalFails = 0;
    evPort.failNextDerivative = false;
    let releaseOrigUpload!: () => void;
    evPort.holdNextUpload = new Promise<void>((resolve) => {
      releaseOrigUpload = resolve;
    });
    evPort.refreshUploadEnteredWait();
    const origInflight = evBox.dispatchDue(sessionEv, "worker_ev");
    await evPort.waitUntilUploadEntered();
    evBox.endOwnerSession("owner_ev");
    releaseOrigUpload();
    const origSwitched = await origInflight;
    evPort.holdNextUpload = null;
    evPort.holdUploadRole = null;
    assert.equal(origSwitched.results.find((r) => r.commandId === "gcmd_ev_0001")?.skipped, "session_retired");
    assert.equal(evBox.listLocalFiles("owner_ev", "ledger_1", "grcp_ev_1").find((f) => f.role === "original")?.originalDurable, false);

    const sessionEv2 = evBox.beginOwnerSession("owner_ev");
    evPort.mismatchOriginalIdentity = true;
    const mismatchFlush = await evBox.dispatchDue(sessionEv2, "worker_ev2");
    assert.equal(mismatchFlush.results.find((r) => r.commandId === "gcmd_ev_0001")?.localState, "attachment_pending");
    assert.equal(evBox.listLocalFiles("owner_ev", "ledger_1", "grcp_ev_1").find((f) => f.role === "original")?.originalDurable, false);
    evPort.mismatchOriginalIdentity = false;
    const recoveredEv = await evBox.dispatchDue(sessionEv2, "worker_ev2");
    assert.equal(recoveredEv.results.find((r) => r.commandId === "gcmd_ev_0001")?.localState, "issued");
    const recoveredFiles = evBox.listLocalFiles("owner_ev", "ledger_1", "grcp_ev_1");
    assert.equal(recoveredFiles.find((f) => f.role === "original")?.originalDurable, true);
    assert.equal(recoveredFiles.find((f) => f.role === "original")?.category, "ewb");
    assert.equal(recoveredFiles.find((f) => f.role === "thumbnail")?.originalDurable, false);
    assert.equal(recoveredFiles.find((f) => f.role === "thumbnail")?.uploadState, "uploaded_derivative");

    const refreshServer = createFakeGrinServerPort({ readReceipt: true });
    const refreshEvidence = createFakeEvidenceUploadPort();
    const refreshBox = new GrinOutbox({
      db,
      server: refreshServer,
      evidence: refreshEvidence,
      localOriginalHasher,
    });
    const refreshOwner = "owner_confirm_refresh";
    const refreshSession = refreshBox.beginOwnerSession(refreshOwner);
    const refreshKnown = writeKnownOriginal("grin-confirm.bin", Buffer.from("grin-confirm-refresh-bytes"));
    refreshBox.persistDraftAndQueue(refreshSession, {
      ledgerId: "ledger_1",
      receiptId: "grcp_confirm_1",
      commandId: "gcmd_confirm_1",
      body: body("grcp_confirm_1"),
    });
    refreshBox.attachLocalFile(refreshSession, {
      ledgerId: "ledger_1",
      receiptId: "grcp_confirm_1",
      evidenceId: "ev_confirm_1",
      role: "original",
      localPath: refreshKnown.localPath,
      claimedSha256: refreshKnown.sha256,
      byteSize: refreshKnown.sizeBytes,
      category: "invoice",
      captureProvenance: "imported_original",
    });
    const refreshReg = await refreshBox.dispatchDue(refreshSession, "worker_confirm");
    assert.equal(refreshReg.results.find((r) => r.commandId === "gcmd_confirm_1")?.localState, "attachment_pending");
    const confirmV1 = refreshBox.getConfirmedProjection(refreshOwner, "ledger_1", "grcp_confirm_1");
    assert.equal(confirmV1?.eventVersion, 1);
    assert.equal(refreshBox.getRecord(refreshOwner, "ledger_1", "grcp_confirm_1")?.issuedNumber, "GRIN/MAIN/FY2026-27/000001");
    refreshServer.failNextRead = true;
    const refreshFail = await refreshBox.dispatchDue(refreshSession, "worker_confirm");
    assert.equal(refreshFail.results.find((r) => r.commandId === "gcmd_confirm_1")?.localState, "attachment_pending");
    assert.equal(
      refreshBox.listLocalFiles(refreshOwner, "ledger_1", "grcp_confirm_1").find((f) => f.role === "original")?.originalDurable,
      true
    );
    assert.equal(refreshBox.getConfirmedProjection(refreshOwner, "ledger_1", "grcp_confirm_1")?.eventVersion, 1);
    assert.equal(refreshBox.getRecord(refreshOwner, "ledger_1", "grcp_confirm_1")?.issuedNumber, "GRIN/MAIN/FY2026-27/000001");
    assert.equal(refreshServer.serialsIssued, 1);
    const confirmV2 = {
      receiptId: "grcp_confirm_1",
      eventVersion: 2,
      headHash: "b".repeat(64),
      original: confirmV1!.original,
      effective: confirmV1!.effective,
      events: [
        ...confirmV1!.events,
        {
          ...confirmV1!.events[0]!,
          eventId: "gevt_ev_confirm_1",
          streamSequence: 2,
          type: "evidence_verified" as const,
          expectedPreviousVersion: 1,
          previousHash: confirmV1!.headHash,
          eventHash: "b".repeat(64),
          typedChanges: { evidenceId: "ev_confirm_1", rawSha256: refreshKnown.sha256 },
        },
      ],
    };
    refreshServer.setConfirmedProjection(refreshOwner, "ledger_1", confirmV2);
    refreshServer.refreshEnteredWait();
    let releaseConfirmRead!: () => void;
    refreshServer.holdNextRead = new Promise<void>((resolve) => {
      releaseConfirmRead = resolve;
    });
    const confirmInflight = refreshBox.dispatchDue(refreshSession, "worker_confirm");
    await refreshServer.waitUntilReadEntered();
    refreshBox.endOwnerSession(refreshOwner);
    releaseConfirmRead();
    const confirmStolen = await confirmInflight;
    refreshServer.holdNextRead = null;
    assert.equal(confirmStolen.results.find((r) => r.commandId === "gcmd_confirm_1")?.skipped, "session_retired");
    assert.equal(refreshBox.getConfirmedProjection(refreshOwner, "ledger_1", "grcp_confirm_1")?.eventVersion, 1);
    const refreshSession2 = refreshBox.beginOwnerSession(refreshOwner);
    assert.notEqual(refreshSession2.dispatchGeneration, refreshSession.dispatchGeneration);
    const refreshOk = await refreshBox.dispatchDue(refreshSession2, "worker_confirm_2");
    assert.equal(refreshOk.results.find((r) => r.commandId === "gcmd_confirm_1")?.localState, "issued");
    const storedV2 = refreshBox.getConfirmedProjection(refreshOwner, "ledger_1", "grcp_confirm_1");
    assert.equal(storedV2?.eventVersion, 2);
    assert.equal(storedV2?.headHash, "b".repeat(64));
    assert.equal(JSON.stringify(storedV2?.original), JSON.stringify(confirmV1?.original));
    assert.equal(refreshBox.getRecord(refreshOwner, "ledger_1", "grcp_confirm_1")?.issuedNumber, "GRIN/MAIN/FY2026-27/000001");
    assert.equal(refreshServer.serialsIssued, 1);
    refreshBox.persistConfirmedProjection(refreshSession2, {
      ...confirmV2,
      eventVersion: 1,
      headHash: "c".repeat(64),
    });
    assert.equal(refreshBox.getConfirmedProjection(refreshOwner, "ledger_1", "grcp_confirm_1")?.eventVersion, 2);
    assert.equal(refreshBox.getConfirmedProjection(refreshOwner, "ledger_1", "grcp_confirm_1")?.headHash, "b".repeat(64));

    evPort.holdUploadRole = "thumbnail";
    const sessionDeriv = evBox.beginOwnerSession("owner_ev_d");
    evBox.persistDraftAndQueue(sessionDeriv, {
      ledgerId: "ledger_1",
      receiptId: "grcp_ev_d",
      commandId: "gcmd_ev_d001",
      body: body("grcp_ev_d"),
    });
    evBox.attachLocalFile(sessionDeriv, {
      ledgerId: "ledger_1",
      receiptId: "grcp_ev_d",
      evidenceId: "ev_deriv_1",
      role: "original",
      localPath: "/tmp/grin-deriv.bin",
      claimedSha256: "d".repeat(64),
      byteSize: 9,
      category: "vehicle",
    });
    evBox.attachLocalFile(sessionDeriv, {
      ledgerId: "ledger_1",
      receiptId: "grcp_ev_d",
      evidenceId: "ev_deriv_1",
      role: "thumbnail",
      localPath: "/tmp/grin-deriv.jpg",
      byteSize: 2,
    });
    await evBox.dispatchDue(sessionDeriv, "worker_ev_d");
    evPort.remainingOriginalFails = 5;
    evPort.refreshUploadEnteredWait();
    let releaseThumb!: () => void;
    evPort.holdNextUpload = new Promise<void>((resolve) => {
      releaseThumb = resolve;
    });
    const thumbInflight = evBox.dispatchDue(sessionDeriv, "worker_ev_d");
    await evPort.waitUntilUploadEntered();
    evBox.endOwnerSession("owner_ev_d");
    releaseThumb();
    const thumbSwitched = await thumbInflight;
    evPort.holdNextUpload = null;
    evPort.holdUploadRole = null;
    assert.equal(thumbSwitched.results.find((r) => r.commandId === "gcmd_ev_d001")?.skipped, "session_retired");
    const thumbFiles = evBox.listLocalFiles("owner_ev_d", "ledger_1", "grcp_ev_d");
    assert.notEqual(thumbFiles.find((f) => f.role === "thumbnail")?.uploadState, "uploaded_derivative");
    assert.equal(thumbFiles.find((f) => f.role === "original")?.originalDurable, false);

    // F1: in-memory claim flips live token without sqlite begin; A is retired before persistEnd.
    const f1Box = new GrinOutbox({ db, server: createFakeGrinServerPort() });
    const claimedA = f1Box.claimOwnerSession("owner_f1_a");
    const sqliteBeforeBegin = db.getFirstSync<{ dispatch_generation: number; session_active: number }>(
      "SELECT dispatch_generation, session_active FROM grin_owner_runtime WHERE owner_uid = ?",
      ["owner_f1_a"]
    );
    assert.equal(sqliteBeforeBegin, null);
    assert.equal(f1Box.isSessionCurrent(claimedA), true);
    const claimedB = f1Box.claimOwnerSession("owner_f1_b");
    assert.equal(f1Box.isSessionCurrent(claimedA), false);
    assert.equal(f1Box.isSessionCurrent(claimedB), true);
    f1Box.persistBeginOwnerSession(claimedB);
    const sqliteB = db.getFirstSync<{ dispatch_generation: number; session_active: number }>(
      "SELECT dispatch_generation, session_active FROM grin_owner_runtime WHERE owner_uid = ?",
      ["owner_f1_b"]
    );
    assert.equal(Number(sqliteB?.session_active), 1);
    assert.equal(Number(sqliteB?.dispatch_generation), claimedB.dispatchGeneration);
    f1Box.persistEndOwnerSession(claimedA);
    assert.equal(f1Box.isSessionCurrent(claimedA), false);

    const logoutA1 = f1Box.beginOwnerSession("owner_f1_logout");
    f1Box.persistDraftAndQueue(logoutA1, {
      ledgerId: "ledger_1",
      receiptId: "grcp_f1_logout",
      commandId: "gcmd_f1logout",
      body: body("grcp_f1_logout"),
    });
    f1Box.endOwnerSession("owner_f1_logout");
    assert.equal(f1Box.isSessionCurrent(logoutA1), false);
    const logoutA2 = f1Box.beginOwnerSession("owner_f1_logout");
    assert.notEqual(logoutA2.dispatchGeneration, logoutA1.dispatchGeneration);
    assert.equal(f1Box.isSessionCurrent(logoutA1), false);
    const staleLogout = await f1Box.dispatchDue(logoutA1, "worker_f1_old_gen");
    assert.equal(staleLogout.processed, 0);
    const freshLogout = await f1Box.dispatchDue(logoutA2, "worker_f1_new_gen");
    assert.equal(freshLogout.results.find((r) => r.commandId === "gcmd_f1logout")?.localState, "issued");

    // F2: without readReceipt, confirmation stays null (T4 must refuse mutation).
    assert.equal(f1Box.getConfirmedProjection("owner_a", "ledger_1", "grcp_retry_1"), null);

    const confirmServer = createFakeGrinServerPort({ mutate: true, readReceipt: true });
    const confirmBox = new GrinOutbox({ db, server: confirmServer });
    const confirmSession = confirmBox.beginOwnerSession("owner_f2");
    confirmBox.persistDraftAndQueue(confirmSession, {
      ledgerId: "ledger_1",
      receiptId: "grcp_f2_1",
      commandId: "gcmd_f2_reg",
      body: body("grcp_f2_1"),
    });
    const confirmReg = await confirmBox.dispatchDue(confirmSession, "worker_f2");
    assert.equal(confirmReg.results.find((r) => r.commandId === "gcmd_f2_reg")?.localState, "issued");
    const confirmed1 = confirmBox.getConfirmedProjection("owner_f2", "ledger_1", "grcp_f2_1");
    assert.ok(confirmed1);
    assert.equal(confirmed1.eventVersion >= 1, true);
    assert.equal(confirmed1.receiptId, "grcp_f2_1");
    assert.ok(Array.isArray(confirmed1.events));
    assert.equal(confirmServer.readReceiptCalls >= 1, true);

    confirmBox.persistMutationAndQueue(confirmSession, {
      ledgerId: "ledger_1",
      receiptId: "grcp_f2_1",
      commandId: "gcmd_f2_m1",
      type: "amendFields",
      body: { receiptId: "grcp_f2_1", expectedVersion: confirmed1.eventVersion, reason: "note", clientObservedAtUtc: "2026-09-28T13:00:00.000Z" },
    });
    confirmBox.persistMutationAndQueue(confirmSession, {
      ledgerId: "ledger_1",
      receiptId: "grcp_f2_1",
      commandId: "gcmd_f2_m2",
      type: "recordQc",
      body: { receiptId: "grcp_f2_1", expectedVersion: confirmed1.eventVersion, reason: "qc", qcStatus: "accepted", clientObservedAtUtc: "2026-09-28T13:01:00.000Z" },
    });
    let releaseM1!: () => void;
    confirmServer.holdNextMutate = new Promise<void>((resolve) => {
      releaseM1 = resolve;
    });
    const sequentialInflight = confirmBox.dispatchDue(confirmSession, "worker_f2");
    await confirmServer.waitUntilMutateEntered();
    const overlapping = await confirmBox.dispatchDue(confirmSession, "worker_f2b");
    assert.equal(
      overlapping.results.some((r) => r.commandId === "gcmd_f2_m2" && r.skipped === "predecessor_inflight"),
      true
    );
    confirmServer.holdNextMutate = null;
    releaseM1();
    const sequential = await sequentialInflight;
    assert.equal(sequential.results.find((r) => r.commandId === "gcmd_f2_m1")?.localState, "issued");
    const confirmedAfterM1 = confirmBox.getConfirmedProjection("owner_f2", "ledger_1", "grcp_f2_1");
    assert.ok(confirmedAfterM1 && confirmedAfterM1.eventVersion >= 2);
    const afterFirstMut = await confirmBox.dispatchDue(confirmSession, "worker_f2");
    const m2Result =
      sequential.results.find((r) => r.commandId === "gcmd_f2_m2") ??
      afterFirstMut.results.find((r) => r.commandId === "gcmd_f2_m2");
    assert.equal(m2Result?.localState ?? peekQueuedCommand(db, "owner_f2", "ledger_1", "gcmd_f2_m2")?.localState, "conflicted");

    const staleVersion = confirmBox.persistMutationAndQueue(confirmSession, {
      ledgerId: "ledger_1",
      receiptId: "grcp_f2_1",
      commandId: "gcmd_f2_conflict",
      type: "amendFields",
      body: { receiptId: "grcp_f2_1", expectedVersion: 1, reason: "stale", clientObservedAtUtc: "2026-09-28T13:02:00.000Z" },
    });
    assert.equal(peekQueuedCommand(db, "owner_f2", "ledger_1", "gcmd_f2_conflict")?.localState, "queued");
    void staleVersion;
    const conflictedFlush = await confirmBox.dispatchDue(confirmSession, "worker_f2");
    assert.equal(conflictedFlush.results.find((r) => r.commandId === "gcmd_f2_conflict")?.localState, "conflicted");
    const conflictedPeek = peekQueuedCommand(db, "owner_f2", "ledger_1", "gcmd_f2_conflict");
    assert.equal(conflictedPeek?.localState, "conflicted");
    assert.equal(conflictedPeek?.digest, staleVersion.digest);

    confirmServer.dropNextResponse = true;
    const lostSession = confirmBox.beginOwnerSession("owner_f2_lost");
    confirmBox.persistDraftAndQueue(lostSession, {
      ledgerId: "ledger_1",
      receiptId: "grcp_f2_lost",
      commandId: "gcmd_f2_lost",
      body: body("grcp_f2_lost"),
    });
    const lostConfirm = await confirmBox.dispatchDue(lostSession, "worker_f2_lost");
    assert.equal(lostConfirm.results.find((r) => r.commandId === "gcmd_f2_lost")?.replayed, true);
    const lostProjection = confirmBox.getConfirmedProjection("owner_f2_lost", "ledger_1", "grcp_f2_lost");
    assert.ok(lostProjection);
    const firstHash = lostProjection.headHash;
    const replayLost = await confirmBox.dispatchDue(lostSession, "worker_f2_lost");
    assert.ok(replayLost.results.find((r) => r.commandId === "gcmd_f2_lost") == null || replayLost.results.find((r) => r.commandId === "gcmd_f2_lost")?.skipped);
    assert.equal(confirmBox.getConfirmedProjection("owner_f2_lost", "ledger_1", "grcp_f2_lost")?.headHash, firstHash);

    assert.throws(
      () =>
        confirmBox.persistConfirmedProjection(lostSession, {
          receiptId: "grcp_f2_lost",
          eventVersion: 0,
          headHash: "a".repeat(64),
          original: { receiptId: "grcp_f2_lost" } as never,
          events: [],
          effective: { receiptId: "grcp_f2_lost" } as never,
        }),
      (err: unknown) => err instanceof Error && err.message === "invalid_confirmed_projection"
    );

    // E2/E3: drive originalIdentityMatches through production processAttachments (not a copy).
    const { buildOriginalStoragePath } = await import("@/goodsEvidence/evidence");
    const e2Owner = "owner_e2";
    const e2Ledger = "ledger_1";
    function e2StoragePath(uid: string, evidenceId: string): string {
      const key = `hostobj${evidenceId}`.replace(/[^A-Za-z0-9_-]/g, "x").padEnd(16, "x").slice(0, 64);
      return buildOriginalStoragePath(uid, key);
    }
    async function enqueueOriginal(opts: {
      receiptId: string;
      commandId: string;
      evidenceId: string;
      bytes: Uint8Array;
      category?: "invoice" | "ewb" | "weighment";
      claimedSha256?: string | null;
      byteSize?: number | null;
      captureProvenance?: string | null;
    }) {
      const e2Server = createFakeGrinServerPort();
      const e2Port = createFakeEvidenceUploadPort();
      const e2Box = new GrinOutbox({
        db: db!,
        server: e2Server,
        evidence: e2Port,
        localOriginalHasher,
      });
      const session = e2Box.beginOwnerSession(e2Owner);
      e2Box.persistDraftAndQueue(session, {
        ledgerId: e2Ledger,
        receiptId: opts.receiptId,
        commandId: opts.commandId,
        body: body(opts.receiptId),
      });
      const known = writeKnownOriginal(`${opts.evidenceId}.bin`, opts.bytes);
      e2Box.attachLocalFile(session, {
        ledgerId: e2Ledger,
        receiptId: opts.receiptId,
        evidenceId: opts.evidenceId,
        role: "original",
        localPath: known.localPath,
        claimedSha256: opts.claimedSha256 === undefined ? known.sha256 : opts.claimedSha256,
        byteSize: opts.byteSize === undefined ? known.sizeBytes : opts.byteSize,
        category: opts.category ?? "invoice",
        captureProvenance: opts.captureProvenance ?? "imported_original",
      });
      const registered = await e2Box.dispatchDue(session, `worker_${opts.commandId}_reg`);
      assert.equal(registered.results.find((r) => r.commandId === opts.commandId)?.localState, "attachment_pending");
      return { e2Box, e2Port, session, known };
    }

    const echoKnown = Buffer.from("grin-e2-echo-claimed-must-not-substitute");
    const echoCase = await enqueueOriginal({
      receiptId: "grcp_e2_echo",
      commandId: "gcmd_e2_echo",
      evidenceId: "ev_e2_echo",
      bytes: echoKnown,
    });
    echoCase.e2Port.nextOriginalResult = {
      ok: true,
      originalDurable: true,
      generation: "orig-gen-1",
      retryable: false,
      ownerUid: e2Owner,
      mime: "application/pdf",
      sizeBytes: echoCase.known.sizeBytes,
      storagePath: e2StoragePath(e2Owner, "ev_e2_echo"),
      evidenceId: "ev_e2_echo",
      receiptId: "grcp_e2_echo",
      ledgerId: e2Ledger,
      category: "invoice",
      claimedSha256: echoCase.known.sha256,
      actualSha256: "0".repeat(64),
      reservationId: "resv_e2_echo",
    };
    const echoFlush = await echoCase.e2Box.dispatchDue(echoCase.session, "worker_e2_echo");
    assert.equal(echoFlush.results.find((r) => r.commandId === "gcmd_e2_echo")?.localState, "attachment_pending");
    assert.equal(echoCase.e2Box.listLocalFiles(e2Owner, e2Ledger, "grcp_e2_echo").find((f) => f.role === "original")?.originalDurable, false);

    const nullCase = await enqueueOriginal({
      receiptId: "grcp_e2_null",
      commandId: "gcmd_e2_null",
      evidenceId: "ev_e2_null",
      bytes: Buffer.from("grin-e2-null-hashes"),
      claimedSha256: null,
    });
    nullCase.e2Port.nextOriginalResult = {
      ok: true,
      originalDurable: true,
      generation: "orig-gen-1",
      retryable: false,
      ownerUid: e2Owner,
      mime: "application/pdf",
      sizeBytes: nullCase.known.sizeBytes,
      storagePath: e2StoragePath(e2Owner, "ev_e2_null"),
      evidenceId: "ev_e2_null",
      receiptId: "grcp_e2_null",
      ledgerId: e2Ledger,
      category: "invoice",
      claimedSha256: null,
      actualSha256: null,
      reservationId: "resv_e2_null",
    };
    await nullCase.e2Box.dispatchDue(nullCase.session, "worker_e2_null");
    assert.equal(nullCase.e2Box.listLocalFiles(e2Owner, e2Ledger, "grcp_e2_null").find((f) => f.role === "original")?.originalDurable, false);

    const mismatchCases: Array<{
      name: string;
      receiptId: string;
      commandId: string;
      evidenceId: string;
      patch: Parameters<typeof Object.assign>[1] & Record<string, unknown>;
    }> = [
      { name: "owner", receiptId: "grcp_e2_own", commandId: "gcmd_e2_own", evidenceId: "ev_e2_own", patch: { ownerUid: "other_owner" } },
      { name: "receipt", receiptId: "grcp_e2_rcp", commandId: "gcmd_e2_rcp", evidenceId: "ev_e2_rcp", patch: { receiptId: "grcp_other" } },
      { name: "ledger", receiptId: "grcp_e2_led", commandId: "gcmd_e2_led", evidenceId: "ev_e2_led", patch: { ledgerId: "ledger_other" } },
      { name: "category", receiptId: "grcp_e2_cat", commandId: "gcmd_e2_cat", evidenceId: "ev_e2_cat", patch: { category: "ewb" } },
      { name: "evidenceId", receiptId: "grcp_e2_eid", commandId: "gcmd_e2_eid", evidenceId: "ev_e2_eid", patch: { evidenceId: "ev_other" } },
      { name: "size", receiptId: "grcp_e2_sz", commandId: "gcmd_e2_sz", evidenceId: "ev_e2_sz", patch: { sizeBytes: 1 } },
      { name: "generation", receiptId: "grcp_e2_gen", commandId: "gcmd_e2_gen", evidenceId: "ev_e2_gen", patch: { generation: "verified" } },
      { name: "invalid-generation", receiptId: "grcp_e2_igen", commandId: "gcmd_e2_igen", evidenceId: "ev_e2_igen", patch: { generation: "" } },
    ];
    for (const mismatch of mismatchCases) {
      const packed = await enqueueOriginal({
        receiptId: mismatch.receiptId,
        commandId: mismatch.commandId,
        evidenceId: mismatch.evidenceId,
        bytes: Buffer.from(`grin-e2-${mismatch.name}`),
      });
      packed.e2Port.originalResultPatch = mismatch.patch as never;
      await packed.e2Box.dispatchDue(packed.session, `worker_${mismatch.commandId}`);
      assert.equal(
        packed.e2Box.listLocalFiles(e2Owner, e2Ledger, mismatch.receiptId).find((f) => f.role === "original")?.originalDurable,
        false,
        mismatch.name
      );
    }

    const positiveBytes = new Uint8Array(HASH_CHUNK_BYTES + 17);
    positiveBytes.fill(0x5a);
    positiveBytes.set(Buffer.from("GRIN-E2-KNOWN"));
    const independentPositive = createHash("sha256").update(positiveBytes).digest("hex");
    const positive = await enqueueOriginal({
      receiptId: "grcp_e2_ok",
      commandId: "gcmd_e2_ok",
      evidenceId: "ev_e2_ok",
      bytes: positiveBytes,
    });
    assert.equal(positive.known.sha256, independentPositive);
    const positiveFlush = await positive.e2Box.dispatchDue(positive.session, "worker_e2_ok");
    assert.equal(positiveFlush.results.find((r) => r.commandId === "gcmd_e2_ok")?.localState, "issued");
    const positiveFile = positive.e2Box.listLocalFiles(e2Owner, e2Ledger, "grcp_e2_ok").find((f) => f.role === "original");
    assert.equal(positiveFile?.originalDurable, true);
    assert.equal(positiveFile?.actualSha256, independentPositive);
    assert.equal(positiveFile?.claimedSha256, independentPositive);
    assert.equal(positiveFile?.mime, "application/pdf");
    assert.equal(positiveFile?.verifiedSizeBytes, positiveBytes.byteLength);
    assert.equal(positiveFile?.objectGeneration, "orig-gen-1");
    assert.notEqual(positiveFile?.objectGeneration, "verified");
    assert.ok(positiveFile?.storagePath);
    assert.equal(positiveFile?.reservationId, "resv_ev_e2_ok");
    assert.equal(positiveFile?.captureProvenance, "imported_original");

    db = reopen();
    const reopenedBox = new GrinOutbox({ db, server: createFakeGrinServerPort(), localOriginalHasher });
    const reopenedFile = reopenedBox.listLocalFiles(e2Owner, e2Ledger, "grcp_e2_ok").find((f) => f.role === "original");
    assert.equal(reopenedFile?.actualSha256, independentPositive);
    assert.equal(reopenedFile?.mime, "application/pdf");
    assert.equal(reopenedFile?.verifiedSizeBytes, positiveBytes.byteLength);
    assert.equal(reopenedFile?.objectGeneration, "orig-gen-1");
    assert.equal(reopenedFile?.storagePath, positiveFile?.storagePath);
    assert.equal(reopenedFile?.reservationId, "resv_ev_e2_ok");
    assert.equal(reopenedFile?.captureProvenance, "imported_original");
    assert.equal(reopenedFile?.claimedSha256, independentPositive);
    assert.equal(reopenedFile?.originalDurable, true);
    console.log(`SQLITE_EXECUTION=${SQLITE_HOST}`);
    console.log("NATIVE_DEVICE=not_claimed (E2/E3 SQLITE_HOST chunk hasher)");

    const otherReceipt = await enqueueOriginal({
      receiptId: "grcp_e2_b",
      commandId: "gcmd_e2_b",
      evidenceId: "ev_e2_b",
      bytes: Buffer.from("grin-e2-other-receipt"),
    });
    otherReceipt.e2Port.originalResultPatch = { receiptId: "grcp_e2_ok", evidenceId: "ev_e2_ok" };
    await otherReceipt.e2Box.dispatchDue(otherReceipt.session, "worker_e2_b");
    assert.equal(otherReceipt.e2Box.listLocalFiles(e2Owner, e2Ledger, "grcp_e2_b").find((f) => f.role === "original")?.originalDurable, false);
    assert.equal(reopenedBox.listLocalFiles(e2Owner, e2Ledger, "grcp_e2_ok").find((f) => f.role === "original")?.objectGeneration, "orig-gen-1");

    db.runSync(
      `UPDATE grin_local_evidence_files SET original_durable = 0 WHERE evidence_id = ? AND owner_uid = ? AND role = ?`,
      ["ev_e2_ok", e2Owner, "original"]
    );
    const staleOverwriteServer = createFakeGrinServerPort();
    const staleOverwritePort = createFakeEvidenceUploadPort();
    staleOverwritePort.originalResultPatch = {
      actualSha256: "f".repeat(64),
      generation: "orig-gen-stale",
      reservationId: "resv_stale",
    };
    const staleOverwriteBox = new GrinOutbox({
      db,
      server: staleOverwriteServer,
      evidence: staleOverwritePort,
      localOriginalHasher,
    });
    const staleSession = staleOverwriteBox.beginOwnerSession(e2Owner);
    await staleOverwriteBox.dispatchDue(staleSession, "worker_e2_stale");
    const afterStale = staleOverwriteBox.listLocalFiles(e2Owner, e2Ledger, "grcp_e2_ok").find((f) => f.role === "original");
    assert.equal(afterStale?.actualSha256, independentPositive);
    assert.equal(afterStale?.objectGeneration, "orig-gen-1");
    assert.notEqual(afterStale?.objectGeneration, "orig-gen-stale");

    db.runSync(
      `INSERT INTO grin_local_evidence_files (
         id, owner_uid, ledger_id, receipt_id, evidence_id, role, local_path, claimed_sha256,
         byte_size, category, upload_state, original_durable, retain_local, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
      [
        `${e2Owner}\t${e2Ledger}\tev_e2_old\toriginal`,
        e2Owner,
        e2Ledger,
        "grcp_e2_old",
        "ev_e2_old",
        "original",
        path.join(originalsDir, "missing-old.bin"),
        null,
        8,
        "invoice",
        "local_only",
        Date.now(),
        Date.now(),
      ]
    );
    const oldRow = reopenedBox.listLocalFiles(e2Owner, e2Ledger, "grcp_e2_old").find((f) => f.role === "original");
    assert.equal(oldRow?.originalDurable, false);
    assert.equal(oldRow?.actualSha256, null);
    assert.equal(oldRow?.objectGeneration, null);
    assert.equal(oldRow?.mime, null);
    assert.equal(oldRow?.storagePath, null);
    assert.equal(oldRow?.reservationId, null);

    let e2LeaseNow = Date.now();
    const e2LeaseClock = { nowMs: () => e2LeaseNow };
    const e2LeaseServer = createFakeGrinServerPort();
    const e2LeasePort = createFakeEvidenceUploadPort();
    const e2LeaseBox = new GrinOutbox({
      db,
      server: e2LeaseServer,
      evidence: e2LeasePort,
      localOriginalHasher,
      clock: e2LeaseClock,
      leaseTtlMs: 1_000,
    });
    const e2LeaseSession = e2LeaseBox.beginOwnerSession("owner_e2_lease");
    e2LeaseBox.persistDraftAndQueue(e2LeaseSession, {
      ledgerId: e2Ledger,
      receiptId: "grcp_e2_lease",
      commandId: "gcmd_e2_lease",
      body: body("grcp_e2_lease"),
    });
    const e2LeaseKnown = writeKnownOriginal("ev_e2_lease.bin", Buffer.from("grin-e2-lease-takeover"));
    e2LeaseBox.attachLocalFile(e2LeaseSession, {
      ledgerId: e2Ledger,
      receiptId: "grcp_e2_lease",
      evidenceId: "ev_e2_lease",
      role: "original",
      localPath: e2LeaseKnown.localPath,
      claimedSha256: e2LeaseKnown.sha256,
      byteSize: e2LeaseKnown.sizeBytes,
      category: "invoice",
    });
    const e2LeaseReg = await e2LeaseBox.dispatchDue(e2LeaseSession, "worker_e2_lease_reg");
    assert.equal(e2LeaseReg.results.find((r) => r.commandId === "gcmd_e2_lease")?.localState, "attachment_pending");
    e2LeasePort.holdUploadRole = "original";
    let releaseE2LeaseUpload!: () => void;
    e2LeasePort.holdNextUpload = new Promise<void>((resolve) => {
      releaseE2LeaseUpload = resolve;
    });
    e2LeasePort.refreshUploadEnteredWait();
    const staleE2Lease = e2LeaseBox.dispatchDue(e2LeaseSession, "worker_e2_lease_old");
    await e2LeasePort.waitUntilUploadEntered();
    e2LeaseNow += 5_000;
    const winnerE2Lease = e2LeaseBox.dispatchDue(e2LeaseSession, "worker_e2_lease_new");
    const e2StealUntil = Date.now() + 2_000;
    let stolenE2Lease = peekQueuedCommand(db, "owner_e2_lease", e2Ledger, "gcmd_e2_lease");
    while (stolenE2Lease?.leaseWorkerId !== "worker_e2_lease_new" && Date.now() < e2StealUntil) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      stolenE2Lease = peekQueuedCommand(db, "owner_e2_lease", e2Ledger, "gcmd_e2_lease");
    }
    assert.equal(stolenE2Lease?.leaseWorkerId, "worker_e2_lease_new");
    releaseE2LeaseUpload();
    const staleE2LeaseDone = await staleE2Lease;
    assert.equal(staleE2LeaseDone.results.find((r) => r.commandId === "gcmd_e2_lease")?.skipped, "lease_held");
    e2LeasePort.holdNextUpload = null;
    e2LeasePort.holdUploadRole = null;
    const winnerE2LeaseDone = await winnerE2Lease;
    assert.equal(winnerE2LeaseDone.results.find((r) => r.commandId === "gcmd_e2_lease")?.localState, "issued");
    assert.equal(e2LeaseBox.listLocalFiles("owner_e2_lease", e2Ledger, "grcp_e2_lease").find((f) => f.role === "original")?.originalDurable, true);

    const diaryStill = db.getFirstSync<{ id: string }>(
      "SELECT id FROM entries_local WHERE id = ?",
      ["keep_diary_1"]
    );
    assert.equal(diaryStill?.id, "keep_diary_1");
  } finally {
    setOutboxCrashHook(null);
    db?.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log("outbox.sqliteHost.test.ts: ok");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
