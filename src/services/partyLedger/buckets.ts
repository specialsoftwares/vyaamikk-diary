/**
 * Exact minor-string bucket arithmetic. Shared by apply and reconcile.
 */

import type { PartyBucketTotals } from "@/services/partyLedger/contracts";
import { addInr, inr, subInr } from "@/services/partyLedger/money";

/** Bucket party id used when the source has no stable partyId. Facts still store null. */
export const UNASSIGNED_PARTY_ID = "";

export function zeroBucketTotals(): PartyBucketTotals {
  return {
    cashPaidMinor: "0",
    cashReceivedMinor: "0",
    receivableMinor: "0",
    payableMinor: "0",
  };
}

export function bucketTotalsKey(ownerUid: string, partyId: string, period: string): string {
  return `${ownerUid}\u001f${partyId}\u001f${period}`;
}

function asMoney(minor: string) {
  return inr(BigInt(minor));
}

export function addBucketTotals(left: PartyBucketTotals, right: PartyBucketTotals): PartyBucketTotals {
  return {
    cashPaidMinor: addInr(asMoney(left.cashPaidMinor), asMoney(right.cashPaidMinor)).minor,
    cashReceivedMinor: addInr(asMoney(left.cashReceivedMinor), asMoney(right.cashReceivedMinor)).minor,
    receivableMinor: addInr(asMoney(left.receivableMinor), asMoney(right.receivableMinor)).minor,
    payableMinor: addInr(asMoney(left.payableMinor), asMoney(right.payableMinor)).minor,
  };
}

export function subBucketTotals(left: PartyBucketTotals, right: PartyBucketTotals): PartyBucketTotals {
  return {
    cashPaidMinor: subInr(asMoney(left.cashPaidMinor), asMoney(right.cashPaidMinor)).minor,
    cashReceivedMinor: subInr(asMoney(left.cashReceivedMinor), asMoney(right.cashReceivedMinor)).minor,
    receivableMinor: subInr(asMoney(left.receivableMinor), asMoney(right.receivableMinor)).minor,
    payableMinor: subInr(asMoney(left.payableMinor), asMoney(right.payableMinor)).minor,
  };
}

export function bucketTotalsAreZero(totals: PartyBucketTotals): boolean {
  return (
    BigInt(totals.cashPaidMinor) === 0n &&
    BigInt(totals.cashReceivedMinor) === 0n &&
    BigInt(totals.receivableMinor) === 0n &&
    BigInt(totals.payableMinor) === 0n
  );
}

export function sameBucketTotals(left: PartyBucketTotals, right: PartyBucketTotals): boolean {
  return bucketTotalsAreZero(subBucketTotals(left, right));
}
