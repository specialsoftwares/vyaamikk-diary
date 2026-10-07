/**
 * CS-09 QA: missing 2B / GRIN stays unknown_incomplete or exception; ITC not_determined.
 * PURE_DOMAIN. Does not invent a live GST portal result.
 */
import assert from "node:assert/strict";

import {
  grinOrInvoiceMissingFrom2b,
  gstr2bPurchaseWithoutGrin,
  isItcDetermined,
} from "@/goodsEvidence/exceptions";

import { logWorkflowExecution } from "../workflowEvidence";

async function main(): Promise<void> {
  const at = "2026-09-28T12:00:00.000Z";
  const observation = {
    observedAtUtc: at,
    source: "manual assertion — not a live GST feed",
    sourceKind: "unknown_incomplete" as const,
  };
  const missingGrin = gstr2bPurchaseWithoutGrin({
    evaluatedAtUtc: at,
    isGoodsPurchase: true,
    isServiceOrIsd: false,
    hasDirectDeliveryEvidence: false,
    importCoverage: "partial",
    grinPresent: false,
    observation,
  });
  assert.equal(missingGrin.kind, "unknown_incomplete_source");
  assert.equal(missingGrin.itcDisposition, "not_determined");
  assert.equal(isItcDetermined(missingGrin), false);
  const missing2b = grinOrInvoiceMissingFrom2b({
    evaluatedAtUtc: at,
    isGstReportedGoodsPurchase: true,
    grinOrInvoicePresent: true,
    appearsIn2b: false,
    importCoverage: "partial",
    observation,
  });
  assert.equal(missing2b.itcDisposition, "not_determined");
  assert.equal(isItcDetermined(missing2b), false);
  logWorkflowExecution("CS-09", ["PURE_DOMAIN"]);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
