import assert from "node:assert/strict";

import {
  filterOwnerReceipts,
  parseOptionalArrivalDate,
  reportedArrivalFromOptionalDate,
  returnEligibilityForRecord,
  returnableLinesFromRecord,
} from "./grinReceiptSearch";
import type { GrinApplicationListItem, GrinApplicationRecord } from "./types";
import { GRIN_APPLICATION_REPOSITORY_KIND } from "./labels";
import { sampleRegisterBody, sampleLine } from "@/goodsEvidence/testFixtures";
import { quantity } from "@/goodsEvidence/quantities";

const baseItem = (overrides: Partial<GrinApplicationListItem> = {}): GrinApplicationListItem => ({
  receiptId: "grcp_1",
  displayNumber: "GRIN/1",
  supplierName: "Acme",
  localState: "issued",
  custody: "received",
  qcStatus: null,
  captureProvenance: "unknown",
  reportedArrivalAt: null,
  serverRegisteredAtUtc: "2026-10-01T00:00:00.000Z",
  offlinePending: false,
  gateRefusal: "none",
  projection: "readable",
  lastErrorActionable: null,
  ...overrides,
});

const hits = filterOwnerReceipts(
  [
    baseItem(),
    baseItem({
      receiptId: "grcp_2",
      supplierName: "Beta",
      reportedArrivalAt: "2026-10-07",
    }),
  ],
  "beta"
);
assert.equal(hits.length, 1);
assert.equal(hits[0]?.receiptId, "grcp_2");

assert.deepEqual(parseOptionalArrivalDate(""), { ok: true, kind: "blank" });
assert.deepEqual(parseOptionalArrivalDate("   "), { ok: true, kind: "blank" });
assert.deepEqual(parseOptionalArrivalDate("bad"), { ok: false, kind: "invalid" });
assert.deepEqual(parseOptionalArrivalDate("2026-02-30"), { ok: false, kind: "invalid" });
assert.deepEqual(parseOptionalArrivalDate("2024-02-29"), { ok: true, kind: "date", localDate: "2024-02-29" });
assert.deepEqual(parseOptionalArrivalDate("2026-10-07"), {
  ok: true,
  kind: "date",
  localDate: "2026-10-07",
});
assert.equal(reportedArrivalFromOptionalDate("2026-10-07"), "2026-10-07");
assert.equal(reportedArrivalFromOptionalDate("2026-02-30"), null);
assert.notEqual(reportedArrivalFromOptionalDate("2026-10-07"), "2026-10-07T12:00:00.000+05:30");

const body = sampleRegisterBody({
  receiptId: "grcp_ret",
  lines: [
    sampleLine({ lineId: "line_1", physicallyReceived: quantity("40", "bags") }),
    sampleLine({
      lineId: "line_2",
      description: "Yarn",
      physicallyReceived: quantity("10", "bags"),
    }),
  ],
  captureProvenance: "unknown",
  reportedArrivalPrecision: "date",
  reportedArrivalAt: "2026-10-07",
});

const record = {
  repositoryKind: GRIN_APPLICATION_REPOSITORY_KIND,
  receiptId: "grcp_ret",
  ownerUid: "owner_a",
  ledgerId: "ledger_1",
  localState: "issued",
  issuedNumber: "GRIN/1",
  serverRegisteredAtUtc: "2026-10-08T00:00:00.000Z",
  commandId: "gcmd_1",
  digest: "a".repeat(64),
  outbox: {} as GrinApplicationRecord["outbox"],
  body,
  original: {
    ...body,
    ownerUid: "owner_a",
    ledgerId: "ledger_1",
    serial: 1,
    issuedNumber: "GRIN/1",
    fyToken: "FY2026-27",
    serverRegisteredAtUtc: "2026-10-08T00:00:00.000Z",
    originalSnapshotHash: "b".repeat(64),
    schemaVersion: 1 as const,
  },
  effective: {
    ...body,
    ownerUid: "owner_a",
    ledgerId: "ledger_1",
    serial: 1,
    issuedNumber: "GRIN/1",
    fyToken: "FY2026-27",
    serverRegisteredAtUtc: "2026-10-08T00:00:00.000Z",
    originalSnapshotHash: "b".repeat(64),
    schemaVersion: 1 as const,
  },
  gateRefusal: "none" as const,
  projection: "readable" as const,
} satisfies GrinApplicationRecord;

assert.equal(returnEligibilityForRecord(record, null).ok, false);
assert.equal(returnEligibilityForRecord(record, null).reason, "unconfirmed");

const lines = returnableLinesFromRecord(record, {
  queuedByLine: (lineId) => (lineId === "line_1" ? { value: "2", unit: "bags" } : null),
  confirmed: {
    receiptId: "grcp_ret",
    eventVersion: 2,
    headHash: "c".repeat(64),
    original: record.original,
    effective: record.effective,
    events: [
      {
        schemaVersion: 1,
        eventId: "evt1",
        receiptId: "grcp_ret",
        streamSequence: 1,
        type: "receipt_registered",
        actorUid: "owner_a",
        serverAcceptedAtUtc: "2026-10-08T00:00:00.000Z",
        clientObservedAtUtc: "2026-10-08T00:00:00.000Z",
        reason: "issued",
        expectedPreviousVersion: 0,
        typedChanges: {},
        previousHash: null,
        eventHash: "d".repeat(64),
        firestoreCommitTime: null,
      },
      {
        schemaVersion: 1,
        eventId: "evt2",
        receiptId: "grcp_ret",
        streamSequence: 2,
        type: "return_dispatched",
        actorUid: "owner_a",
        serverAcceptedAtUtc: "2026-10-08T01:00:00.000Z",
        clientObservedAtUtc: "2026-10-08T01:00:00.000Z",
        reason: "partial",
        expectedPreviousVersion: 1,
        typedChanges: {
          lineId: "line_1",
          unit: "bags",
          returnQty: quantity("5", "bags"),
        },
        previousHash: "d".repeat(64),
        eventHash: "e".repeat(64),
        firestoreCommitTime: null,
      },
    ],
  },
});
assert.equal(lines[0]?.confirmedReturned, "5 bags");
assert.equal(lines[0]?.pendingReturn, "2 bags");
assert.equal(lines[0]?.batchLotLabel, "not_recorded");
assert.ok(lines[0]?.availableRemaining);

console.log("grinReceiptSearch.test.ts: ok");
