import assert from "node:assert/strict";

import {
  denominationTotal,
  formatCashPaidFinancialYearLabel,
  formatCpvSerial,
  parseCpvSerial,
  validateDenominationForFullLegal,
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

const breakdown = { 500: 1, 200: 0, 100: 2, 50: 0, total: 700 };
assert.equal(denominationTotal(breakdown), 700);
assert.equal(validateDenominationForFullLegal(700, breakdown), null);
assert.equal(
  validateDenominationForFullLegal(700, { ...breakdown, total: 650 }),
  "Denomination total must match the note counts."
);
assert.ok(
  validateDenominationForFullLegal(800, breakdown)?.includes("must match the cash amount")
);

console.log("cashPaidVoucherSerial.test.ts: all cases passed");
