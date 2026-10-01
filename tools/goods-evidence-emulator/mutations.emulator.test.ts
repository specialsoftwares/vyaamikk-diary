/**
 * FIRESTORE_EMULATOR — durable G4 mutations against the G1 emulator project.
 */
import assert from "node:assert/strict";

import { freezeCommand } from "../../src/goodsEvidence/command";
import { sampleRegisterBody } from "../../src/goodsEvidence/testFixtures";
import { GoodsEvidenceRegisterAdapter } from "./adapter";
import { adminDb, fixedClock, seedOwner, wrapAdminFirestore } from "./harness";
import { commandPath, receiptPath, serialPath } from "./paths";

const OWNER = "owner_mut_fs";
const LEDGER = "ledger_mut_fs";
const NOW = Date.UTC(2026, 8, 28, 12, 0, 0, 0);

function registerEnvelope(commandId: string, receiptId: string, ownerUid = OWNER, ledgerId = LEDGER) {
  const frozen = freezeCommand({
    commandId,
    type: "registerGoodsReceipt",
    ownerUid,
    ledgerId,
    body: sampleRegisterBody({ receiptId }),
  });
  return {
    commandId: frozen.commandId,
    type: frozen.type,
    ownerUid: frozen.ownerUid,
    ledgerId: frozen.ledgerId,
    body: frozen.body,
    digest: frozen.digest,
  };
}

function mutationEnvelope(
  commandId: string,
  type:
    | "amendFields"
    | "recordQc"
    | "dispatchReturn"
    | "correctReturnDispatch"
    | "voidWithReason"
    | "recordEwbObservation"
    | "linkVerifiedEvidence",
  body: Record<string, unknown>,
  ownerUid = OWNER,
  ledgerId = LEDGER
) {
  const frozen = freezeCommand({
    commandId,
    type,
    ownerUid,
    ledgerId,
    body,
  } as never);
  return {
    commandId: frozen.commandId,
    type: frozen.type,
    ownerUid: frozen.ownerUid,
    ledgerId: frozen.ledgerId,
    body: frozen.body,
    digest: frozen.digest,
  };
}

