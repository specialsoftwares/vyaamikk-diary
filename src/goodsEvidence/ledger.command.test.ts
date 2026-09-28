import assert from "node:assert/strict";

import { freezeCommand } from "./command";
import { __setGoodsEvidenceEnabledForTests } from "./featureFlag";
import { detectBrokenChain } from "./hashChain";
import { InMemoryGoodsLedger } from "./ledger";
import { createOfflineCapture } from "./offline";
import { sampleRegisterBody } from "./testFixtures";
import { financialYearTokenForIstInstant } from "./time";

__setGoodsEvidenceEnabledForTests(true);

assert.match(InMemoryGoodsLedger.simulationNotice, /^SIMULATED:/);

let seq = 0;
const clock = {
  nowMs: () => Date.UTC(2026, 8, 28, 12, 0, 0, 0),
  uuid: () => `id_${++seq}`,
};

function ledger(): InMemoryGoodsLedger {
  seq = 0;
  return new InMemoryGoodsLedger("owner_1", "ledger_1", { ...clock });
}

{
  const store = ledger();
  const cmd = freezeCommand({
    commandId: "cmd_1",
    type: "registerGoodsReceipt",
    ownerUid: "owner_1",
    ledgerId: "ledger_1",
    body: sampleRegisterBody(),
  });
  const first = store.register(cmd);
  assert.equal(first.ok, true);
  if (!first.ok) throw new Error("expected success");
  assert.equal(first.issuedNumber, "GRIN/MAIN/FY2026-27/000001");
  assert.equal(first.replayed, false);

  const replay = store.register(cmd);
  assert.equal(replay.ok, true);
  if (!replay.ok) throw new Error("expected replay");
  assert.equal(replay.replayed, true);
  assert.equal(replay.issuedNumber, first.issuedNumber);
  assert.equal(replay.headHash, first.headHash);

  const conflictBody = sampleRegisterBody({ remarks: { kind: "present", value: "changed" } });
  const conflict = store.register(
    freezeCommand({
      commandId: "cmd_1",
      type: "registerGoodsReceipt",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: conflictBody,
    })
  );
  assert.equal(conflict.ok, false);
  if (conflict.ok) throw new Error("expected conflict");
  assert.equal(conflict.code, "digest_conflict");
}

{
  const store = ledger();
  const a = store.register(
    freezeCommand({
      commandId: "a",
      type: "registerGoodsReceipt",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: sampleRegisterBody({ receiptId: "r_a" }),
    })
  );
  const b = store.register(
    freezeCommand({
      commandId: "b",
      type: "registerGoodsReceipt",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: sampleRegisterBody({ receiptId: "r_b" }),
    })
  );
  assert.equal(a.ok && a.issuedNumber, "GRIN/MAIN/FY2026-27/000001");
  assert.equal(b.ok && b.issuedNumber, "GRIN/MAIN/FY2026-27/000002");
}

{
  let t = Date.UTC(2026, 2, 31, 18, 29, 59, 0);
  const boundary = new InMemoryGoodsLedger("owner_1", "ledger_1", {
    nowMs: () => t,
    uuid: () => `id_${++seq}`,
  });
  seq = 0;
  const before = boundary.register(
    freezeCommand({
      commandId: "before",
      type: "registerGoodsReceipt",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: sampleRegisterBody({ receiptId: "before" }),
    })
  );
  assert.equal(before.ok && before.issuedNumber.endsWith("/000001"), true);
  assert.equal(financialYearTokenForIstInstant(t), "FY2025-26");
  if (before.ok) assert.match(before.issuedNumber, /FY2025-26/);

  t = Date.UTC(2026, 2, 31, 18, 30, 0, 0);
  const after = boundary.register(
    freezeCommand({
      commandId: "after",
      type: "registerGoodsReceipt",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: sampleRegisterBody({ receiptId: "after" }),
    })
  );
  assert.equal(financialYearTokenForIstInstant(t), "FY2026-27");
  if (after.ok) {
    assert.match(after.issuedNumber, /FY2026-27/);
    assert.match(after.issuedNumber, /000001/, "new FY starts a new series; prior serial is not reused");
  }
}

{
  const store = ledger();
  const registered = store.register(
    freezeCommand({
      commandId: "reg",
      type: "registerGoodsReceipt",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: sampleRegisterBody({ receiptId: "amend_me" }),
    })
  );
  assert.equal(registered.ok, true);
  if (!registered.ok) throw new Error("expected register");
  const originalSupplier = store.getOriginal("amend_me")!.supplier;

  const firstAmend = store.amend(
    freezeCommand({
      commandId: "amd1",
      type: "amendFields",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: {
        receiptId: "amend_me",
        expectedVersion: 1,
        reason: "correct spelling",
        claimedOldValues: { issuedNumber: "WRONG" },
        changes: { note: "spelling" },
        clientObservedAtUtc: "2026-09-28T13:00:00.000Z",
      },
    })
  );
  assert.equal(firstAmend.ok, true);
  assert.deepEqual(store.getOriginal("amend_me")!.supplier, originalSupplier);
  const amendEvent = store.getEvents("amend_me")[1]!;
  const storedOld = (amendEvent.typedChanges as { oldValues: Record<string, unknown> }).oldValues;
  assert.equal(storedOld.note, null, "server uses projection, not client-claimed old values");
  assert.equal("issuedNumber" in storedOld, false);

  const stale = store.amend(
    freezeCommand({
      commandId: "amd2",
      type: "amendFields",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: {
        receiptId: "amend_me",
        expectedVersion: 1,
        reason: "stale",
        changes: { note: "lost" },
        clientObservedAtUtc: "2026-09-28T13:01:00.000Z",
      },
    })
  );
  assert.equal(stale.ok, false);
  if (stale.ok) throw new Error("expected conflict");
  assert.equal(stale.code, "version_conflict");
  assert.equal(detectBrokenChain(store.getEvents("amend_me")), null);
}

