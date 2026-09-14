/**
 * Apple JWS input shape checks. The compact JWS itself is never copied into
 * errors, logs, or thrown messages.
 */

import { BillingError } from "../errors";

export const APPLE_JWS_MIN_LENGTH = 80;
export const APPLE_JWS_MAX_LENGTH = 65_536;

const JWS_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function assertSignedJws(value: unknown, causeCode: string): string {
  if (typeof value !== "string") {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode,
    });
  }
  if (
    value.length < APPLE_JWS_MIN_LENGTH ||
    value.length > APPLE_JWS_MAX_LENGTH ||
    !JWS_RE.test(value)
  ) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode,
    });
  }
  return value;
}
