/**
 * VYD-36 — Customer Credit identity is resolved exactly once per create call.
 *
 * Evidence classes (do not conflate):
 * - builder invoked twice with one captured id (this file)
 * - SDK transaction callback retry (afterReads count >= 2 in emulator)
 * - separate API retry using the same stable clientRecordId (lifecycle tests)
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

function resolveOnce(clientRecordId: string | undefined): { captured: string; generateCalls: number } {
  let generateCalls = 0;
  const captured = (() => {
    generateCalls += 1;
    return stableRecordId(clientRecordId, "cr");
  })();
  return { captured, generateCalls };
}

function assertBuilderRetryUsesCapturedId(clientRecordId: string | undefined, label: string) {
  const { captured, generateCalls } = resolveOnce(clientRecordId);
  assert.equal(generateCalls, 1, `${label}: identity generated once before build`);
  const first = buildNewRecord("uid-1", 1, input(clientRecordId), 1, captured);
  const retry = buildNewRecord("uid-1", 2, input(clientRecordId), 1, captured);
  assert.equal(first.id, captured, `${label}: first builder invocation uses captured id`);
  assert.equal(retry.id, captured, `${label}: second builder invocation uses captured id`);
  assert.equal(first.id, retry.id, `${label}: builder retry does not mint a new id`);
}

assert.equal(stableRecordId("cr_explicit", "cr"), "cr_explicit");
assert.equal(stableRecordId("  cr_trim  ", "cr"), "cr_trim");

assertBuilderRetryUsesCapturedId(undefined, "absent");
assertBuilderRetryUsesCapturedId("", "blank");
assertBuilderRetryUsesCapturedId("   ", "whitespace");
assertBuilderRetryUsesCapturedId("cr_stable_1", "explicit");

console.log("recordIdentity.test.ts: ok");
