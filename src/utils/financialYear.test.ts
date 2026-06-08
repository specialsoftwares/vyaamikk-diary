import assert from "node:assert/strict";

import {
  formatFinancialYearLabel,
  getCurrentFinancialYear,
  getFinancialYearForDate,
  getFinancialYearRange,
  isDateInFinancialYear,
  isFinancialYearClosed,
} from "./financialYear";

assert.equal(getFinancialYearForDate(new Date(2026, 2, 15)), 2025);
assert.equal(getFinancialYearForDate(new Date(2026, 3, 1)), 2026);
assert.equal(formatFinancialYearLabel(2025), "FY 2025-26");

const range = getFinancialYearRange(2025);
assert.equal(new Date(range.startMs).getFullYear(), 2025);
assert.equal(new Date(range.startMs).getMonth(), 3);
assert.ok(isDateInFinancialYear(range.startMs, 2025));
assert.ok(!isDateInFinancialYear(range.endMs, 2025));

const current = getCurrentFinancialYear();
assert.equal(typeof current, "number");
assert.ok(!isFinancialYearClosed(current));

console.log("financialYear.test.ts: ok");
