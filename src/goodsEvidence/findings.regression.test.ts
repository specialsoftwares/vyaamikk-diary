/**
 * Regression tests for the review findings against committed domain code.
 * InMemoryGoodsLedger is SIMULATED.
 */
import assert from "node:assert/strict";

import { __setRuntimeSignalsForTests } from "@/config/env";

import { freezeCommand } from "./command";
import { assembleManifest } from "./evidencePack";
import {
  appendPortalObservation,
  recordPortalCancellation,
  emptyEwbHistories,
  latestCancellationEvidence,
  latestPortalStatus,
} from "./ewb";
import { isGoodsEvidenceEnabled } from "./featureFlag";
import { InMemoryGoodsLedger } from "./ledger";
import { sampleLine, sampleRegisterBody } from "./testFixtures";

let seq = 0;
function testLedger(): InMemoryGoodsLedger {
  seq = 0;
  return new InMemoryGoodsLedger(
    "owner_1",
    "ledger_1",
    {
      nowMs: () => Date.UTC(2026, 8, 28, 12, 0, 0, 0),
      uuid: () => `id_${++seq}`,
    },
    "simulated-domain-test"
  );
}

{
  const store = testLedger();
  const first = store.register(
    freezeCommand({
      commandId: "first",
      type: "registerGoodsReceipt",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: sampleRegisterBody({ receiptId: "same_receipt" }),
    })
  );
  assert.equal(first.ok, true);
  if (!first.ok) throw new Error("expected first");
  const replaced = store.register(
    freezeCommand({
      commandId: "second",
      type: "registerGoodsReceipt",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: sampleRegisterBody({ receiptId: "same_receipt", remarks: { kind: "present", value: "other" } }),
    })
  );
  assert.equal(replaced.ok, false);
  if (replaced.ok) throw new Error("must not replace");
  assert.equal(replaced.code, "receipt_exists");
  assert.equal(store.getOriginal("same_receipt")!.issuedNumber, "GRIN/MAIN/FY2026-27/000001");
  assert.equal(store.getEvents("same_receipt").length, 1);
}

{
  const store = testLedger();
  store.register(
    freezeCommand({
      commandId: "mut",
      type: "registerGoodsReceipt",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: sampleRegisterBody({ receiptId: "freeze_me" }),
    })
  );
  const original = store.getOriginal("freeze_me")!;
  assert.throws(() => {
    (original as { issuedNumber: string | null }).issuedNumber = "GRIN/MAIN/FY2026-27/000099";
  });
  assert.equal(store.getOriginal("freeze_me")!.issuedNumber, "GRIN/MAIN/FY2026-27/000001");
  const events = store.getEvents("freeze_me");
  assert.throws(() => {
    events.push(events[0]!);
  });
  assert.equal(store.getEvents("freeze_me").length, 1);
  const qty = store.getLineLedger("freeze_me", "line_1")!;
  assert.throws(() => {
    qty.physicalReceived.value = "0";
  });
  assert.equal(store.getLineLedger("freeze_me", "line_1")!.physicalReceived.value, "40");
}

{
  const store = testLedger();
  store.register(
    freezeCommand({
      commandId: "reg_reason",
      type: "registerGoodsReceipt",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: sampleRegisterBody({ receiptId: "reason_me" }),
    })
  );
  const empty = store.amend(
    freezeCommand({
      commandId: "empty_reason",
      type: "amendFields",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: {
        receiptId: "reason_me",
        expectedVersion: 1,
        reason: "   ",
        changes: { remarks: { kind: "present", value: "x" } },
        clientObservedAtUtc: "2026-09-28T13:00:00.000Z",
      },
    })
  );
  assert.equal(empty.ok, false);
  if (empty.ok) throw new Error("empty reason");
  assert.equal(empty.code, "invalid");

  const cmd = freezeCommand({
    commandId: "amd_replay",
    type: "amendFields" as const,
    ownerUid: "owner_1",
    ledgerId: "ledger_1",
    body: {
      receiptId: "reason_me",
      expectedVersion: 1,
      reason: "correct warehouse note",
      changes: { remarks: { kind: "present" as const, value: "checked" } },
      clientObservedAtUtc: "2026-09-28T13:00:00.000Z",
    },
  });
  const first = store.amend(cmd);
  assert.equal(first.ok, true);
  const replay = store.amend(cmd);
  assert.equal(replay.ok, true);
  if (!replay.ok) throw new Error("replay");
  assert.equal(replay.replayed, true);
  assert.equal(replay.eventVersion, first.eventVersion);
  assert.equal(store.getEvents("reason_me").length, 2);
}

