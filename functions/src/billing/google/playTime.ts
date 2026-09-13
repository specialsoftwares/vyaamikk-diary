/**
 * Strict RFC3339 timestamp parsing for Google Play timestamps.
 * Invalid / missing timestamps fail closed. Dates are never manufactured.
 */

import { BillingError } from "../errors";

const RFC3339 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export function parseRfc3339Millis(value: string | null | undefined, causeCode: string): number {
  if (typeof value !== "string" || !RFC3339.test(value)) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode,
    });
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode,
    });
  }
  return ms;
}

export function parseRfc3339MillisOrNull(
  value: string | null | undefined,
  causeCode: string
): number | null {
  if (value == null || value === "") return null;
  return parseRfc3339Millis(value, causeCode);
}

/**
 * Google RTDN `eventTimeMillis` is milliseconds since epoch, encoded as a
 * decimal string (sometimes a number). Strict integer parse; no Date math.
 */
export function parseGoogleEventTimeMillis(
  value: unknown,
  causeCode = "invalid_event_time_millis"
): number {
  let asString: string;
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value <= 0) {
      throw new BillingError({ clientCode: "invalid_purchase", causeCode });
    }
    asString = String(value);
  } else if (typeof value === "string") {
    asString = value.trim();
  } else {
    throw new BillingError({ clientCode: "invalid_purchase", causeCode });
  }
  if (!/^[1-9][0-9]*$/.test(asString)) {
    throw new BillingError({ clientCode: "invalid_purchase", causeCode });
  }
  try {
    const n = BigInt(asString);
    if (n <= 0n || n > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new BillingError({ clientCode: "invalid_purchase", causeCode });
    }
    return Number(n);
  } catch (err) {
    if (err instanceof BillingError) throw err;
    throw new BillingError({ clientCode: "invalid_purchase", causeCode });
  }
}

export function parseGoogleEventTimeMillisOrNull(
  value: unknown,
  causeCode = "invalid_event_time_millis"
): number | null {
  if (value == null || value === "") return null;
  return parseGoogleEventTimeMillis(value, causeCode);
}