{
  const store = ledger();
  store.register(
    freezeCommand({
      commandId: "void_reg",
      type: "registerGoodsReceipt",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: sampleRegisterBody({ receiptId: "void_me" }),
    })
  );
  const voided = store.voidWithReason(
    freezeCommand({
      commandId: "void",
      type: "voidWithReason",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: {
        receiptId: "void_me",
        expectedVersion: 1,
        reason: "duplicate capture",
        linkedReceiptId: "other",
        clientObservedAtUtc: "2026-09-28T14:00:00.000Z",
      },
    })
  );
  assert.equal(voided.ok, true);
  assert.equal(store.getOriginal("void_me")!.issuedNumber, "GRIN/MAIN/FY2026-27/000001");
  const next = store.register(
    freezeCommand({
      commandId: "after_void",
      type: "registerGoodsReceipt",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: sampleRegisterBody({ receiptId: "new_one" }),
    })
  );
  assert.equal(next.ok && next.issuedNumber, "GRIN/MAIN/FY2026-27/000002");
}

{
  const store = ledger();
  store.register(
    freezeCommand({
      commandId: "ret",
      type: "registerGoodsReceipt",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: sampleRegisterBody({ receiptId: "return_me" }),
    })
  );
  const returned = store.dispatchReturn(
    freezeCommand({
      commandId: "dispatch",
      type: "dispatchReturn",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: {
        receiptId: "return_me",
        expectedVersion: 1,
        reason: "QC fail after receipt",
        lineId: "line_1",
        returnQty: { value: "5", unit: "bags", precision: 0 },
        clientObservedAtUtc: "2026-09-28T15:00:00.000Z",
      },
    })
  );
  assert.equal(returned.ok, true);
  const line = store.getLineLedger("return_me", "line_1")!;
  assert.equal(line.physicalReceived.value, "40");
  assert.equal(line.dispatchedReturn.value, "5");
}

{
  const store = ledger();
  const gate = store.register(
    freezeCommand({
      commandId: "gate",
      type: "registerGoodsReceipt",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: sampleRegisterBody({
        receiptId: "gate_refused",
        custody: "refused_at_gate",
      }),
    })
  );
  assert.equal(gate.ok, true);
  const original = store.getOriginal("gate_refused")!;
  assert.equal(original.custody, "refused_at_gate");
  assert.equal(store.getLineLedger("gate_refused", "line_1")!.acceptedForStock.value, "0");
  assert.equal(store.getLineLedger("gate_refused", "line_1")!.physicalReceived.value, "40");
}

{
  const pending = createOfflineCapture({
    receiptId: "offline_1",
    commandId: "offline_cmd",
    capturedAtClientUtc: "2026-09-28T01:00:00.000Z",
    reportedArrivalAt: "2026-09-28T00:45:00.000Z",
    reportedArrivalTimeZone: "Asia/Kolkata",
  });
  assert.equal(pending.issuedNumber, null);
  assert.equal(pending.serverRegisteredAtUtc, null);
  assert.equal(pending.provisionalExport, true);
  assert.match(pending.banner, /server registration pending/);

  const store = ledger();
  const issued = store.register(
    freezeCommand({
      commandId: pending.commandId,
      type: "registerGoodsReceipt",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: sampleRegisterBody({
        receiptId: pending.receiptId,
        captureProvenance: pending.captureProvenance,
        capturedAtClientUtc: pending.capturedAtClientUtc,
        reportedArrivalAt: pending.reportedArrivalAt,
      }),
    })
  );
  assert.equal(issued.ok, true);
  if (!issued.ok) throw new Error("expected issue");
  const original = store.getOriginal(pending.receiptId)!;
  assert.equal(original.reportedArrivalAt, pending.reportedArrivalAt);
  assert.notEqual(original.serverRegisteredAtUtc, pending.reportedArrivalAt);
  assert.equal(original.captureProvenance, "offline");
}

{
  __setGoodsEvidenceEnabledForTests(false);
  const store = ledger();
  const denied = store.register(
    freezeCommand({
      commandId: "denied",
      type: "registerGoodsReceipt",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: sampleRegisterBody({ receiptId: "denied" }),
    })
  );
  assert.equal(denied.ok, false);
  if (denied.ok) throw new Error("expected disabled");
  assert.equal(denied.code, "disabled");
}

__setGoodsEvidenceEnabledForTests(null);

console.log("goodsEvidence/ledger.command.test.ts: ok");
