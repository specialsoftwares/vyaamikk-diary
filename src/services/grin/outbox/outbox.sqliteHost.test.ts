/**
 * SQLITE_HOST GRIN outbox tests. Real SQLite via Python stdlib.
 * Not NATIVE_DEVICE process-death proof.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { sampleRegisterBody } from "@/goodsEvidence/testFixtures";
import { execStatements, migrateToV7, migrateToV8, migrateToV9 } from "@/localDb/migrate";
import { migrateToV10, grinV10TablesPresent } from "@/localDb/migrateGrin";
import { MIGRATIONS_V1 } from "@/localDb/schema";
import { createFakeEvidenceUploadPort, createFakeGrinServerPort } from "./fakePorts";
import { openHostSqlite, SQLITE_HOST, type HostSqlite } from "./hostSqlite";
import { GrinOutbox, peekQueuedCommand, setOutboxCrashHook } from "./outbox";
import { DURABLE_ORIGINAL_UPLOAD_CONDITION, SQLITE_HOST_NOT_NATIVE_DEVICE } from "./types";
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

    const server = createFakeGrinServerPort();
    const evidence = createFakeEvidenceUploadPort({ failOriginalTimes: 1 });
    let box = new GrinOutbox({ db, server, evidence, maxAttempts: 2 });

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
    box.attachLocalFile(sessionA1, {
      ledgerId: "ledger_1",
      receiptId: "grcp_retry_1",
      evidenceId: "ev_orig_1",
      role: "original",
      localPath: "/tmp/grin-orig-1.bin",
      claimedSha256: "b".repeat(64),
      byteSize: 12,
      category: "invoice",
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
    box = new GrinOutbox({ db, server, evidence, maxAttempts: 2 });
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
    box = new GrinOutbox({ db, server, evidence, maxAttempts: 2 });
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
    const evBox = new GrinOutbox({ db, server: evServer, evidence: evPort });
    const sessionEv = evBox.beginOwnerSession("owner_ev");
    evBox.persistDraftAndQueue(sessionEv, {
      ledgerId: "ledger_1",
      receiptId: "grcp_ev_1",
      commandId: "gcmd_ev_0001",
      body: body("grcp_ev_1"),
    });
    evBox.attachLocalFile(sessionEv, {
      ledgerId: "ledger_1",
      receiptId: "grcp_ev_1",
      evidenceId: "ev_switch_1",
      role: "original",
      localPath: "/tmp/grin-switch.bin",
      claimedSha256: "c".repeat(64),
      byteSize: 20,
      category: "ewb",
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
