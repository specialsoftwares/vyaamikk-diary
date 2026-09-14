/**
 * Apple JWS store-transaction price (milliunits) → integer INR paise.
 *
 * This converts verified `JWSTransactionDecodedPayload.price` + `currency`
 * into ledger-shaped paise for **pre-production consistency checks** and
 * injected tests. It is verified store-transaction evidence only.
 *
 * Apple documents that JWS price/currency MUST NOT be used for revenue
 * reconciliation or recognition. App Store Connect financial reporting is
 * the accounting source of record. That path is unimplemented
 * (`APP_STORE_FINANCIAL_REPORTING_AUTHORITY_IMPLEMENTED = false`).
 *
 * Production exports cannot reach this write path while that gate is false.
 * Do not treat the result as GST / revenue / accounting authority.
 *
 * Conversion (when used as evidence):
 *   paise = milliunits / 10
 * BigInt-safe, no floating point. Currency MUST be INR. Never use catalog
 * expected price, renewalPrice, or client-supplied price. Do not infer
 * App Store commission by subtraction.
 */

import { BillingError } from "../errors";

const MILLIUNITS_PER_PAISE = 10n;

function fail(causeCode: string): never {
  throw new BillingError({
    clientCode: "invalid_purchase",
    causeCode,
  });
}

function milliunitsToBigInt(raw: unknown): bigint {
  if (typeof raw === "bigint") {
    return raw;
  }
  if (typeof raw === "number") {
    if (!Number.isInteger(raw)) fail("malformed_apple_price");
    if (!Number.isSafeInteger(raw)) fail("malformed_apple_price");
    return BigInt(raw);
  }
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!/^[+-]?\d+$/.test(s)) fail("malformed_apple_price");
    return BigInt(s);
  }
  fail("malformed_apple_price");
}

/**
 * Convert verified Apple JWS milliunit store price to integer paise.
 * Currency MUST be INR. Not an accounting source of record.
 */
export function appleMilliunitsToPaise(opts: {
  price: unknown;
  currency: unknown;
}): number {
  if (opts.currency !== "INR") {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "non_inr_apple_price",
    });
  }
  const milli = milliunitsToBigInt(opts.price);
  if (milli < 0n) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "negative_apple_price",
    });
  }
  if (milli % MILLIUNITS_PER_PAISE !== 0n) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "fractional_sub_paise",
    });
  }
  const paise = milli / MILLIUNITS_PER_PAISE;
  if (paise > BigInt(Number.MAX_SAFE_INTEGER)) fail("malformed_apple_price");
  return Number(paise);
}

/** Apple JWS does not expose an authoritative App Store commission amount. */
export const APPLE_PLATFORM_COMMISSION_IN_PAISE: null = null;
