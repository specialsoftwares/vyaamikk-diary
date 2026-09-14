/**
 * Apple transaction price (milliunits) → integer INR paise.
 *
 * Apple documents `JWSTransactionDecodedPayload.price` as milliunits of
 * `currency` (1000 milliunits = 1 currency unit). Vyaamikk's ledger is INR
 * paise (100 paise = 1 INR), so:
 *
 *   paise = milliunits / 10
 *
 * Conversion is BigInt-safe: no floating point. Currency MUST be INR.
 * Never use catalog expected price, renewalPrice, or client-supplied price.
 * Do not infer App Store commission by subtraction.
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
 * Convert Apple milliunit price to integer paise. Currency MUST be INR.
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

/** Apple does not expose an authoritative App Store commission amount. */
export const APPLE_PLATFORM_COMMISSION_IN_PAISE: null = null;
