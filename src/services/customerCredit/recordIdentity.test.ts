/**
 * VYD-36 Round 2 — Customer Credit identity is resolved exactly once.
 * Absent/blank clientRecordId must not mint a new id on buildNew retry.
 */
import assert from "node:assert/strict";

import { stableRecordId } from "@/services/records/stableRecordId";
import { buildNewRecord } from "@/services/customerCredit/shared";
import type { CreateCustomerCreditInput } from "@/services/customerCredit/types";

function input(clientRecordId?: string): CreateCustomerCreditInput {
  return {
    ...(clientRecordId !== undefined ? { clientRecordId } : {}),
    ueid: "VYD-2026-BILL01",
    saleDate: 1_700_000_000_000,
    mode: "credit",
    customerName: "Ravi Kumar",
    products: [
      {
        productName: "Phone",
        brandModel: "A1",
        serialImei: null,
        saleAmount: 10000,
        invoiceNumber: null,
      },
    ],
    saleAmount: 10000,
  };
}

function assertRetryPreservesId(clientRecordId: string | undefined, label: string) {
  const captured = stableRecordId(clientRecordId, "cr");
  const first = buildNewRecord("uid-1", 1, input(clientRecordId), 1, captured);
  const retry = buildNewRecord("uid-1", 2, input(clientRecordId), 1, captured);
  assert.equal(first.id, captured, `${label}: first build uses captured id`);
  assert.equal(retry.id, captured, `${label}: retry build uses captured id`);
  assert.equal(first.id, retry.id, `${label}: path/payload id does not change on retry`);
  assert.ok(captured.trim().length > 0, `${label}: captured id is non-blank`);
}

assert.notEqual(
  stableRecordId(undefined, "cr"),
  stableRecordId(undefined, "cr"),
  "absent clientRecordId is non-deterministic unless captured"
);
assert.notEqual(
  stableRecordId("", "cr"),
  stableRecordId("", "cr"),
  "blank clientRecordId is non-deterministic unless captured"
);
assert.notEqual(
  stableRecordId("   ", "cr"),
  stableRecordId("   ", "cr"),
  "whitespace clientRecordId is non-deterministic unless captured"
);
assert.equal(stableRecordId("cr_explicit", "cr"), "cr_explicit");
assert.equal(stableRecordId("  cr_trim  ", "cr"), "cr_trim");

assertRetryPreservesId(undefined, "absent");
assertRetryPreservesId("", "blank");
assertRetryPreservesId("   ", "whitespace");
assertRetryPreservesId("cr_stable_1", "explicit");

console.log("recordIdentity.test.ts: ok");
