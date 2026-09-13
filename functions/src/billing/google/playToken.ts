/**
 * Purchase-token shape checks. The token itself is never copied into errors.
 */

import { BillingError } from "../errors";

export const PURCHASE_TOKEN_MIN_LENGTH = 8;
export const PURCHASE_TOKEN_MAX_LENGTH = 4096;

export function assertPurchaseToken(value: unknown): string {
  if (typeof value !== "string") {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "invalid_purchase_token",
    });
  }
  if (
    value.length < PURCHASE_TOKEN_MIN_LENGTH ||
    value.length > PURCHASE_TOKEN_MAX_LENGTH ||
    !/^[\x21-\x7E]+$/.test(value)
  ) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "invalid_purchase_token",
    });
  }
  return value;
}

export function assertOrderId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "invalid_order_id",
    });
  }
  return value;
}
