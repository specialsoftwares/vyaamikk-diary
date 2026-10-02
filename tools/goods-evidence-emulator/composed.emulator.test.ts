/**
 * EMULATOR composition — authenticated callables + adapter on Firestore emulator.
 * Not live deploy. Not exported from functions/src/index.ts.
 */
import assert from "node:assert/strict";

import { createComposedGrinCallables } from "../../functions/src/goodsEvidence/composed";
import { freezeCommand } from "../../src/goodsEvidence/command";
import { sampleRegisterBody } from "../../src/goodsEvidence/testFixtures";
import { GoodsEvidenceRegisterAdapter } from "./adapter";
import { adminDb, fixedClock, seedOwner, wrapAdminFirestore } from "./harness";
import { receiptPath } from "./paths";

const NOW = Date.UTC(2026, 8, 28, 12, 0, 0, 0);
const OWNER = "owner_composed_emu";
const ATTACKER = "attacker_composed_emu";
const LEDGER = "ledger_composed_emu";
const FORGED_DIGEST = "ff".repeat(32);
const ENABLED = { GRIN_GOODS_EVIDENCE_FUNCTIONS: "true" } as NodeJS.ProcessEnv;

function registerPayload(commandId: string, receiptId: string, ownerUid = OWNER) {
  const frozen = freezeCommand({
    commandId,
    type: "registerGoodsReceipt",
    ownerUid,
    ledgerId: LEDGER,
    body: sampleRegisterBody({ receiptId }),
  });
  return {
    envelope: {
      commandId: frozen.commandId,
      type: frozen.type,
      ledgerId: frozen.ledgerId,
      body: frozen.body,
      ownerUid: frozen.ownerUid,
    },
    digest: frozen.digest,
    uid: ownerUid,
  };
}

function amendPayload(commandId: string, receiptId: string) {
  const frozen = freezeCommand({
    commandId,
    type: "amendFields",
    ownerUid: OWNER,
    ledgerId: LEDGER,
    body: {
      receiptId,
      expectedVersion: 1,
      reason: "emulator amend",
      changes: { remarks: { kind: "present", value: "emulator composed" } },
      clientObservedAtUtc: "2026-09-28T13:00:00.000Z",
    },
  });
  return {
    envelope: {
      commandId: frozen.commandId,
      type: frozen.type,
      ledgerId: frozen.ledgerId,
      body: frozen.body,
    },
    digest: FORGED_DIGEST,
    uid: ATTACKER,
  };
}

