/**
 * Shared party-ledger seam. Production server projection stays off until
 * rules, indexes, and a labelled backfill are deployed. Local figures that
 * use these types must say they are counted on device.
 */

import type { InrMoney } from "@/services/partyLedger/money";

export const PARTY_LEDGER_RULE_VERSION = "party-ledger-1";
export const PARTY_LEDGER_SERVER_PROJECTION_ENABLED = false;

export type LedgerEffect =
  | "cash_paid"
  | "cash_received"
  | "receivable_increase"
  | "receivable_decrease"
  | "payable_increase"
  | "payable_decrease"
  | "activity";

export type CoverageDisposition = "cash" | "obligation" | "activity" | "excluded";

export interface FinancialSourceRef {
  recordType: string;
  recordId: string;
  sourceEpoch: string;
  revision: string;
  subrecordId?: string;
}

export interface LedgerFact {
  id: string;
  ownerUid: string;
  partyId: string | null;
  partyNameSnapshot: string | null;
  source: FinancialSourceRef;
  effect: LedgerEffect;
  money?: InrMoney;
  effectiveDay: string;
  acceptedAt: string;
  ruleVersion: string;
  explanationKey: string;
  evidenceRefs: string[];
}

export interface PartyBucketKey {
  ownerUid: string;
  partyId: string;
  currency: "INR";
  period: string;
}

export interface PartyBucketTotals {
  cashPaidMinor: string;
  cashReceivedMinor: string;
  receivableMinor: string;
  payableMinor: string;
}

/** Desired contribution for one accepted source revision. Zero means voided. */
export interface SourceContribution {
  sourceKey: string;
  sourceEpoch: string;
  sourceRevision: string;
  projectorVersion: string;
  facts: LedgerFact[];
}

export interface AppliedSourceProjection {
  ownerUid: string;
  sourceKey: string;
  sourceEpoch: string;
  sourceRevision: string;
  projectorVersion: string;
  contributionHash: string;
  totals: PartyBucketTotals;
  partyIds: string[];
}
