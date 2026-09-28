/**
 * Regression tests for the review findings against committed domain code.
 * InMemoryGoodsLedger is SIMULATED.
 */
import assert from "node:assert/strict";

import { __setRuntimeSignalsForTests } from "@/config/env";

import { freezeCommand } from "./command";
import { assembleManifest } from "./evidencePack";
import { recordPortalCancellation, emptyEwbHistories, latestCancellationEvidence } from "./ewb";
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

console.log("goodsEvidence/findings.regression.test.ts: ok");