{
  const store = testLedger();
  store.register(
    freezeCommand({
      commandId: "reg_eff",
      type: "registerGoodsReceipt",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: sampleRegisterBody({ receiptId: "effective_me" }),
    })
  );
  store.amend(
    freezeCommand({
      commandId: "amd_eff",
      type: "amendFields",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: {
        receiptId: "effective_me",
        expectedVersion: 1,
        reason: "supplier spelling",
        claimedOldValues: { supplier: "WRONG" },
        changes: {
          supplier: {
            name: { kind: "present", value: "Corrected Supplier" },
            registration: { kind: "registered", gstin: "29BBBBB0000B1Z5" },
            address: { kind: "not_supplied" },
            contact: { kind: "not_supplied" },
          },
        },
        clientObservedAtUtc: "2026-09-28T13:00:00.000Z",
      },
    })
  );
  const originalName = store.getOriginal("effective_me")!.supplier.name;
  const effectiveName = store.getEffective("effective_me")!.supplier.name;
  assert.deepEqual(originalName, { kind: "present", value: "Sample Supplier" });
  assert.deepEqual(effectiveName, { kind: "present", value: "Corrected Supplier" });
  const oldValues = store.getEvents("effective_me")[1]!.typedChanges.oldValues as {
    supplier: { name: { value: string } };
  };
  assert.equal(oldValues.supplier.name.value, "Sample Supplier");
}

{
  const store = testLedger();
  store.register(
    freezeCommand({
      commandId: "reg_ret",
      type: "registerGoodsReceipt",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: sampleRegisterBody({ receiptId: "return_qty" }),
    })
  );
  const dispatched = store.dispatchReturn(
    freezeCommand({
      commandId: "ret5",
      type: "dispatchReturn",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: {
        receiptId: "return_qty",
        expectedVersion: 1,
        reason: "QC fail",
        lineId: "line_1",
        returnQty: { value: "5", unit: "bags", precision: 0 },
        clientObservedAtUtc: "2026-09-28T15:00:00.000Z",
      },
    })
  );
  assert.equal(dispatched.ok, true);
  const negative = store.dispatchReturn(
    freezeCommand({
      commandId: "ret_neg",
      type: "dispatchReturn",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: {
        receiptId: "return_qty",
        expectedVersion: 2,
        reason: "undo by negative",
        lineId: "line_1",
        returnQty: { value: "-3", unit: "bags", precision: 0 },
        clientObservedAtUtc: "2026-09-28T15:01:00.000Z",
      },
    })
  );
  assert.equal(negative.ok, false);
  if (negative.ok) throw new Error("negative");
  assert.equal(negative.code, "invalid");
  assert.equal(store.getLineLedger("return_qty", "line_1")!.dispatchedReturn.value, "5");

  const returnEvent = store.getEvents("return_qty").find((e) => e.type === "return_dispatched")!;
  const corrected = store.correctReturnDispatch(
    freezeCommand({
      commandId: "ret_corr",
      type: "correctReturnDispatch",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: {
        receiptId: "return_qty",
        expectedVersion: 2,
        reason: "count restated against linked return",
        lineId: "line_1",
        linkedEventId: returnEvent.eventId,
        correctionQty: { value: "3", unit: "bags", precision: 0 },
        clientObservedAtUtc: "2026-09-28T15:02:00.000Z",
      },
    })
  );
  assert.equal(corrected.ok, true);
  assert.equal(store.getLineLedger("return_qty", "line_1")!.dispatchedReturn.value, "2");
}

{
  const empty = assembleManifest({
    exportId: "empty",
    ownerUid: "owner_1",
    ledgerId: "ledger_1",
    purchaseCaseId: "case_1",
    pinnedCuts: [],
    verifiedOriginals: [],
    artifactHashes: {},
    templateVersion: "1",
  });
  assert.equal(empty.completeness, "incomplete");
  assert.ok(empty.incompleteReasons.includes("no valid event cut"));
  assert.ok(empty.incompleteReasons.includes("no verified originals"));
}

