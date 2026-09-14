/**
 * Apple milliunit → INR paise store-transaction evidence (VYD-33).
 * Not an accounting / revenue / GST source of record.
 * Run: npm run test:billing-apple-money
 */
import assert from "node:assert/strict";

import { BillingError } from "../errors";
import { appleMilliunitsToPaise, APPLE_PLATFORM_COMMISSION_IN_PAISE } from "./appleMoney";
import { SUBSCRIPTION_CATALOG } from "../products";

function isCause(code: string) {
  return (e: unknown) => e instanceof BillingError && e.causeCode === code;
}

assert.equal(appleMilliunitsToPaise({ price: 1000, currency: "INR" }), 100);
assert.equal(appleMilliunitsToPaise({ price: 1010, currency: "INR" }), 101);
assert.equal(appleMilliunitsToPaise({ price: 0, currency: "INR" }), 0);
assert.equal(appleMilliunitsToPaise({ price: 249000, currency: "INR" }), 24_900);
assert.equal(appleMilliunitsToPaise({ price: 249000n, currency: "INR" }), 24_900);
assert.equal(appleMilliunitsToPaise({ price: "1010", currency: "INR" }), 101);

assert.equal(APPLE_PLATFORM_COMMISSION_IN_PAISE, null);

const catalog = SUBSCRIPTION_CATALOG.vyd_professional_monthly.expectedPriceInPaise;
assert.notEqual(appleMilliunitsToPaise({ price: 1010, currency: "INR" }), catalog);

assert.throws(() => appleMilliunitsToPaise({ price: 1001, currency: "INR" }), isCause("fractional_sub_paise"));
assert.throws(() => appleMilliunitsToPaise({ price: 1010, currency: "USD" }), isCause("non_inr_apple_price"));
assert.throws(() => appleMilliunitsToPaise({ price: -10, currency: "INR" }), isCause("negative_apple_price"));
assert.throws(() => appleMilliunitsToPaise({ price: 1.5, currency: "INR" }), isCause("malformed_apple_price"));
assert.throws(() => appleMilliunitsToPaise({ price: "12.0", currency: "INR" }), isCause("malformed_apple_price"));
assert.throws(() => appleMilliunitsToPaise({ price: Number.MAX_SAFE_INTEGER + 1, currency: "INR" }), isCause("malformed_apple_price"));

console.log("appleMoney.unit.test.ts: ok");
