import assert from "node:assert/strict";

import { addDays, subDays } from "date-fns";

import {
  CASH_PAID_LOOKBACK_DAYS,
  calendarDayStartMs,
  cashPaidDateWindow,
  isCashPaidDateInWindow,
  normalizeCashPaidDayMs,
  validateCashPaidDateForSave,
} from "./cashPaidDate";

const ref = new Date();

assert.equal(CASH_PAID_LOOKBACK_DAYS, 30);

const todayMs = calendarDayStartMs(ref);
const yesterdayMs = calendarDayStartMs(subDays(ref, 1));
const thirtyAgoMs = calendarDayStartMs(subDays(ref, CASH_PAID_LOOKBACK_DAYS));
const thirtyOneAgoMs = calendarDayStartMs(subDays(ref, 31));
const tomorrowMs = calendarDayStartMs(addDays(ref, 1));

assert(isCashPaidDateInWindow(todayMs, ref), "today allowed");
assert(isCashPaidDateInWindow(yesterdayMs, ref), "yesterday allowed");
assert(isCashPaidDateInWindow(thirtyAgoMs, ref), "30 days ago allowed");
assert(!isCashPaidDateInWindow(thirtyOneAgoMs, ref), "31 days ago blocked");
assert(!isCashPaidDateInWindow(tomorrowMs, ref), "tomorrow blocked");

assert.equal(validateCashPaidDateForSave(todayMs), null);
assert.equal(validateCashPaidDateForSave(thirtyOneAgoMs), "too_old");
assert.equal(validateCashPaidDateForSave(tomorrowMs), "future");
assert.equal(validateCashPaidDateForSave(null), "required");

// Legacy: unchanged date outside window still valid on edit
assert.equal(
  validateCashPaidDateForSave(thirtyOneAgoMs, { existingPaymentDateMs: thirtyOneAgoMs }),
  null
);
// Changing legacy date to a valid in-window day
assert.equal(
  validateCashPaidDateForSave(todayMs, { existingPaymentDateMs: thirtyOneAgoMs }),
  null
);
// Changing to an out-of-window day is blocked
assert.equal(
  validateCashPaidDateForSave(thirtyOneAgoMs, { existingPaymentDateMs: todayMs }),
  "too_old"
);

const { minMs, maxMs } = cashPaidDateWindow(ref);
assert.equal(minMs, thirtyAgoMs);
assert.equal(maxMs, todayMs);

const normalized = normalizeCashPaidDayMs(todayMs + 6 * 60 * 60 * 1000);
assert.equal(calendarDayStartMs(new Date(normalized)), todayMs);

console.log("cashPaidDate.test.ts: all assertions passed");
