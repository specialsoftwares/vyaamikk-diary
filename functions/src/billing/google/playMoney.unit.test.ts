/**
 * Google Money → INR paise (VYD-32).
 * Run: npm run test:billing-google-money
 */

import assert from "node:assert/strict";

import { BillingError } from "../errors";
import { googleMoneyToPaise, googlePaidOrderTotalToPaise } from "./playMoney";

function isCause(code: string) {
  return (e: unknown) => e instanceof BillingError && e.causeCode === code;
}

function paise(money: Parameters<typeof googleMoneyToPaise>[0]): number {
  return googleMoneyToPaise(money);
}

assert.equal(paise({ currencyCode: "INR", units: "10", nanos: 0 }), 1_000);
assert.equal(paise({ currencyCode: "INR", units: "1", nanos: 10_000_000 }), 101);
assert.equal(paise({ currencyCode: "INR", units: "0", nanos: 500_000_000 }), 50);
assert.equal(paise({ currencyCode: "INR", units: "249", nanos: 0 }), 24_900);
assert.equal(paise({ currencyCode: "INR" }), 0);

assert.equal(googlePaidOrderTotalToPaise({ currencyCode: "INR", units: "1", nanos: 10_000_000 }), 101);

assert.throws(
  () => paise({ currencyCode: "INR", units: "1", nanos: 1_000_000 }),
  isCause("fractional_sub_paise")
);
assert.throws(() => paise(null), isCause("malformed_google_money"));
assert.throws(() => paise({ currencyCode: "INR", units: "1.5" }), isCause("malformed_google_money"));
assert.throws(() => paise({ currencyCode: "INR", units: "1", nanos: 1.5 }), isCause("malformed_google_money"));
assert.throws(() => paise({ currencyCode: "INR", nanos: -1 }), isCause("malformed_google_money"));
assert.throws(() => paise({ currencyCode: "INR", nanos: 1_000_000_000 }), isCause("malformed_google_money"));
assert.throws(() => paise({ currencyCode: "USD", units: "1", nanos: 0 }), isCause("non_inr_order_total"));
assert.throws(() => paise({ currencyCode: "INR", units: "-1", nanos: 0 }), isCause("negative_purchase_total"));
assert.throws(
  () => googlePaidOrderTotalToPaise({ currencyCode: "INR", units: "0", nanos: 0 }),
  isCause("zero_order_total")
);

console.log("playMoney.unit.test.ts: ok");
