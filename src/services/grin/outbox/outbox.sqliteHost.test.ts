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