async function main(): Promise<void> {
  const db = adminDb();
  const fs = wrapAdminFirestore(db);

  {
    await seedOwner(db, OWNER, LEDGER);
    const adapter = new GoodsEvidenceRegisterAdapter(fs, fixedClock(NOW));
    const registered = await adapter.register(
      { uid: OWNER },
      registerEnvelope("commandm01", "receipt_m01")
    );
    assert.equal(registered.ok, true);
    const omitted = mutationEnvelope("commandm02", "amendFields", {
      receiptId: "receipt_m01",
      expectedVersion: 1,
      reason: "omit optional",
      changes: { remarks: { kind: "present", value: "a" } },
      clientObservedAtUtc: "2026-09-28T13:00:00.000Z",
    });
    const withUndef = {
      ...omitted,
      body: { ...omitted.body, unusedOptional: undefined },
    };
    const first = await adapter.amendFields({ uid: OWNER }, omitted);
    assert.equal(first.ok, true);
    const replay = await adapter.amendFields({ uid: OWNER }, withUndef);
    assert.equal(replay.ok && replay.replayed, true);

    const qc = await adapter.recordQc(
      { uid: OWNER },
      mutationEnvelope("commandm03", "recordQc", {
        receiptId: "receipt_m01",
        expectedVersion: 2,
        reason: "hold",
        qcStatus: "hold",
        clientObservedAtUtc: "2026-09-28T13:10:00.000Z",
      })
    );
    assert.equal(qc.ok, true);

    const dispatched = await adapter.dispatchReturn(
      { uid: OWNER },
      mutationEnvelope("commandm04", "dispatchReturn", {
        receiptId: "receipt_m01",
        expectedVersion: 3,
        reason: "return some",
        lineId: "line_1",
        returnQty: { value: "4", unit: "bags", precision: 0 },
        clientObservedAtUtc: "2026-09-28T13:20:00.000Z",
      })
    );
    assert.equal(dispatched.ok, true);
    if (!dispatched.ok) throw new Error("expected dispatch");
    const corrected = await adapter.correctReturnDispatch(
      { uid: OWNER },
      mutationEnvelope("commandm05", "correctReturnDispatch", {
        receiptId: "receipt_m01",
        expectedVersion: 4,
        reason: "count error",
        lineId: "line_1",
        linkedEventId: dispatched.eventId,
        correctionQty: { value: "1", unit: "bags", precision: 0 },
        clientObservedAtUtc: "2026-09-28T13:21:00.000Z",
      })
    );
    assert.equal(corrected.ok, true);
    const snap = await db.doc(receiptPath(OWNER, LEDGER, "receipt_m01")).get();
    assert.equal(snap.data()?.lineLedgers.line_1.dispatchedReturn.value, "3");
    assert.equal(snap.data()?.lineLedgers.line_1.physicalReceived.value, "40");
    assert.equal(snap.data()?.original.issuedNumber, "GRIN/MAIN/FY2026-27/000001");
    assert.equal(snap.data()?.effective.remarks.value, "a");
  }

  {
    await seedOwner(db, "owner_void_fs", "ledger_void_fs");
    const adapter = new GoodsEvidenceRegisterAdapter(fs, fixedClock(NOW));
    const first = await adapter.register(
      { uid: "owner_void_fs" },
      registerEnvelope("commandv01", "receipt_v01", "owner_void_fs", "ledger_void_fs")
    );
    assert.equal(first.ok, true);
    const voided = await adapter.voidWithReason(
      { uid: "owner_void_fs" },
      mutationEnvelope(
        "commandv02",
        "voidWithReason",
        {
          receiptId: "receipt_v01",
          expectedVersion: 1,
          reason: "duplicate",
          linkedReceiptId: null,
          clientObservedAtUtc: "2026-09-28T14:00:00.000Z",
        },
        "owner_void_fs",
        "ledger_void_fs"
      )
    );
    assert.equal(voided.ok, true);
    const next = await adapter.register(
      { uid: "owner_void_fs" },
      registerEnvelope("commandv03", "receipt_v02", "owner_void_fs", "ledger_void_fs")
    );
    assert.equal(next.ok && next.issuedNumber, "GRIN/MAIN/FY2026-27/000002");
    const serial = await db.doc(serialPath("owner_void_fs", "ledger_void_fs", "FY2026-27")).get();
    assert.equal(serial.data()?.lastIssuedSerial, 2);
  }

  {
    await seedOwner(db, "owner_auth_fs", "ledger_auth_fs");
    const adapter = new GoodsEvidenceRegisterAdapter(fs, fixedClock(NOW));
    await adapter.register(
      { uid: "owner_auth_fs" },
      registerEnvelope("commanda01", "receipt_a01", "owner_auth_fs", "ledger_auth_fs")
    );
    const env = mutationEnvelope(
      "commanda02",
      "recordQc",
      {
        receiptId: "receipt_a01",
        expectedVersion: 1,
        reason: "qc",
        qcStatus: "accepted",
        clientObservedAtUtc: "2026-09-28T15:00:00.000Z",
      },
      "owner_auth_fs",
      "ledger_auth_fs"
    );
    const committed = await adapter.recordQc({ uid: "owner_auth_fs" }, env);
    assert.equal(committed.ok, true);
    await seedOwner(db, "owner_auth_fs", "ledger_auth_fs", { userStatus: "pending_deletion" });
    const replay = await adapter.recordQc({ uid: "owner_auth_fs" }, env);
    const rec = await adapter.reconcile(
      { uid: "owner_auth_fs" },
      { ledgerId: "ledger_auth_fs", commandId: "commanda02" }
    );
    assert.equal(replay.ok, false);
    assert.equal(rec.ok, false);
    if (!replay.ok) assert.equal(replay.code, "forbidden");
    if (!rec.ok) assert.equal(rec.code, "forbidden");
    assert.equal((await db.doc(commandPath("owner_auth_fs", "ledger_auth_fs", "commanda02")).get()).exists, true);
  }

  {
    await seedOwner(db, "owner_roll_fs", "ledger_roll_fs");
    const adapter = new GoodsEvidenceRegisterAdapter(fs, fixedClock(NOW), {
      afterReads: () => {
        throw new Error("abort_before_commit");
      },
    });
    await seedOwner(db, "owner_roll_fs", "ledger_roll_fs");
    const registerAdapter = new GoodsEvidenceRegisterAdapter(fs, fixedClock(NOW));
    await registerAdapter.register(
      { uid: "owner_roll_fs" },
      registerEnvelope("commandr00", "receipt_r01", "owner_roll_fs", "ledger_roll_fs")
    );
    await assert.rejects(
      () =>
        adapter.recordQc(
          { uid: "owner_roll_fs" },
          mutationEnvelope(
            "commandr01",
            "recordQc",
            {
              receiptId: "receipt_r01",
              expectedVersion: 1,
              reason: "abort",
              qcStatus: "rejected",
              clientObservedAtUtc: "2026-09-28T16:00:00.000Z",
            },
            "owner_roll_fs",
            "ledger_roll_fs"
          )
        ),
      /abort_before_commit/
    );
    assert.equal(
      (await db.doc(commandPath("owner_roll_fs", "ledger_roll_fs", "commandr01")).get()).exists,
      false
    );
    const receipt = await db.doc(receiptPath("owner_roll_fs", "ledger_roll_fs", "receipt_r01")).get();
    assert.equal(receipt.data()?.view.eventVersion, 1);
    assert.equal(receipt.data()?.view.qcStatus ?? null, null);
  }

  console.log("tools/goods-evidence-emulator/mutations.emulator.test.ts: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