async function main(): Promise<void> {
  const db = adminDb();
  const fs = wrapAdminFirestore(db);
  await seedOwner(db, OWNER, LEDGER);
  const adapter = new GoodsEvidenceRegisterAdapter(fs, fixedClock(NOW));
  const callables = createComposedGrinCallables({ adapter, env: ENABLED });

  assert.match(callables.compositionLabel, /EMULATOR/);
  assert.match(callables.compositionLabel, /not live deploy/);

  const unauth = await callables.register({
    auth: null,
    data: registerPayload("command_e00", "receipt_e00"),
  });
  assert.equal(unauth.ok, false);
  if (unauth.ok) throw new Error("expected unauthenticated");
  assert.equal(unauth.code, "unauthenticated");

  const payload = registerPayload("command_e01", "receipt_e01", ATTACKER);
  payload.digest = FORGED_DIGEST;
  const registered = await callables.register({
    auth: { uid: OWNER },
    data: payload,
  });
  assert.equal(registered.ok, true, "EMULATOR auth uid must win over client uid");
  if (!registered.ok) throw new Error("expected register");
  assert.equal(registered.replayed, false);
  assert.equal(registered.issuedNumber, "GRIN/MAIN/FY2026-27/000001");
  assert.equal(registered.serial, 1);

  const ownerSnap = await db.doc(receiptPath(OWNER, LEDGER, "receipt_e01")).get();
  assert.equal(ownerSnap.exists, true);
  const attackerSnap = await db.doc(receiptPath(ATTACKER, LEDGER, "receipt_e01")).get();
  assert.equal(attackerSnap.exists, false);

  const replayed = await callables.register({
    auth: { uid: OWNER },
    data: registerPayload("command_e01", "receipt_e01"),
  });
  assert.equal(replayed.ok, true);
  if (!replayed.ok) throw new Error("expected replay");
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.issuedNumber, registered.issuedNumber);

  const afterRegisterRead = await callables.readReceipt({
    auth: { uid: OWNER },
    data: { ledgerId: LEDGER, receiptId: "receipt_e01", uid: ATTACKER },
  });
  assert.equal(afterRegisterRead.ok, true, "EMULATOR readReceipt after register");
  if (!afterRegisterRead.ok) throw new Error("expected emulator read after register");
  assert.equal(afterRegisterRead.confirmed.eventVersion, 1);
  assert.equal(afterRegisterRead.confirmed.headHash, registered.headHash);
  assert.equal(afterRegisterRead.confirmed.events.length, 1);
  assert.equal(afterRegisterRead.confirmed.events[0]?.type, "receipt_registered");
  assert.deepEqual(afterRegisterRead.confirmed.original.remarks, { kind: "not_supplied" });
  assert.equal(afterRegisterRead.confirmed.effective.remarks.kind, "not_supplied");

  const mutated = await callables.mutate({
    auth: { uid: OWNER },
    data: amendPayload("command_e02", "receipt_e01"),
  });
  assert.equal(mutated.ok, true);
  if (!mutated.ok) throw new Error("expected mutate");
  assert.equal(mutated.replayed, false);

  const after = (await db.doc(receiptPath(OWNER, LEDGER, "receipt_e01")).get()).data() as {
    original: { remarks: { kind: string } };
    effective: { remarks: { value: string } };
  };
  assert.deepEqual(after.original.remarks, { kind: "not_supplied" });
  assert.equal(after.effective.remarks.value, "emulator composed");

  const mutateReconcile = await callables.reconcile({
    auth: { uid: OWNER },
    data: { ledgerId: LEDGER, commandId: "command_e02", uid: ATTACKER },
  });
  assert.equal(mutateReconcile.ok, true);
  if (!mutateReconcile.ok) throw new Error("expected mutation reconcile");
  assert.equal(mutateReconcile.commandType, "amendFields");

  const afterAmendRead = await callables.readReceipt({
    auth: { uid: OWNER },
    data: { ledgerId: LEDGER, receiptId: "receipt_e01", uid: ATTACKER },
  });
  assert.equal(afterAmendRead.ok, true, "EMULATOR readReceipt after amend must return confirmed");
  if (!afterAmendRead.ok) throw new Error("expected emulator read");
  assert.equal(afterAmendRead.confirmed.eventVersion, mutated.eventVersion);
  assert.equal(afterAmendRead.confirmed.headHash, mutated.headHash);
  assert.equal(afterAmendRead.confirmed.events.length, 2);
  assert.equal(afterAmendRead.confirmed.events[0]?.type, "receipt_registered");
  assert.equal(afterAmendRead.confirmed.events[1]?.type, "field_amended");
  assert.deepEqual(afterAmendRead.confirmed.original.remarks, { kind: "not_supplied" });
  assert.equal(afterAmendRead.confirmed.effective.remarks.kind, "present");
  if (afterAmendRead.confirmed.effective.remarks.kind === "present") {
    assert.equal(afterAmendRead.confirmed.effective.remarks.value, "emulator composed");
  }
  assert.equal(
    afterAmendRead.confirmed.original.originalSnapshotHash,
    afterRegisterRead.confirmed.original.originalSnapshotHash,
    "original snapshot/hash must not change on amend"
  );

  if (!registered.ok) throw new Error("expected register");
  assert.equal("confirmed" in registered, true);
  if ("confirmed" in registered) {
    assert.equal(registered.confirmed.eventVersion, 1);
    assert.equal(registered.confirmed.events.length, 1);
    assert.deepEqual(registered.confirmed.original.remarks, { kind: "not_supplied" });
  }
  if (!mutated.ok) throw new Error("expected mutate");
  assert.equal("confirmed" in mutated, true);
  if ("confirmed" in mutated) {
    assert.equal(mutated.confirmed.eventVersion, 2);
    assert.equal(mutated.confirmed.events.length, 2);
    assert.deepEqual(mutated.confirmed.original.remarks, { kind: "not_supplied" });
  }

  function qcPayload(commandId: string, receiptId: string, expectedVersion: number) {
    const frozen = freezeCommand({
      commandId,
      type: "recordQc",
      ownerUid: OWNER,
      ledgerId: LEDGER,
      body: {
        receiptId,
        expectedVersion,
        reason: "emulator qc hold",
        qcStatus: "hold",
        clientObservedAtUtc: "2026-09-28T13:10:00.000Z",
      },
    });
    return {
      envelope: {
        commandId: frozen.commandId,
        type: frozen.type,
        ledgerId: frozen.ledgerId,
        body: frozen.body,
      },
    };
  }

  function returnPayload(commandId: string, receiptId: string, expectedVersion: number) {
    const frozen = freezeCommand({
      commandId,
      type: "dispatchReturn",
      ownerUid: OWNER,
      ledgerId: LEDGER,
      body: {
        receiptId,
        expectedVersion,
        reason: "emulator return",
        lineId: "line_1",
        returnQty: { value: "4", unit: "bags", precision: 0 },
        clientObservedAtUtc: "2026-09-28T13:20:00.000Z",
      },
    });
    return {
      envelope: {
        commandId: frozen.commandId,
        type: frozen.type,
        ledgerId: frozen.ledgerId,
        body: frozen.body,
      },
    };
  }

  const qc = await callables.mutate({
    auth: { uid: OWNER },
    data: qcPayload("command_e03", "receipt_e01", 2),
  });
  assert.equal(qc.ok, true, "EMULATOR register→amend→QC");
  if (!qc.ok) throw new Error("expected qc");
  assert.equal(qc.eventVersion, 3);

  const returned = await callables.mutate({
    auth: { uid: OWNER },
    data: returnPayload("command_e04", "receipt_e01", 3),
  });
  assert.equal(returned.ok, true, "EMULATOR QC→return");
  if (!returned.ok) throw new Error("expected return");
  assert.equal(returned.eventVersion, 4);

  const confirmedPath = await callables.readReceipt({
    auth: { uid: OWNER },
    data: { ledgerId: LEDGER, receiptId: "receipt_e01" },
  });
  assert.equal(confirmedPath.ok, true, "EMULATOR read-confirmed after return");
  if (!confirmedPath.ok) throw new Error("expected confirmed path");
  assert.equal(confirmedPath.confirmed.eventVersion, 4);
  assert.equal(confirmedPath.confirmed.headHash, returned.headHash);
  assert.equal(confirmedPath.confirmed.events.map((event) => event.type).join(","), [
    "receipt_registered",
    "field_amended",
    "qc_decision",
    "return_dispatched",
  ].join(","));
  assert.deepEqual(confirmedPath.confirmed.original.remarks, { kind: "not_supplied" });
  assert.equal(
    confirmedPath.confirmed.original.originalSnapshotHash,
    afterRegisterRead.confirmed.original.originalSnapshotHash
  );
  assert.equal("confirmed" in qc, true);
  assert.equal("confirmed" in returned, true);

  const foreignRead = await callables.readReceipt({
    auth: { uid: ATTACKER },
    data: { ledgerId: LEDGER, receiptId: "receipt_e01" },
  });
  assert.equal(foreignRead.ok, false);
  if (foreignRead.ok) throw new Error("expected foreign emulator read deny");
  assert.equal(foreignRead.code, "forbidden");

  const missingRead = await callables.readReceipt({
    auth: { uid: OWNER },
    data: { ledgerId: LEDGER, receiptId: "receipt_missing_emu" },
  });
  assert.equal(missingRead.ok, false);
  if (missingRead.ok) throw new Error("expected missing emulator read");
  assert.equal(missingRead.code, "not_found");

  console.log("tools/goods-evidence-emulator/composed.emulator.test.ts: ok (EMULATOR / not live deploy)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
