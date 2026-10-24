import assert from "node:assert/strict";

import { coverageFor } from "@/services/partyLedger/coverage";
import {
  addInr,
  formatInrMinor,
  parseInrDecimal,
  subInr,
  sumInr,
} from "@/services/partyLedger/money";

function minor(raw: unknown): string {
  const parsed = parseInrDecimal(raw);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("unreachable");
  return parsed.money.minor;
}

{
  assert.equal(minor("2000"), "200000");
  assert.equal(minor("2,000.50"), "200050");
  assert.equal(minor("₹2,000"), "200000");
  assert.equal(minor(2500), "250000");
  const fractional = parseInrDecimal("10.005");
  assert.equal(fractional.ok, false);
  if (!fractional.ok) assert.equal(fractional.reason, "fractional_paise");
  assert.equal(parseInrDecimal(-1).ok, false);
  assert.equal(parseInrDecimal("").ok, false);
  assert.equal(parseInrDecimal(Number.NaN).ok, false);
}

{
  const paid = parseInrDecimal("2000");
  const edited = parseInrDecimal("2500");
  assert.equal(paid.ok && edited.ok, true);
  if (paid.ok && edited.ok) {
    assert.equal(addInr(paid.money, subInr(edited.money, paid.money)).minor, "250000");
    assert.equal(sumInr([paid.money, paid.money]).minor, "400000");
    assert.equal(formatInrMinor(edited.money.minor), "₹2,500.00");
  }
}

{
  assert.equal(coverageFor("business_cash_given").disposition, "cash");
  assert.equal(coverageFor("payment_request").disposition, "activity");
  assert.equal(coverageFor("purchase_order").disposition, "activity");
  assert.equal(coverageFor("draft").disposition, "excluded");
  assert.equal(coverageFor("not_a_type").disposition, "excluded");
}

console.log("partyLedger.money.test.ts: ok");
