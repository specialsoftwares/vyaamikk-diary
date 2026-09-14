/**
 * Google Money → integer INR paise.
 *
 * Authoritative gross for a paid Vyaamikk financial event is Order.total
 * (final amount paid by the customer, including applicable discounts/taxes).
 *
 * Never use catalog expected price, autoRenewingPlan.recurringPrice, or
 * developerRevenueInBuyerCurrency as gross. Never treat
 * Order.total - developerRevenue as platform commission.
 *
 * Conversion is BigInt-safe: no floating point. 1 INR = 100 paise.
 * 10_000_000 nanos = 1 paise. Fractional sub-paise values fail closed.
 */

import { BillingError } from "../errors";
import type { GoogleMoney } from "./playTypes";

const NANOS_PER_UNIT = 1_000_000_000n;
const PAISE_PER_UNIT = 100n;
const NANOS_PER_PAISE = NANOS_PER_UNIT / PAISE_PER_UNIT; // 10_000_000

function fail(causeCode: string): never {
  throw new BillingError({
    clientCode: "invalid_purchase",
    causeCode,
  });
}

function parseUnits(raw: unknown): bigint {
  if (raw == null) return 0n;
  if (typeof raw === "number") {
    if (!Number.isInteger(raw)) fail("malformed_google_money");
    return BigInt(raw);
  }
  if (typeof raw !== "string") fail("malformed_google_money");
  const s = raw.trim();
  if (s === "") return 0n;
  if (!/^[+-]?\d+$/.test(s)) fail("malformed_google_money");
  return BigInt(s);
}

function parseNanos(raw: unknown): bigint {
  if (raw == null) return 0n;
  if (typeof raw !== "number" || !Number.isInteger(raw)) fail("malformed_google_money");
  return BigInt(raw);
}

/**
 * Convert Google Money to integer paise. Currency MUST be INR.
 * Negative totals are rejected (purchase and refund gross are unsigned).
 */
export function googleMoneyToPaise(money: GoogleMoney | null | undefined): number {
  if (money == null || typeof money !== "object") fail("malformed_google_money");
  if (money.currencyCode !== "INR") {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "non_inr_order_total",
    });
  }
  const units = parseUnits(money.units);
  const nanos = parseNanos(money.nanos);
  if (nanos < 0n || nanos >= NANOS_PER_UNIT) fail("malformed_google_money");
  if (units < 0n) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "negative_purchase_total",
    });
  }
  if (nanos % NANOS_PER_PAISE !== 0n) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "fractional_sub_paise",
    });
  }
  const paise = units * PAISE_PER_UNIT + nanos / NANOS_PER_PAISE;
  if (paise > BigInt(Number.MAX_SAFE_INTEGER)) fail("malformed_google_money");
  return Number(paise);
}

/** Paid financial events reject a zero Order.total (no promo/zero-order fallback). */
export function googlePaidOrderTotalToPaise(money: GoogleMoney | null | undefined): number {
  const paise = googleMoneyToPaise(money);
  if (paise <= 0) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "zero_order_total",
    });
  }
  return paise;
}
