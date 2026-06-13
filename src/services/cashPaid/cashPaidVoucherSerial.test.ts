import assert from "node:assert/strict";

import {
  formatCashPaidFinancialYearLabel,
  formatCpvSerial,
  parseCpvSerial,
} from "./cashPaidVoucherSerial";

assert.equal(formatCashPaidFinancialYearLabel(new Date(2026, 2, 15).getTime()), "2025-26");
assert.equal(formatCashPaidFinancialYearLabel(new Date(2026, 3, 1).getTime()), "2026-27");
assert.equal(formatCpvSerial("2026-27", 1), "CPV/2026-27/0001");
assert.equal(formatCpvSerial("2026-27", 42), "CPV/2026-27/0042");

assert.deepEqual(parseCpvSerial("CPV/2026-27/0001"), {
  yearLabel: "2026-27",
  count: 1,
});
assert.equal(parseCpvSerial("PO/2026-27/0001"), null);

console.log("cashPaidVoucherSerial.test.ts: all cases passed");
