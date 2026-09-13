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
