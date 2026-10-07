import assert from "node:assert/strict";

import {
  filterOwnerReceipts,
  reportedArrivalFromOptionalDate,
} from "./grinReceiptSearch";
import type { GrinApplicationListItem } from "./types";

function item(partial: Partial<GrinApplicationListItem> & Pick<GrinApplicationListItem, "receiptId">): GrinApplicationListItem {
  return {
    displayNumber: null,
    supplierName: null,
    localState: "issued",
    custody: "received",
    qcStatus: null,
    captureProvenance: "offline",
    reportedArrivalAt: null,
    serverRegisteredAtUtc: null,
    offlinePending: false,
    gateRefusal: "none",
    projection: "readable",
    lastErrorActionable: null,
    ...partial,
  };
}

{
  const items = [
    item({
      receiptId: "r1",
      displayNumber: "GRIN-1",
      supplierName: "Acme Supplies",
      reportedArrivalAt: "2026-10-01T12:00:00.000+05:30",
    }),
    item({
      receiptId: "r2",
      displayNumber: "GRIN-2",
      supplierName: "Other Co",
    }),
  ];
  assert.equal(filterOwnerReceipts(items, "").length, 2);
  assert.equal(filterOwnerReceipts(items, "acme").length, 1);
  assert.equal(filterOwnerReceipts(items, "grin-2").length, 1);
  assert.equal(filterOwnerReceipts(items, "nope").length, 0);
}

assert.equal(reportedArrivalFromOptionalDate(""), null);
assert.equal(reportedArrivalFromOptionalDate("bad"), null);
assert.equal(
  reportedArrivalFromOptionalDate("2026-10-07"),
  "2026-10-07T12:00:00.000+05:30"
);

console.log("grinReceiptSearch.test.ts: ok");
