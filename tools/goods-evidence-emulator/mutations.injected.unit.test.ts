/**
 * INJECTED_PORT — durable G4 mutations on the G1 adapter + in-process store.
 * Not FIRESTORE_EMULATOR. Not PURE_DOMAIN (InMemoryGoodsLedger).
 */
import assert from "node:assert/strict";

import { freezeCommand } from "../../src/goodsEvidence/command";
import { sampleRegisterBody } from "../../src/goodsEvidence/testFixtures";
import { GoodsEvidenceRegisterAdapter } from "./adapter";
import { fixedClock } from "./harness";
import { createInjectedStore, seedInjectedOwner } from "./injectedStore";
import { commandPath, eventPath, receiptPath, serialPath } from "./paths";

const NOW = Date.UTC(2026, 8, 28, 12, 0, 0, 0);
const OWNER = "owner_mut";
const LEDGER = "ledger_mut";

function registerEnvelope(commandId: string, receiptId: string) {
  const frozen = freezeCommand({
    commandId,
    type: "registerGoodsReceipt",
    ownerUid: OWNER,
    ledgerId: LEDGER,
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

function mutationEnvelope<T extends { receiptId: string }>(
  commandId: string,
  type:
    | "amendFields"
    | "recordQc"
    | "dispatchReturn"
    | "correctReturnDispatch"
    | "voidWithReason"
    | "recordEwbObservation"
    | "linkVerifiedEvidence",
  body: T,
  ownerUid = OWNER,
  ledgerId = LEDGER
) {
  const frozen = freezeCommand({
    commandId,
    type,
    ownerUid,
    ledgerId,
    body,
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

async function captureLogs(fn: () => Promise<unknown>): Promise<string[]> {
  const lines: string[] = [];
  const original = console.log;
  const previous = process.env.GRIN_G1_LOG;
  process.env.GRIN_G1_LOG = "1";
  console.log = (line: unknown) => {
    lines.push(String(line));
  };
  try {
    await fn();
    return lines;
  } finally {
    console.log = original;
    if (previous == null) delete process.env.GRIN_G1_LOG;
    else process.env.GRIN_G1_LOG = previous;
  }
}

async function seedReceipt(
  adapter: GoodsEvidenceRegisterAdapter,
  commandId: string,
  receiptId: string
) {
  const registered = await adapter.register({ uid: OWNER }, registerEnvelope(commandId, receiptId));
  assert.equal(registered.ok, true);
  return registered;
}

function sampleVerified(receiptId: string) {
  return {
    evidenceId: "evidence_1",
    ownerUid: OWNER,
    ledgerId: LEDGER,
    receiptId,
    category: "invoice",
    mime: "image/jpeg",
    byteSize: 24,
    rawSha256: "ab".repeat(32),
    storagePath: "users/owner_mut/objects/randomkey",
    generation: "1",
    verifiedAtUtc: "2026-09-28T16:59:00.000Z",
  };
}

async function main(): Promise<void> {
  // amendFields: old+new values; original never rewritten
  {
    const store = createInjectedStore();
    seedInjectedOwner(store, OWNER, LEDGER);
    const adapter = new GoodsEvidenceRegisterAdapter(store, fixedClock(NOW));
    await seedReceipt(adapter, "command_am0", "receipt_am");
    const before = JSON.parse(store.snapshot.get(receiptPath(OWNER, LEDGER, "receipt_am"))!);
    const originalRemarks = before.original.remarks;
    const env = mutationEnvelope("command_am1", "amendFields", {
      receiptId: "receipt_am",
      expectedVersion: 1,
      reason: "correct remarks",
      changes: { remarks: { kind: "present", value: "updated" } },
      clientObservedAtUtc: "2026-09-28T13:00:00.000Z",
    });
    const amended = await adapter.amendFields({ uid: OWNER }, env);
    assert.equal(amended.ok, true);
    if (!amended.ok) throw new Error("expected amend");
    const after = JSON.parse(store.snapshot.get(receiptPath(OWNER, LEDGER, "receipt_am"))!);
    assert.deepEqual(after.original.remarks, originalRemarks);
    assert.equal(after.effective.remarks.value, "updated");
    const event = JSON.parse(
      store.snapshot.get(eventPath(OWNER, LEDGER, "receipt_am", amended.eventId))!
    );
    assert.equal(event.type, "field_amended");
    assert.deepEqual(event.typedChanges.oldValues.remarks, originalRemarks);
    assert.equal(event.typedChanges.newValues.remarks.value, "updated");
    assert.equal(event.firestoreCommitTime, null);
    assert.equal(amended.serverAcceptedAtUtc, "2026-09-28T12:00:00.000Z");
  }

  // version_conflict
  {
    const store = createInjectedStore();
    seedInjectedOwner(store, OWNER, LEDGER);
    const adapter = new GoodsEvidenceRegisterAdapter(store, fixedClock(NOW));
    await seedReceipt(adapter, "command_vc0", "receipt_vc");
    await adapter.amendFields(
      { uid: OWNER },
      mutationEnvelope("command_vc1", "amendFields", {
        receiptId: "receipt_vc",
        expectedVersion: 1,
        reason: "first",
        changes: { remarks: { kind: "present", value: "one" } },
        clientObservedAtUtc: "2026-09-28T13:00:00.000Z",
      })
    );
    const stale = await adapter.amendFields(
      { uid: OWNER },
      mutationEnvelope("command_vc2", "amendFields", {
        receiptId: "receipt_vc",
        expectedVersion: 1,
        reason: "stale",
        changes: { remarks: { kind: "present", value: "two" } },
        clientObservedAtUtc: "2026-09-28T13:01:00.000Z",
      })
    );
    assert.equal(stale.ok, false);
    if (!stale.ok) assert.equal(stale.code, "version_conflict");
  }

  // recordQc: qc_decision then qc_reclassified
  {
    const store = createInjectedStore();
    seedInjectedOwner(store, OWNER, LEDGER);
    const adapter = new GoodsEvidenceRegisterAdapter(store, fixedClock(NOW));
    await seedReceipt(adapter, "command_qc0", "receipt_qc");
    const first = await adapter.recordQc(
      { uid: OWNER },
      mutationEnvelope("command_qc1", "recordQc", {
        receiptId: "receipt_qc",
        expectedVersion: 1,
        reason: "hold at bay",
        qcStatus: "hold",
        clientObservedAtUtc: "2026-09-28T13:10:00.000Z",
      })
    );
    assert.equal(first.ok, true);
    if (!first.ok) throw new Error("expected qc");
    const firstEvent = JSON.parse(
      store.snapshot.get(eventPath(OWNER, LEDGER, "receipt_qc", first.eventId))!
    );
    assert.equal(firstEvent.type, "qc_decision");
    const second = await adapter.recordQc(
      { uid: OWNER },
      mutationEnvelope("command_qc2", "recordQc", {
        receiptId: "receipt_qc",
        expectedVersion: 2,
        reason: "accepted after hold",
        qcStatus: "accepted",
        clientObservedAtUtc: "2026-09-28T13:20:00.000Z",
      })
    );
    assert.equal(second.ok, true);
    if (!second.ok) throw new Error("expected reclassify");
    const secondEvent = JSON.parse(
      store.snapshot.get(eventPath(OWNER, LEDGER, "receipt_qc", second.eventId))!
    );
    assert.equal(secondEvent.type, "qc_reclassified");
    const view = JSON.parse(store.snapshot.get(receiptPath(OWNER, LEDGER, "receipt_qc"))!).view;
    assert.equal(view.qcStatus, "accepted");
  }

  // quantity conservation: dispatch then linked correction; over-correction invalid
  {
    const store = createInjectedStore();
    seedInjectedOwner(store, OWNER, LEDGER);
    const adapter = new GoodsEvidenceRegisterAdapter(store, fixedClock(NOW));
    await seedReceipt(adapter, "command_rt0", "receipt_rt");
    const dispatched = await adapter.dispatchReturn(
      { uid: OWNER },
      mutationEnvelope("command_rt1", "dispatchReturn", {
        receiptId: "receipt_rt",
        expectedVersion: 1,
        reason: "QC fail",
        lineId: "line_1",
        returnQty: { value: "5", unit: "bags", precision: 0 },
        clientObservedAtUtc: "2026-09-28T14:00:00.000Z",
      })
    );
    assert.equal(dispatched.ok, true);
    if (!dispatched.ok) throw new Error("expected dispatch");
    const afterDispatch = JSON.parse(store.snapshot.get(receiptPath(OWNER, LEDGER, "receipt_rt"))!);
    assert.equal(afterDispatch.lineLedgers.line_1.physicalReceived.value, "40");
    assert.equal(afterDispatch.lineLedgers.line_1.dispatchedReturn.value, "5");
    const corrected = await adapter.correctReturnDispatch(
      { uid: OWNER },
      mutationEnvelope("command_rt2", "correctReturnDispatch", {
        receiptId: "receipt_rt",
        expectedVersion: 2,
        reason: "driver counted twice",
        lineId: "line_1",
        linkedEventId: dispatched.eventId,
        correctionQty: { value: "2", unit: "bags", precision: 0 },
        clientObservedAtUtc: "2026-09-28T14:10:00.000Z",
      })
    );
    assert.equal(corrected.ok, true);
    const afterCorr = JSON.parse(store.snapshot.get(receiptPath(OWNER, LEDGER, "receipt_rt"))!);
    assert.equal(afterCorr.lineLedgers.line_1.physicalReceived.value, "40");
    assert.equal(afterCorr.lineLedgers.line_1.dispatchedReturn.value, "3");
    const overflow = await adapter.correctReturnDispatch(
      { uid: OWNER },
      mutationEnvelope("command_rt3", "correctReturnDispatch", {
        receiptId: "receipt_rt",
        expectedVersion: 3,
        reason: "too much",
        lineId: "line_1",
        linkedEventId: dispatched.eventId,
        correctionQty: { value: "9", unit: "bags", precision: 0 },
        clientObservedAtUtc: "2026-09-28T14:11:00.000Z",
      })
    );
    assert.equal(overflow.ok, false);
    if (!overflow.ok) assert.equal(overflow.code, "invalid");
  }

  // voidWithReason: issued number preserved; serial not reused
  {
    const store = createInjectedStore();
    seedInjectedOwner(store, OWNER, LEDGER);
    const adapter = new GoodsEvidenceRegisterAdapter(store, fixedClock(NOW));
    const first = await adapter.register({ uid: OWNER }, registerEnvelope("command_vd0", "receipt_vd"));
    assert.equal(first.ok, true);
    const voided = await adapter.voidWithReason(
      { uid: OWNER },
      mutationEnvelope("command_vd1", "voidWithReason", {
        receiptId: "receipt_vd",
        expectedVersion: 1,
        reason: "duplicate capture",
        linkedReceiptId: null,
        clientObservedAtUtc: "2026-09-28T15:00:00.000Z",
      })
    );
    assert.equal(voided.ok, true);
    const stored = JSON.parse(store.snapshot.get(receiptPath(OWNER, LEDGER, "receipt_vd"))!);
    assert.equal(stored.original.issuedNumber, "GRIN/MAIN/FY2026-27/000001");
    assert.equal(stored.view.voided, true);
    const blocked = await adapter.recordQc(
      { uid: OWNER },
      mutationEnvelope("command_vd2", "recordQc", {
        receiptId: "receipt_vd",
        expectedVersion: 2,
        reason: "after void",
        qcStatus: "accepted",
        clientObservedAtUtc: "2026-09-28T15:01:00.000Z",
      })
    );
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.code, "voided");
    const next = await adapter.register({ uid: OWNER }, registerEnvelope("command_vd3", "receipt_vd2"));
    assert.equal(next.ok && next.issuedNumber, "GRIN/MAIN/FY2026-27/000002");
    const serial = JSON.parse(store.snapshot.get(serialPath(OWNER, LEDGER, "FY2026-27"))!);
    assert.equal(serial.lastIssuedSerial, 2);
  }

  // recordEwbObservation: unknown stays unknown; cancellation evidence retained
  {
    const store = createInjectedStore();
    seedInjectedOwner(store, OWNER, LEDGER);
    const adapter = new GoodsEvidenceRegisterAdapter(store, fixedClock(NOW));
    await seedReceipt(adapter, "command_ew0", "receipt_ew");
    const unknown = await adapter.recordEwbObservation(
      { uid: OWNER },
      mutationEnvelope("command_ew1", "recordEwbObservation", {
        receiptId: "receipt_ew",
        expectedVersion: 1,
        reason: "portal unknown",
        clientObservedAtUtc: "2026-09-28T16:00:00.000Z",
        channel: "portal",
        observation: {
          observedAtUtc: "2026-09-28T16:00:00.000Z",
          source: "user_reported",
          verificationLevel: "user_reported",
          status: "unknown",
        },
      })
    );
    assert.equal(unknown.ok, true);
    const cancelled = await adapter.recordEwbObservation(
      { uid: OWNER },
      mutationEnvelope("command_ew2", "recordEwbObservation", {
        receiptId: "receipt_ew",
        expectedVersion: 2,
        reason: "cancel with evidence",
        clientObservedAtUtc: "2026-09-28T16:10:00.000Z",
        channel: "portal",
        observation: {
          observedAtUtc: "2026-09-28T16:10:00.000Z",
          source: "user_reported",
          verificationLevel: "user_reported",
          status: "cancelled",
          evidence: {
            reason: "vehicle breakdown",
            goodsMoved: "unknown",
            goodsMovedUnknownReason: "driver unreachable",
            linkedDocument: { kind: "invoice", reference: "INV-1" },
            party: "supplier",
            amount: { kind: "unknown", reason: "value not on copy" },
            replacementEbn: { kind: "none", reason: "not replaced" },
          },
        },
      })
    );
    assert.equal(cancelled.ok, true);
    const receipt = JSON.parse(store.snapshot.get(receiptPath(OWNER, LEDGER, "receipt_ew"))!);
    assert.equal(receipt.ewbHistories.portal[0].status, "unknown");
    assert.equal(receipt.ewbHistories.portal[1].status, "cancelled");
    assert.equal(receipt.ewbHistories.portal[1].evidence.goodsMoved, "unknown");
  }

  // linkVerifiedEvidence: well-formed Team 2 result; no byte hashing
  {
    const store = createInjectedStore();
    seedInjectedOwner(store, OWNER, LEDGER);
    const adapter = new GoodsEvidenceRegisterAdapter(store, fixedClock(NOW));
    await seedReceipt(adapter, "command_ln0", "receipt_ln");
    const malformed = await adapter.linkVerifiedEvidence(
      { uid: OWNER },
      mutationEnvelope("command_ln1", "linkVerifiedEvidence", {
        receiptId: "receipt_ln",
        expectedVersion: 1,
        reason: "claim without verification",
        clientObservedAtUtc: "2026-09-28T17:00:00.000Z",
        verified: {
          ...sampleVerified("receipt_ln"),
          rawSha256: "not-a-hash",
        },
      })
    );
    assert.equal(malformed.ok, false);
    if (!malformed.ok) assert.equal(malformed.code, "invalid");
    const linked = await adapter.linkVerifiedEvidence(
      { uid: OWNER },
      mutationEnvelope("command_ln2", "linkVerifiedEvidence", {
        receiptId: "receipt_ln",
        expectedVersion: 1,
        reason: "link verified original",
        clientObservedAtUtc: "2026-09-28T17:01:00.000Z",
        verified: sampleVerified("receipt_ln"),
      })
    );
    assert.equal(linked.ok, true);
    if (!linked.ok) throw new Error("expected link");
    const event = JSON.parse(
      store.snapshot.get(eventPath(OWNER, LEDGER, "receipt_ln", linked.eventId))!
    );
    assert.equal(event.type, "evidence_verified");
    assert.equal(event.typedChanges.bytesNotRehashed, true);
    const receipt = JSON.parse(store.snapshot.get(receiptPath(OWNER, LEDGER, "receipt_ln"))!);
    assert.equal(receipt.linkedEvidence[0].evidenceId, "evidence_1");
    assert.deepEqual(receipt.original, receipt.original);
  }

  // authorization + pending_deletion has no replay exception
  {
    const store = createInjectedStore();
    seedInjectedOwner(store, OWNER, LEDGER);
    const adapter = new GoodsEvidenceRegisterAdapter(store, fixedClock(NOW));
    await seedReceipt(adapter, "command_au0", "receipt_au");
    const env = mutationEnvelope("command_au1", "recordQc", {
      receiptId: "receipt_au",
      expectedVersion: 1,
      reason: "qc",
      qcStatus: "accepted",
      clientObservedAtUtc: "2026-09-28T18:00:00.000Z",
    });
    const unauth = await adapter.recordQc({ uid: null }, env);
    assert.equal(unauth.ok, false);
    if (!unauth.ok) assert.equal(unauth.code, "unauthenticated");
    const crossEnv = mutationEnvelope(
      "command_au1x",
      "recordQc",
      {
        receiptId: "receipt_au",
        expectedVersion: 1,
        reason: "qc",
        qcStatus: "accepted",
        clientObservedAtUtc: "2026-09-28T18:00:00.000Z",
      },
      "intruder",
      LEDGER
    );
    const cross = await adapter.recordQc({ uid: "intruder" }, crossEnv);
    assert.equal(cross.ok, false);
    if (!cross.ok) assert.equal(cross.code, "forbidden");
    const committed = await adapter.recordQc({ uid: OWNER }, env);
    assert.equal(committed.ok, true);
    store.snapshot.set(`users/${OWNER}`, JSON.stringify({ uid: OWNER, status: "pending_deletion" }));
    const replay = await adapter.recordQc({ uid: OWNER }, env);
    assert.equal(replay.ok, false);
    if (!replay.ok) assert.equal(replay.code, "forbidden");
  }

  // replay + digest_conflict + committed log after success only
  {
    const store = createInjectedStore();
    seedInjectedOwner(store, OWNER, LEDGER);
    const adapter = new GoodsEvidenceRegisterAdapter(store, fixedClock(NOW));
    await seedReceipt(adapter, "command_rp0", "receipt_rp");
    const env = mutationEnvelope("command_rp1", "amendFields", {
      receiptId: "receipt_rp",
      expectedVersion: 1,
      reason: "once",
      changes: { remarks: { kind: "present", value: "once" } },
      clientObservedAtUtc: "2026-09-28T18:10:00.000Z",
    });
    const logs = await captureLogs(async () => {
      const first = await adapter.amendFields({ uid: OWNER }, env);
      assert.equal(first.ok && first.replayed === false, true);
      const replay = await adapter.amendFields({ uid: OWNER }, env);
      assert.equal(replay.ok && replay.replayed, true);
      if (first.ok && replay.ok) {
        assert.equal(replay.eventId, first.eventId);
        assert.equal(replay.headHash, first.headHash);
      }
    });
    assert.equal(logs.filter((line) => line.includes("grin_g1_mutation_committed")).length, 1);
    const conflict = await adapter.amendFields(
      { uid: OWNER },
      mutationEnvelope("command_rp1", "amendFields", {
        receiptId: "receipt_rp",
        expectedVersion: 1,
        reason: "different",
        changes: { remarks: { kind: "present", value: "other" } },
        clientObservedAtUtc: "2026-09-28T18:11:00.000Z",
      })
    );
    assert.equal(conflict.ok, false);
    if (!conflict.ok) assert.equal(conflict.code, "digest_conflict");
  }

  // rollback: commit fail → zero mutation writes
  {
    const store = createInjectedStore();
    seedInjectedOwner(store, OWNER, LEDGER);
    const adapter = new GoodsEvidenceRegisterAdapter(store, fixedClock(NOW));
    await seedReceipt(adapter, "command_rb0", "receipt_rb");
    const writes = store.appliedWrites;
    store.failNextCommit = true;
    store.failCommitError = new Error("injected_commit_rejected");
    await assert.rejects(
      () =>
        adapter.recordQc(
          { uid: OWNER },
          mutationEnvelope("command_rb1", "recordQc", {
            receiptId: "receipt_rb",
            expectedVersion: 1,
            reason: "will fail",
            qcStatus: "rejected",
            clientObservedAtUtc: "2026-09-28T18:20:00.000Z",
          })
        ),
      /injected_commit_rejected/
    );
    assert.equal(store.appliedWrites, writes);
    assert.equal(store.snapshot.has(commandPath(OWNER, LEDGER, "command_rb1")), false);
    const receipt = JSON.parse(store.snapshot.get(receiptPath(OWNER, LEDGER, "receipt_rb"))!);
    assert.equal(receipt.view.eventVersion, 1);
    assert.equal(receipt.view.qcStatus, null);
  }

  // authorized missing / unreadable receipt is not_found; foreign original stays forbidden
  {
    const store = createInjectedStore();
    seedInjectedOwner(store, OWNER, LEDGER);
    const adapter = new GoodsEvidenceRegisterAdapter(store, fixedClock(NOW));
    const missing = await adapter.recordQc(
      { uid: OWNER },
      mutationEnvelope("command_nf1", "recordQc", {
        receiptId: "receipt_missing",
        expectedVersion: 1,
        reason: "qc missing",
        qcStatus: "accepted",
        clientObservedAtUtc: "2026-09-28T19:00:00.000Z",
      })
    );
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.code, "not_found");
    store.snapshot.set(
      receiptPath(OWNER, LEDGER, "receipt_corrupt"),
      JSON.stringify({ view: { eventVersion: 1, voided: false }, lineLedgers: {} })
    );
    const corrupt = await adapter.recordQc(
      { uid: OWNER },
      mutationEnvelope("command_nf2", "recordQc", {
        receiptId: "receipt_corrupt",
        expectedVersion: 1,
        reason: "qc corrupt",
        qcStatus: "accepted",
        clientObservedAtUtc: "2026-09-28T19:01:00.000Z",
      })
    );
    assert.equal(corrupt.ok, false);
    if (!corrupt.ok) assert.equal(corrupt.code, "not_found");
    store.snapshot.set(
      receiptPath(OWNER, LEDGER, "receipt_foreign"),
      JSON.stringify({
        original: { ownerUid: "other", ledgerId: LEDGER, receiptId: "receipt_foreign" },
        view: { eventVersion: 1, voided: false, headHash: "aa" },
        lineLedgers: {},
      })
    );
    const foreign = await adapter.recordQc(
      { uid: OWNER },
      mutationEnvelope("command_nf3", "recordQc", {
        receiptId: "receipt_foreign",
        expectedVersion: 1,
        reason: "qc foreign",
        qcStatus: "accepted",
        clientObservedAtUtc: "2026-09-28T19:02:00.000Z",
      })
    );
    assert.equal(foreign.ok, false);
    if (!foreign.ok) {
      assert.equal(foreign.code, "forbidden");
      assert.equal(foreign.detail, "denied");
    }
  }

  // pending_deletion / inactive: generic forbidden even if envelope is malformed or digest mismatches
  {
    const store = createInjectedStore();
    seedInjectedOwner(store, OWNER, LEDGER);
    const adapter = new GoodsEvidenceRegisterAdapter(store, fixedClock(NOW));
    const valid = mutationEnvelope("command_pd1", "recordQc", {
      receiptId: "receipt_pd",
      expectedVersion: 1,
      reason: "qc",
      qcStatus: "accepted",
      clientObservedAtUtc: "2026-09-28T19:10:00.000Z",
    });
    store.snapshot.set(`users/${OWNER}`, JSON.stringify({ uid: OWNER, status: "pending_deletion" }));
    const malformed = await adapter.recordQc({ uid: OWNER }, { extra: true, ledgerId: LEDGER });
    assert.equal(malformed.ok, false);
    if (!malformed.ok) {
      assert.equal(malformed.code, "forbidden");
      assert.equal(malformed.detail, "denied");
    }
    const mismatch = await adapter.recordQc({ uid: OWNER }, { ...valid, digest: "ff".repeat(32) });
    assert.equal(mismatch.ok, false);
    if (!mismatch.ok) {
      assert.equal(mismatch.code, "forbidden");
      assert.equal(mismatch.detail, "denied");
    }
    store.snapshot.set(`users/${OWNER}`, JSON.stringify({ uid: OWNER, status: "inactive" }));
    const inactive = await adapter.recordQc({ uid: OWNER }, { extra: true });
    assert.equal(inactive.ok, false);
    if (!inactive.ok) {
      assert.equal(inactive.code, "forbidden");
      assert.equal(inactive.detail, "denied");
    }
  }

  // clock failure is not converted into invalid
  {
    const store = createInjectedStore();
    seedInjectedOwner(store, OWNER, LEDGER);
    const good = new GoodsEvidenceRegisterAdapter(store, fixedClock(NOW));
    await seedReceipt(good, "command_ck0", "receipt_ck");
    const adapter = new GoodsEvidenceRegisterAdapter(store, {
      nowMs: () => {
        throw new Error("clock_failed");
      },
      uuid: () => "id_x",
    });
    await assert.rejects(
      () =>
        adapter.voidWithReason(
          { uid: OWNER },
          mutationEnvelope("command_ck1", "voidWithReason", {
            receiptId: "receipt_ck",
            expectedVersion: 1,
            reason: "clock",
            linkedReceiptId: null,
            clientObservedAtUtc: "2026-09-28T18:30:00.000Z",
          })
        ),
      /clock_failed/
    );
  }

  console.log("tools/goods-evidence-emulator/mutations.injected.unit.test.ts: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
