/**
 * App Store revocationPercentage integrity (VYD-33).
 *
 * Apple documents `revocationPercentage` as an integer milli-percent
 * (0..100000) on refunded transactions. Full refund = 100000. The field
 * is absent after a refund is reversed. Do not guess 100%.
 */

import { RevocationType, type JWSTransactionDecodedPayload } from "@apple/app-store-server-library";

/** Apple milli-percent for a complete refund (`revocationPercentage`). */
export const IOS_FULL_REFUND_PERCENTAGE_MILLIUNITS = 100_000;

export type IosMonetaryRefundPercentageDisposition = "full" | "prorated" | "invalid";

function isIntegerMilliPercent(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value);
}

function isExactFullPercentage(value: unknown): boolean {
  return isIntegerMilliPercent(value) && value === IOS_FULL_REFUND_PERCENTAGE_MILLIUNITS;
}

function isStrictProratedPercentage(value: unknown): boolean {
  return (
    isIntegerMilliPercent(value) &&
    value > 0 &&
    value < IOS_FULL_REFUND_PERCENTAGE_MILLIUNITS
  );
}

/**
 * Monetary refund percentage vs `revocationType`.
 * `null` = not a REFUND_FULL / REFUND_PRORATED monetary refund.
 */
export function iosMonetaryRefundPercentageDisposition(
  transaction: JWSTransactionDecodedPayload
): IosMonetaryRefundPercentageDisposition | null {
  if (transaction.revocationType === RevocationType.REFUND_FULL) {
    return isExactFullPercentage(transaction.revocationPercentage) ? "full" : "invalid";
  }
  if (transaction.revocationType === RevocationType.REFUND_PRORATED) {
    return isStrictProratedPercentage(transaction.revocationPercentage) ? "prorated" : "invalid";
  }
  return null;
}
