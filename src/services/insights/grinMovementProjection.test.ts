import assert from "node:assert/strict";

import { countGrinIssuances, grinListItemToInsightFact } from "./grinMovementProjection";
import type { GrinApplicationListItem } from "@/services/grin/repository/types";

function item(
  partial: Partial<GrinApplicationListItem> & Pick<GrinApplicationListItem, "receiptId" | "localState">
): GrinApplicationListItem {
  return {
    displayNumber: null,
    supplierName: null,
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
  const queued = item({ receiptId: "a", localState: "queued", displayNumber: null });
  assert.equal(grinListItemToInsightFact(queued).countsAsIssuance, false);

  const issued = item({
    receiptId: "b",
    localState: "issued",
    displayNumber: "GRIN-9",
    supplierName: "Acme",
  });
  assert.equal(grinListItemToInsightFact(issued).countsAsIssuance, true);
  assert.equal(countGrinIssuances([queued, issued]), 1);
}

console.log("grinMovementProjection.test.ts: ok");
