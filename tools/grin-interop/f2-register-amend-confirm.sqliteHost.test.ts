/**
 * F2 SQLITE_HOST + INJECTED joined test.
 *
 * GrinApplicationRepository.createQueued → outbox.dispatchDue (Team 1 INJECTED G1)
 * → confirmation persists (eventVersion >= 1) → repo.amend with expectedVersion
 * from confirmed → G1 accepts → close/reopen sqlite (new GrinOutbox) →
 * effective reflects amendment and original is unchanged.
 *
 * Also: QC, partial return, pending EWB is not confirmed history, intervening
 * version_conflict, lost-response recovery via reconcile/readReceipt.
 *
 * Host reopen is not NATIVE_DEVICE process-death proof.
 * Mobile src/ must not import this file or tools/goods-evidence-emulator.
 *
 * Production repo reads getConfirmedProjection. This file must not rewrite
 * an invalid expectedVersion.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { sampleRegisterBody } from "@/goodsEvidence/testFixtures";
import { quantity } from "@/goodsEvidence/quantities";
import { DB_VERSION } from "@/localDb/schema";
import { openHostSqlite, SQLITE_HOST, type HostSqlite } from "@/services/grin/outbox/hostSqlite";
import { GrinOutbox } from "@/services/grin/outbox/outbox";
import { SQLITE_HOST_NOT_NATIVE_DEVICE } from "@/services/grin/outbox/types";
import { GrinApplicationRepository } from "@/services/grin/repository/GrinApplicationRepository";
import type { GrinDispatchSession } from "@/services/grin/outbox/types";
import { createInjectedStore, seedInjectedOwner } from "../goods-evidence-emulator/injectedStore";
import type { G1Clock } from "../goods-evidence-emulator/types";
import {
  INJECTED_PORT,
  createInjectedGrinServerPort,
  lastIssuedSerialTotal,
  persistedReceiptCount,
  type InjectedGrinServerPort,
} from "./injectedG1ServerPort";

const NOW = Date.UTC(2026, 8, 28, 12, 0, 0, 0);
const OWNER = "owner_f2_join";
const LEDGER = "ledger_f2_join";
const RECEIPT = "grcp_f2_join_1";

function interopClock(nowMs: number): G1Clock {
  let seq = 0;
  return {
    nowMs: () => nowMs,
    uuid: () => `evtf2${String(++seq).padStart(8, "0")}`,
  };
}

function wrapLostMutate(server: InjectedGrinServerPort): { dropNext(): void } {
  const orig = server.mutate!.bind(server);
  let drop = false;
  server.mutate = async (input) => {
    const result = await orig(input);
    if (drop) {
      drop = false;
      const err = new Error("lost_server_response");
      (err as { code?: string }).code = "network_ambiguous";
      throw err;
    }
    return result;
  };
  return {
    dropNext() {
      drop = true;
    },
  };
}

function repoFor(outbox: GrinOutbox, db: HostSqlite, session: GrinDispatchSession): GrinApplicationRepository {
  return new GrinApplicationRepository({
    outbox,
    db,
    ownerUid: OWNER,
    ledgerId: LEDGER,
    session,
  });
}

function warehouseOf(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const rec = value as { kind?: unknown; value?: unknown };
  if (rec.kind === "present" && typeof rec.value === "string") return rec.value;
  return null;
}

async function main(): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grin-t3-f2-"));
  const dbPath = path.join(tmp, "grin-f2.sqlite");
  let db: HostSqlite | null = null;

  const store = createInjectedStore();
  seedInjectedOwner(store, OWNER, LEDGER);
  const server = await createInjectedGrinServerPort({ store, clock: interopClock(NOW) });
  assert.equal(server.portKind, "INJECTED");
  assert.equal(typeof server.mutate, "function");
  assert.equal(typeof server.readReceipt, "function");
  const lost = wrapLostMutate(server);

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
    console.log(`PORT_KIND=${INJECTED_PORT}`);
    console.log(`INJECTED_SOURCE=${server.portSource}`);
    console.log(`NATIVE_DEVICE=not_claimed`);
    console.log(`NATIVE_DEVICE=not_claimed (${SQLITE_HOST_NOT_NATIVE_DEVICE})`);
    assert.equal(DB_VERSION, 10);

    let box = new GrinOutbox({ db, server });
    box.ensureSchema();
    let session = box.beginOwnerSession(OWNER);
    let repo = repoFor(box, db, session);

    const created = repo.createQueued(
      sampleRegisterBody({
        receiptId: RECEIPT,
        captureProvenance: "offline",
        warehouse: { kind: "present", value: "Main godown" },
      })
    );
    assert.equal(created.localState, "queued");
    assert.equal(created.issuedNumber, null);
    assert.equal(box.getConfirmedProjection(OWNER, LEDGER, RECEIPT), null);
    assert.equal(lastIssuedSerialTotal(store, OWNER, LEDGER), 0);
    assert.equal(persistedReceiptCount(store, OWNER, LEDGER), 0);

    const registerFlush = await box.dispatchDue(session, "worker_f2_reg");
    const registerItem = registerFlush.results.find((row) => row.commandId === created.commandId);
    assert.equal(registerItem?.localState, "issued", JSON.stringify(registerFlush));
    const confirmedAfterRegister = box.getConfirmedProjection(OWNER, LEDGER, RECEIPT);
    assert.ok(confirmedAfterRegister, "confirmation must persist after INJECTED register + readReceipt");
    assert.equal(confirmedAfterRegister.eventVersion >= 1, true);
    assert.equal(confirmedAfterRegister.receiptId, RECEIPT);
    assert.equal(warehouseOf(confirmedAfterRegister.original.warehouse), "Main godown");
    assert.equal(warehouseOf(confirmedAfterRegister.effective.warehouse), "Main godown");
    const originalJson = JSON.stringify(confirmedAfterRegister.original);
    assert.equal(
      confirmedAfterRegister.events.some((event) => event.type === "receipt_registered"),
      true
    );

    const payloadBeforeAmend = db.getFirstSync<{ payload_json: string }>(
      `SELECT payload_json FROM grin_local_receipts WHERE owner_uid = ? AND ledger_id = ? AND receipt_id = ?`,
      [OWNER, LEDGER, RECEIPT]
    );
    assert.ok(payloadBeforeAmend?.payload_json);

    repo.amend({
      receiptId: RECEIPT,
      reason: "correct warehouse bin note",
      changes: { warehouse: { kind: "present", value: "Bay B" } },
    });
    assert.equal(payloadBeforeAmend.payload_json, db.getFirstSync<{ payload_json: string }>(
      `SELECT payload_json FROM grin_local_receipts WHERE owner_uid = ? AND ledger_id = ? AND receipt_id = ?`,
      [OWNER, LEDGER, RECEIPT]
    )?.payload_json);

    const amendFlush = await box.dispatchDue(session, "worker_f2_amend");
    assert.equal(
      amendFlush.results.some((row) => row.localState === "issued" && !row.skipped),
      true,
      JSON.stringify(amendFlush)
    );
    const confirmedAfterAmend = box.getConfirmedProjection(OWNER, LEDGER, RECEIPT);
    assert.ok(confirmedAfterAmend);
    assert.equal(confirmedAfterAmend.eventVersion >= 2, true);
    assert.equal(warehouseOf(confirmedAfterAmend.original.warehouse), "Main godown");
    assert.equal(warehouseOf(confirmedAfterAmend.effective.warehouse), "Bay B");
    assert.equal(JSON.stringify(confirmedAfterAmend.original), originalJson);
    assert.equal(
      confirmedAfterAmend.events.some((event) => event.type === "field_amended"),
      true
    );

    db = reopen();
    box = new GrinOutbox({ db, server });
    const afterReopen = box.getConfirmedProjection(OWNER, LEDGER, RECEIPT);
    assert.ok(afterReopen);
    assert.equal(warehouseOf(afterReopen.original.warehouse), "Main godown");
    assert.equal(warehouseOf(afterReopen.effective.warehouse), "Bay B");
    assert.equal(JSON.stringify(afterReopen.original), originalJson);
    assert.equal(afterReopen.eventVersion, confirmedAfterAmend.eventVersion);
    session = box.beginOwnerSession(OWNER);
    repo = repoFor(box, db, session);

    repo.recordQc({ receiptId: RECEIPT, reason: "accepted at gate", qcStatus: "accepted" });
    const qcFlush = await box.dispatchDue(session, "worker_f2_qc");
    assert.equal(qcFlush.results.some((row) => row.localState === "issued" && !row.skipped), true);
    const afterQc = box.getConfirmedProjection(OWNER, LEDGER, RECEIPT);
    assert.ok(afterQc);
    assert.equal(
      afterQc.events.some((event) => event.type === "qc_decision" || event.type === "qc_reclassified"),
      true
    );
    assert.equal(JSON.stringify(afterQc.original), originalJson);

    repo.dispatchReturn({
      receiptId: RECEIPT,
      reason: "partial return of surplus bags",
      lineId: "line_1",
      returnQty: quantity("10", "bags"),
    });
    const returnFlush = await box.dispatchDue(session, "worker_f2_ret");
    assert.equal(returnFlush.results.some((row) => row.localState === "issued" && !row.skipped), true);
    const afterReturn = box.getConfirmedProjection(OWNER, LEDGER, RECEIPT);
    assert.ok(afterReturn);
    assert.equal(
      afterReturn.events.some((event) => event.type === "return_dispatched"),
      true
    );
    assert.equal(JSON.stringify(afterReturn.original), originalJson);

    const ewbBefore = box.getConfirmedProjection(OWNER, LEDGER, RECEIPT);
    repo.recordEwbObservation({
      receiptId: RECEIPT,
      reason: "portal unknown — not portal authority",
      channel: "portal",
      observation: {
        observedAtUtc: "2026-09-28T16:00:00.000Z",
        source: "user_reported",
        verificationLevel: "user_reported",
        status: "unknown",
      },
    });
    const pendingCmds = box.listCommandsForReceipt(OWNER, LEDGER, RECEIPT);
    const pendingEwb = pendingCmds.find((row) => row.commandType === "recordEwbObservation");
    assert.ok(pendingEwb);
    assert.equal(pendingEwb.localState, "queued");
    const confirmedWhileEwbPending = box.getConfirmedProjection(OWNER, LEDGER, RECEIPT);
    assert.ok(confirmedWhileEwbPending);
    assert.equal(confirmedWhileEwbPending.eventVersion, ewbBefore?.eventVersion);
    assert.equal(
      confirmedWhileEwbPending.events.some((event) => event.type === "ewb_observation_recorded"),
      false,
      "queued EWB must not appear as confirmed history"
    );
    const historyPending = repo.history(RECEIPT);
    assert.equal(
      historyPending.some(
        (item) => item.commandType === "recordEwbObservation" && item.localState === "queued"
      ),
      true
    );

    const ewbFlush = await box.dispatchDue(session, "worker_f2_ewb");
    assert.equal(ewbFlush.results.some((row) => row.commandId === pendingEwb.commandId && row.localState === "issued"), true);
    const afterEwb = box.getConfirmedProjection(OWNER, LEDGER, RECEIPT);
    assert.ok(afterEwb);
    assert.equal(
      afterEwb.events.some((event) => event.type === "ewb_observation_recorded"),
      true
    );

    const conflicted = box.persistMutationAndQueue(session, {
      ledgerId: LEDGER,
      receiptId: RECEIPT,
      commandId: "gcmd_f2_stale_ver",
      type: "amendFields",
      body: {
        receiptId: RECEIPT,
        expectedVersion: 1,
        reason: "stale expected version",
        changes: { remarks: { kind: "present", value: "should conflict" } },
        clientObservedAtUtc: "2026-09-28T17:00:00.000Z",
      },
    });
    void conflicted;
    const queuedStale = box.listCommandsForReceipt(OWNER, LEDGER, RECEIPT).find(
      (row) => row.commandId === "gcmd_f2_stale_ver"
    );
    assert.equal(queuedStale?.localState, "queued");
    const conflictFlush = await box.dispatchDue(session, "worker_f2_conflict");
    const conflictItem = conflictFlush.results.find((row) => row.commandId === "gcmd_f2_stale_ver");
    assert.equal(conflictItem?.localState, "conflicted");
    const stillConflicted = box.listCommandsForReceipt(OWNER, LEDGER, RECEIPT).find(
      (row) => row.commandId === "gcmd_f2_stale_ver"
    );
    assert.equal(stillConflicted?.localState, "conflicted");
    assert.equal(stillConflicted?.digest, conflicted.digest);

    const beforeLost = box.getConfirmedProjection(OWNER, LEDGER, RECEIPT);
    assert.ok(beforeLost);
    lost.dropNext();
    box.persistMutationAndQueue(session, {
      ledgerId: LEDGER,
      receiptId: RECEIPT,
      commandId: "gcmd_f2_lost_qc",
      type: "recordQc",
      body: {
        receiptId: RECEIPT,
        expectedVersion: beforeLost.eventVersion,
        reason: "lost response qc",
        qcStatus: "hold",
        clientObservedAtUtc: "2026-09-28T18:00:00.000Z",
      },
    });
    const lostFlush = await box.dispatchDue(session, "worker_f2_lost");
    const lostItem = lostFlush.results.find((row) => row.commandId === "gcmd_f2_lost_qc");
    assert.equal(lostItem?.localState, "issued");
    assert.equal(lostItem?.replayed, true);
    const afterLost = box.getConfirmedProjection(OWNER, LEDGER, RECEIPT);
    assert.ok(afterLost);
    assert.equal(afterLost.eventVersion > beforeLost.eventVersion, true);
    const lostHash = afterLost.headHash;
    const replayLost = await box.dispatchDue(session, "worker_f2_lost2");
    assert.ok(
      replayLost.results.find((row) => row.commandId === "gcmd_f2_lost_qc") == null ||
        replayLost.results.find((row) => row.commandId === "gcmd_f2_lost_qc")?.skipped
    );
    assert.equal(box.getConfirmedProjection(OWNER, LEDGER, RECEIPT)?.headHash, lostHash);
    assert.equal(JSON.stringify(box.getConfirmedProjection(OWNER, LEDGER, RECEIPT)?.original), originalJson);

    db = reopen();
    box = new GrinOutbox({ db, server });
    const durable = box.getConfirmedProjection(OWNER, LEDGER, RECEIPT);
    assert.ok(durable);
    assert.equal(warehouseOf(durable.original.warehouse), "Main godown");
    assert.equal(warehouseOf(durable.effective.warehouse), "Bay B");
    assert.equal(durable.headHash, lostHash);
    assert.equal(DB_VERSION, 10);

    console.log(`F2_CONFIRMED_EVENT_VERSION=${durable.eventVersion}`);
    console.log(`F2_SERIALS_ISSUED=${lastIssuedSerialTotal(store, OWNER, LEDGER)}`);
    console.log("f2-register-amend-confirm.sqliteHost.test.ts SQLITE_HOST+INJECTED: ok");

    if (process.env.FIRESTORE_EMULATOR_HOST) {
      await runEmulatorVariant();
      console.log("EMULATOR_VARIANT=ran");
    } else {
      console.log("FIRESTORE_EMULATOR_HOST=unset");
      console.log("EMULATOR_VARIANT=not_run");
    }
  } finally {
    db?.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function runEmulatorVariant(): Promise<void> {
  const { adminDb, fixedClock, seedOwner, wrapAdminFirestore } = await import(
    "../goods-evidence-emulator/harness"
  );
  const { GoodsEvidenceRegisterAdapter } = await import("../goods-evidence-emulator/adapter");
  const { createInjectedGrinServerPort: createTeam1Port } = await import(
    "../goods-evidence-emulator/serverPort"
  );
  const db = adminDb();
  const fsWrap = wrapAdminFirestore(db);
  const owner = "owner_f2_emu";
  const ledger = "ledger_f2_emu";
  const receiptId = "grcp_f2_emu_1";
  await seedOwner(db, owner, ledger);
  const adapter = new GoodsEvidenceRegisterAdapter(fsWrap, fixedClock(NOW));
  const port = createTeam1Port(adapter);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grin-t3-f2-emu-"));
  const sqlite = openHostSqlite(path.join(tmp, "emu.sqlite"));
  try {
    const box = new GrinOutbox({
      db: sqlite,
      server: {
        ...port,
        async readReceipt(input) {
          const snap = await db
            .doc(
              `users/${input.uid}/goodsEvidenceLedgers/${input.ledgerId}/receipts/${input.receiptId}`
            )
            .get();
          if (!snap.exists) return { ok: false, code: "not_found", detail: "denied" };
          const data = snap.data() as Record<string, unknown>;
          const eventsSnap = await db
            .collection(
              `users/${input.uid}/goodsEvidenceLedgers/${input.ledgerId}/receipts/${input.receiptId}/events`
            )
            .get();
          const events = eventsSnap.docs.map((doc) => doc.data());
          const view = data.view as { eventVersion?: unknown; headHash?: unknown };
          const { parseConfirmedProjection } = await import(
            "@/services/grin/outbox/confirmedProjection"
          );
          const confirmed = parseConfirmedProjection(
            {
              receiptId: input.receiptId,
              eventVersion: view?.eventVersion,
              headHash: view?.headHash,
              original: data.original,
              events,
              effective: data.effective ?? data.original,
            },
            input.receiptId
          );
          if (!confirmed) return { ok: false, code: "integrity", detail: "denied" };
          return { ok: true, confirmed };
        },
      },
    });
    box.ensureSchema();
    const session = box.beginOwnerSession(owner);
    const queued = box.persistDraftAndQueue(session, {
      ledgerId: ledger,
      receiptId,
      commandId: "gcmd_f2_emu_reg",
      body: sampleRegisterBody({ receiptId }),
    });
    const flush = await box.dispatchDue(session, "worker_f2_emu");
    assert.equal(flush.results.find((row) => row.commandId === queued.commandId)?.localState, "issued");
    const confirmed = box.getConfirmedProjection(owner, ledger, receiptId);
    assert.ok(confirmed);
    assert.equal(confirmed.eventVersion >= 1, true);
  } finally {
    sqlite.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