{
  const bogusCut = assembleManifest({
    exportId: "bogus",
    ownerUid: "owner_1",
    ledgerId: "ledger_1",
    purchaseCaseId: "case_1",
    pinnedCuts: [{ receiptId: "r1", eventVersion: 1.5, headHash: "not-a-hash" }],
    verifiedOriginals: [
      {
        evidenceId: "ev_1",
        category: "invoice",
        originalFileName: "invoice.pdf",
        mime: "application/pdf",
        byteSize: 4,
        rawSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        storageObjectGeneration: null,
        captureProvenance: "test-double",
        osConversionOccurred: false,
        verification: "verified",
        isDerivative: false,
      },
    ],
    artifactHashes: {
      ev_1: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
    templateVersion: "1",
  });
  assert.equal(bogusCut.completeness, "incomplete");
}

{
  const missing = recordPortalCancellation(
    emptyEwbHistories(),
    {
      observedAtUtc: "2026-09-28T10:00:00.000Z",
      source: "user_reported",
      verificationLevel: "user_reported",
    },
    {
      reason: "",
      goodsMoved: "unknown",
      goodsMovedUnknownReason: null,
      linkedDocument: { kind: "missing", exceptionReason: "" },
      party: "",
      amount: { kind: "unknown", reason: "" },
      replacementEbn: { kind: "none", reason: "" },
    }
  );
  assert.equal(missing.ok, false);
}

{
  const stored = recordPortalCancellation(
    emptyEwbHistories(),
    {
      observedAtUtc: "2026-09-28T10:00:00.000Z",
      source: "user_reported",
      verificationLevel: "user_reported",
    },
    {
      reason: "cancelled before movement",
      goodsMoved: "no",
      goodsMovedUnknownReason: null,
      linkedDocument: { kind: "invoice", reference: "INV-9" },
      party: "transporter",
      amount: { kind: "unknown", reason: "not on letter" },
      replacementEbn: { kind: "not_applicable", reason: "no replacement" },
    }
  );
  assert.equal(stored.ok, true);
  if (!stored.ok) throw new Error("persist");
  assert.equal(latestCancellationEvidence(stored.histories)?.party, "transporter");
}

{
  __setRuntimeSignalsForTests({
    appOwnership: "standalone",
    isDev: false,
    platform: "android",
  });
  process.env.EXPO_PUBLIC_APP_MODE = "production";
  process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED = "1";
  assert.equal(isGoodsEvidenceEnabled(), false, "store runtime cannot be overridden");
  const productionLedger = new InMemoryGoodsLedger(
    "owner_1",
    "ledger_1",
    {
      nowMs: () => Date.UTC(2026, 8, 28, 12, 0, 0, 0),
      uuid: () => "x",
    },
    "production"
  );
  const denied = productionLedger.register(
    freezeCommand({
      commandId: "prod",
      type: "registerGoodsReceipt",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: sampleRegisterBody({ receiptId: "prod" }),
    })
  );
  assert.equal(denied.ok, false);
  if (denied.ok) throw new Error("production");
  assert.equal(denied.code, "disabled");
  __setRuntimeSignalsForTests(null);
  delete process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED;
}

{
  const store = testLedger();
  const missingSite = store.register(
    freezeCommand({
      commandId: "no_wh",
      type: "registerGoodsReceipt",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: sampleRegisterBody({
        receiptId: "no_wh",
        warehouse: undefined as unknown as { kind: "not_supplied" },
      }),
    })
  );
  assert.equal(missingSite.ok, false);
  if (missingSite.ok) throw new Error("warehouse");
  assert.equal(missingSite.code, "invalid");
}

{
  const store = testLedger();
  store.register(
    freezeCommand({
      commandId: "reg_wh",
      type: "registerGoodsReceipt",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: sampleRegisterBody({ receiptId: "amend_wh" }),
    })
  );
  const nullWarehouse = store.amend(
    freezeCommand({
      commandId: "amd_null_wh",
      type: "amendFields",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: {
        receiptId: "amend_wh",
        expectedVersion: 1,
        reason: "clear warehouse",
        changes: { warehouse: null },
        clientObservedAtUtc: "2026-09-28T13:00:00.000Z",
      },
    })
  );
  assert.equal(nullWarehouse.ok, false);
  if (nullWarehouse.ok) throw new Error("null warehouse");
  assert.equal(nullWarehouse.code, "invalid");
  assert.equal(store.getEffective("amend_wh")!.warehouse.kind, "present");
}

{
  const store = testLedger();
  store.register(
    freezeCommand({
      commandId: "two_lines",
      type: "registerGoodsReceipt",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: sampleRegisterBody({
        receiptId: "two_lines",
        lines: [
          sampleLine({ lineId: "line_1", physicallyReceived: { value: "10", unit: "bags", precision: 0 } }),
          sampleLine({
            lineId: "line_2",
            description: "Yarn",
            physicallyReceived: { value: "10", unit: "bags", precision: 0 },
            expectedOnThisDelivery: { value: "10", unit: "bags", precision: 0 },
          }),
        ],
      }),
    })
  );
  const dispatched = store.dispatchReturn(
    freezeCommand({
      commandId: "disp_l1",
      type: "dispatchReturn",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: {
        receiptId: "two_lines",
        expectedVersion: 1,
        reason: "line 1 return",
        lineId: "line_1",
        returnQty: { value: "2", unit: "bags", precision: 0 },
        clientObservedAtUtc: "2026-09-28T15:00:00.000Z",
      },
    })
  );
  assert.equal(dispatched.ok, true);
  const linked = store.getEvents("two_lines").find((event) => event.type === "return_dispatched")!;
  const crossLine = store.correctReturnDispatch(
    freezeCommand({
      commandId: "corr_l2",
      type: "correctReturnDispatch",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: {
        receiptId: "two_lines",
        expectedVersion: 2,
        reason: "wrong line",
        lineId: "line_2",
        linkedEventId: linked.eventId,
        correctionQty: { value: "5", unit: "bags", precision: 0 },
        clientObservedAtUtc: "2026-09-28T15:01:00.000Z",
      },
    })
  );
  assert.equal(crossLine.ok, false);
  if (crossLine.ok) throw new Error("cross line");
  assert.equal(crossLine.code, "invalid");
  assert.equal(store.getLineLedger("two_lines", "line_1")!.dispatchedReturn.value, "2");
  assert.equal(store.getLineLedger("two_lines", "line_2")!.dispatchedReturn.value, "0");
  const overLinked = store.correctReturnDispatch(
    freezeCommand({
      commandId: "corr_over",
      type: "correctReturnDispatch",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: {
        receiptId: "two_lines",
        expectedVersion: 2,
        reason: "too much",
        lineId: "line_1",
        linkedEventId: linked.eventId,
        correctionQty: { value: "5", unit: "bags", precision: 0 },
        clientObservedAtUtc: "2026-09-28T15:02:00.000Z",
      },
    })
  );
  assert.equal(overLinked.ok, false);
  if (overLinked.ok) throw new Error("over linked");
}

{
  const store = testLedger();
  const invalid = store.register(
    freezeCommand({
      commandId: "bad_reg",
      type: "registerGoodsReceipt",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: sampleRegisterBody({
        receiptId: "bad_reg",
        supplier: null as unknown as ReturnType<typeof sampleRegisterBody>["supplier"],
        lines: [
          sampleLine({
            physicallyReceived: { value: "-5", unit: "kg", precision: 0 },
          }),
        ],
      }),
    })
  );
  assert.equal(invalid.ok, false);
  if (invalid.ok) throw new Error("invalid register");
  assert.equal(invalid.code, "invalid");
  assert.equal(store.getOriginal("bad_reg"), undefined);
  assert.equal(store.getEvents("bad_reg").length, 0);
  const later = store.register(
    freezeCommand({
      commandId: "good_after_bad",
      type: "registerGoodsReceipt",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: sampleRegisterBody({ receiptId: "good_after_bad" }),
    })
  );
  assert.equal(later.ok, true);
  if (!later.ok) throw new Error("later");
  assert.equal(later.issuedNumber, "GRIN/MAIN/FY2026-27/000001");
}

{
  const store = testLedger();
  const duplicateLines = store.register(
    freezeCommand({
      commandId: "dup_lines",
      type: "registerGoodsReceipt",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: sampleRegisterBody({
        receiptId: "dup_lines",
        lines: [sampleLine({ lineId: "line_1" }), sampleLine({ lineId: "line_1", description: "dup" })],
      }),
    })
  );
  assert.equal(duplicateLines.ok, false);
  assert.equal(store.getOriginal("dup_lines"), undefined);
}

{
  const store = testLedger();
  const wrongType = freezeCommand({
    commandId: "wrong_type",
    type: "amendFields",
    ownerUid: "owner_1",
    ledgerId: "ledger_1",
    body: sampleRegisterBody({ receiptId: "wrong_type" }) as unknown as {
      receiptId: string;
      expectedVersion: number;
      reason: string;
      changes: Record<string, unknown>;
      clientObservedAtUtc: string;
    },
  });
  const denied = store.register(wrongType as never);
  assert.equal(denied.ok, false);
  if (denied.ok) throw new Error("type");
  assert.equal(denied.code, "invalid");
  assert.equal(store.getOriginal("wrong_type"), undefined);
}

{
  let throwNext = false;
  let n = 0;
  const store = new InMemoryGoodsLedger(
    "owner_1",
    "ledger_1",
    {
      nowMs: () => Date.UTC(2026, 8, 28, 12, 0, 0, 0),
      uuid: () => {
        if (throwNext) throw new Error("injected uuid failure");
        return `atom_${++n}`;
      },
    },
    "simulated-domain-test"
  );
  throwNext = true;
  const regCmd = freezeCommand({
    commandId: "atom_reg",
    type: "registerGoodsReceipt",
    ownerUid: "owner_1",
    ledgerId: "ledger_1",
    body: sampleRegisterBody({ receiptId: "atom_reg" }),
  });
  assert.throws(() => store.register(regCmd));
  assert.equal(store.getOriginal("atom_reg"), undefined);
  throwNext = false;
  const issued = store.register(regCmd);
  assert.equal(issued.ok, true);
  if (!issued.ok) throw new Error("atom issued");
  assert.equal(issued.issuedNumber, "GRIN/MAIN/FY2026-27/000001");

  const beforeRemarks = store.getEffective("atom_reg")!.remarks;
  const beforeHead = store.getView("atom_reg")!;
  const amdCmd = freezeCommand({
    commandId: "atom_amd",
    type: "amendFields",
    ownerUid: "owner_1",
    ledgerId: "ledger_1",
    body: {
      receiptId: "atom_reg",
      expectedVersion: 1,
      reason: "note",
      changes: { remarks: { kind: "present", value: "should not stick" } },
      clientObservedAtUtc: "2026-09-28T13:00:00.000Z",
    },
  });
  throwNext = true;
  assert.throws(() => store.amend(amdCmd));
  assert.deepEqual(store.getEffective("atom_reg")!.remarks, beforeRemarks);
  assert.equal(store.getEvents("atom_reg").length, 1);
  assert.equal(store.getView("atom_reg")!.eventVersion, beforeHead.eventVersion);
  assert.equal(store.getView("atom_reg")!.headHash, beforeHead.headHash);
  throwNext = false;
  const retried = store.amend(amdCmd);
  assert.equal(retried.ok, true);
  assert.equal(store.getEvents("atom_reg").length, 2);
  assert.equal(store.getEffective("atom_reg")!.remarks.kind, "present");

  const beforeQty = store.getLineLedger("atom_reg", "line_1")!.dispatchedReturn.value;
  const dispCmd = freezeCommand({
    commandId: "atom_disp",
    type: "dispatchReturn",
    ownerUid: "owner_1",
    ledgerId: "ledger_1",
    body: {
      receiptId: "atom_reg",
      expectedVersion: 2,
      reason: "partial return",
      lineId: "line_1",
      returnQty: { value: "5", unit: "bags", precision: 0 },
      clientObservedAtUtc: "2026-09-28T15:00:00.000Z",
    },
  });
  throwNext = true;
  assert.throws(() => store.dispatchReturn(dispCmd));
  assert.equal(store.getLineLedger("atom_reg", "line_1")!.dispatchedReturn.value, beforeQty);
  assert.equal(store.getEvents("atom_reg").length, 2);
  throwNext = false;
  const dispatched = store.dispatchReturn(dispCmd);
  assert.equal(dispatched.ok, true);
  assert.equal(store.getLineLedger("atom_reg", "line_1")!.dispatchedReturn.value, "5");

  const qcCmd = freezeCommand({
    commandId: "atom_qc",
    type: "recordQc",
    ownerUid: "owner_1",
    ledgerId: "ledger_1",
    body: {
      receiptId: "atom_reg",
      expectedVersion: 3,
      reason: "hold sample",
      qcStatus: "hold" as const,
      clientObservedAtUtc: "2026-09-28T16:00:00.000Z",
    },
  });
  throwNext = true;
  assert.throws(() => store.recordQc(qcCmd));
  assert.equal(store.getView("atom_reg")!.qcStatus, null);
  assert.equal(store.getEvents("atom_reg").length, 3);
  throwNext = false;
  assert.equal(store.recordQc(qcCmd).ok, true);
  assert.equal(store.getView("atom_reg")!.qcStatus, "hold");

  const linkedDispatch = store.getEvents("atom_reg").find((event) => event.type === "return_dispatched")!;
  const corrCmd = freezeCommand({
    commandId: "atom_corr",
    type: "correctReturnDispatch",
    ownerUid: "owner_1",
    ledgerId: "ledger_1",
    body: {
      receiptId: "atom_reg",
      expectedVersion: 4,
      reason: "recount",
      lineId: "line_1",
      linkedEventId: linkedDispatch.eventId,
      correctionQty: { value: "1", unit: "bags", precision: 0 },
      clientObservedAtUtc: "2026-09-28T16:01:00.000Z",
    },
  });
  throwNext = true;
  assert.throws(() => store.correctReturnDispatch(corrCmd));
  assert.equal(store.getLineLedger("atom_reg", "line_1")!.dispatchedReturn.value, "5");
  throwNext = false;
  assert.equal(store.correctReturnDispatch(corrCmd).ok, true);
  assert.equal(store.getLineLedger("atom_reg", "line_1")!.dispatchedReturn.value, "4");

  const voidCmd = freezeCommand({
    commandId: "atom_void",
    type: "voidWithReason",
    ownerUid: "owner_1",
    ledgerId: "ledger_1",
    body: {
      receiptId: "atom_reg",
      expectedVersion: 5,
      reason: "duplicate",
      linkedReceiptId: null,
      clientObservedAtUtc: "2026-09-28T16:02:00.000Z",
    },
  });
  throwNext = true;
  assert.throws(() => store.voidWithReason(voidCmd));
  assert.equal(store.getView("atom_reg")!.voided, false);
  throwNext = false;
  assert.equal(store.voidWithReason(voidCmd).ok, true);
  assert.equal(store.getView("atom_reg")!.voided, true);
}

{
  const store = testLedger();
  store.register(
    freezeCommand({
      commandId: "cust_reg",
      type: "registerGoodsReceipt",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: sampleRegisterBody({ receiptId: "cust" }),
    })
  );
  const partial = store.dispatchReturn(
    freezeCommand({
      commandId: "cust_part",
      type: "dispatchReturn",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: {
        receiptId: "cust",
        expectedVersion: 1,
        reason: "partial",
        lineId: "line_1",
        returnQty: { value: "5", unit: "bags", precision: 0 },
        clientObservedAtUtc: "2026-09-28T15:00:00.000Z",
      },
    })
  );
  assert.equal(partial.ok, true);
  assert.equal(store.getOriginal("cust")!.custody, "received");
  assert.equal(store.getView("cust")!.custody, "partially_returned");
  const replayPartial = store.dispatchReturn(
    freezeCommand({
      commandId: "cust_part",
      type: "dispatchReturn",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: {
        receiptId: "cust",
        expectedVersion: 1,
        reason: "partial",
        lineId: "line_1",
        returnQty: { value: "5", unit: "bags", precision: 0 },
        clientObservedAtUtc: "2026-09-28T15:00:00.000Z",
      },
    })
  );
  assert.equal(replayPartial.ok, true);
  if (!replayPartial.ok) throw new Error("replay");
  assert.equal(replayPartial.replayed, true);
  assert.equal(store.getLineLedger("cust", "line_1")!.dispatchedReturn.value, "5");
  assert.equal(store.getView("cust")!.custody, "partially_returned");

  const rest = store.dispatchReturn(
    freezeCommand({
      commandId: "cust_rest",
      type: "dispatchReturn",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: {
        receiptId: "cust",
        expectedVersion: 2,
        reason: "remainder",
        lineId: "line_1",
        returnQty: { value: "35", unit: "bags", precision: 0 },
        clientObservedAtUtc: "2026-09-28T15:01:00.000Z",
      },
    })
  );
  assert.equal(rest.ok, true);
  assert.equal(store.getView("cust")!.custody, "returned");
  const linked = store.getEvents("cust").find((event) => event.type === "return_dispatched")!;
  const restored = store.correctReturnDispatch(
    freezeCommand({
      commandId: "cust_corr",
      type: "correctReturnDispatch",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: {
        receiptId: "cust",
        expectedVersion: 3,
        reason: "recount first dispatch",
        lineId: "line_1",
        linkedEventId: linked.eventId,
        correctionQty: { value: "5", unit: "bags", precision: 0 },
        clientObservedAtUtc: "2026-09-28T15:02:00.000Z",
      },
    })
  );
  assert.equal(restored.ok, true);
  assert.equal(store.getOriginal("cust")!.lines[0]!.physicallyReceived.value, "40");
  assert.equal(store.getView("cust")!.custody, "partially_returned");
}

{
  const store = testLedger();
  store.register(
    freezeCommand({
      commandId: "held_reg",
      type: "registerGoodsReceipt",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: sampleRegisterBody({
        receiptId: "held",
        lines: [
          sampleLine({ lineId: "line_1", physicallyReceived: { value: "10", unit: "bags", precision: 0 } }),
          sampleLine({
            lineId: "line_2",
            description: "Yarn",
            physicallyReceived: { value: "10", unit: "bags", precision: 0 },
            expectedOnThisDelivery: { value: "10", unit: "bags", precision: 0 },
          }),
        ],
      }),
    })
  );
  store.recordQc(
    freezeCommand({
      commandId: "held_qc",
      type: "recordQc",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: {
        receiptId: "held",
        expectedVersion: 1,
        reason: "sample",
        qcStatus: "hold",
        clientObservedAtUtc: "2026-09-28T16:00:00.000Z",
      },
    })
  );
  assert.equal(store.getView("held")!.custody, "held_for_qc");
  store.dispatchReturn(
    freezeCommand({
      commandId: "held_ret",
      type: "dispatchReturn",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: {
        receiptId: "held",
        expectedVersion: 2,
        reason: "one line back",
        lineId: "line_1",
        returnQty: { value: "10", unit: "bags", precision: 0 },
        clientObservedAtUtc: "2026-09-28T16:01:00.000Z",
      },
    })
  );
  assert.equal(store.getView("held")!.custody, "partially_returned");
  assert.equal(store.getView("held")!.qcStatus, "hold");
  const accepted = store.recordQc(
    freezeCommand({
      commandId: "held_acc",
      type: "recordQc",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: {
        receiptId: "held",
        expectedVersion: 3,
        reason: "cleared",
        qcStatus: "accepted",
        clientObservedAtUtc: "2026-09-28T16:02:00.000Z",
      },
    })
  );
  assert.equal(accepted.ok, true);
  assert.equal(store.getView("held")!.qcStatus, "accepted");
  assert.notEqual(store.getView("held")!.custody, "held_for_qc");
  assert.equal(store.getOriginal("held")!.custody, "received");
}

{
  const store = testLedger();
  store.register(
    freezeCommand({
      commandId: "qc_reg",
      type: "registerGoodsReceipt",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: sampleRegisterBody({ receiptId: "qc_flow" }),
    })
  );
  store.recordQc(
    freezeCommand({
      commandId: "qc_hold",
      type: "recordQc",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: {
        receiptId: "qc_flow",
        expectedVersion: 1,
        reason: "hold",
        qcStatus: "hold",
        clientObservedAtUtc: "2026-09-28T16:00:00.000Z",
      },
    })
  );
  assert.equal(store.getView("qc_flow")!.custody, "held_for_qc");
  store.recordQc(
    freezeCommand({
      commandId: "qc_rej",
      type: "recordQc",
      ownerUid: "owner_1",
      ledgerId: "ledger_1",
      body: {
        receiptId: "qc_flow",
        expectedVersion: 2,
        reason: "wet",
        qcStatus: "rejected",
        clientObservedAtUtc: "2026-09-28T16:01:00.000Z",
      },
    })
  );
  assert.equal(store.getView("qc_flow")!.qcStatus, "rejected");
  assert.equal(store.getView("qc_flow")!.custody, "received");
  assert.notEqual(store.getView("qc_flow")!.custody, "refused_at_gate");
}

{
  const generic = appendPortalObservation(emptyEwbHistories(), {
    observedAtUtc: "2026-09-28T10:00:00.000Z",
    source: "user_reported",
    verificationLevel: "user_reported",
    status: "cancelled",
    evidence: { reason: "" },
  });
  assert.equal(generic.ok, true);
  if (!generic.ok) throw new Error("generic cancel");
  assert.equal(generic.admission, "unvalidated_incomplete");
  assert.equal(latestPortalStatus(generic.histories), "cancellation_unvalidated");
  assert.equal(latestCancellationEvidence(generic.histories), null);
}

console.log("goodsEvidence/findings.regression.test.ts: ok");
