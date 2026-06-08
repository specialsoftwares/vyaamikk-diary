import assert from "node:assert/strict";

import {
  formatPaymentPeriodLine,
  isPaymentPeriodInvalid,
  paymentPeriodDays,
} from "./paymentPeriod";

function day(y: number, m: number, d: number): number {
  return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
}

assert.equal(paymentPeriodDays(day(2026, 3, 1), day(2026, 3, 22)), 21);
assert.equal(paymentPeriodDays(day(2026, 3, 1), day(2026, 3, 1)), 0);
assert.equal(paymentPeriodDays(null, day(2026, 3, 1)), null);
assert.equal(paymentPeriodDays(day(2026, 3, 10), null), null);
assert.equal(isPaymentPeriodInvalid(day(2026, 3, 10), day(2026, 3, 1)), true);
assert.equal(isPaymentPeriodInvalid(day(2026, 3, 1), day(2026, 3, 10)), false);

const line = formatPaymentPeriodLine(day(2026, 3, 1), day(2026, 3, 22));
assert.ok(line?.includes("21 days"));

assert.equal(formatPaymentPeriodLine(day(2026, 3, 10), day(2026, 3, 1)), null);

console.log("paymentPeriod.test.ts: ok");
