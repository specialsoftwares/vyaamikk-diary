/**
 * Pure party-ledger projector. No Firebase, no network.
 * Server projection stays off (PARTY_LEDGER_SERVER_PROJECTION_ENABLED is false).
 * Rollback is to leave that flag false: nothing here migrates live data.
 */

import {
  computeCreditSummary,
  type CustomerCreditRecord,
} from "@/domain/customerCredit";
import {
  PARTY_LEDGER_RULE_VERSION,
  type LedgerEffect,
  type LedgerFact,
  type PartyBucketTotals,
  type SourceContribution,
} from "@/services/partyLedger/contracts";
import { coverageFor } from "@/services/partyLedger/coverage";
import { parseInrDecimal, addInr, inr, subInr, type InrMoney } from "@/services/partyLedger/money";
import { bucketTotalsAreZero, zeroBucketTotals } from "@/services/partyLedger/buckets";

export interface LedgerSource {
  ownerUid: string;
  recordType: string;
  recordId: string;
  sourceEpoch: string;
  revision: string;
  effectiveDay: string;
  acceptedAt: string;
  /** Stable party id when the source already has one. Names are not ids. */
  partyId?: string | null;
  voided?: boolean;
  deleted?: boolean;
  payload?: unknown;
  credit?: CustomerCreditRecord;
}

export interface SourceAllocation {
  ownerUid: string;
  partyId: string;
  period: string;
  totals: PartyBucketTotals;
}

interface CreditLedgerExtras {
  partyId?: string | null;
  sourceEpoch?: string;
  sourceRevision?: string;
  effectiveDay?: string;
  acceptedAt?: string;
  ledgerRecordType?: string;
}

const FACT_ID_SEPARATOR = ":";

export function sourceKeyFor(source: Pick<LedgerSource, "ownerUid" | "recordType" | "recordId">): string {
  return `${source.ownerUid}${FACT_ID_SEPARATOR}${source.recordType}${FACT_ID_SEPARATOR}${source.recordId}`;
}

/** owner, recordType, recordId, epoch, effect, subrecord id. */
export function ledgerFactId(
  ownerUid: string,
  recordType: string,
  recordId: string,
  epoch: string,
  effect: string,
  subrecordId: string,
): string {
  return [ownerUid, recordType, recordId, epoch, effect, subrecordId].join(FACT_ID_SEPARATOR);
}

export function compareSourcePosition(
  left: { epoch: string; revision: string },
  right: { epoch: string; revision: string },
): number {
  const epoch = compareDecimal(left.epoch, right.epoch);
  if (epoch !== 0) return epoch;
  return compareDecimal(left.revision, right.revision);
}

function compareDecimal(left: string, right: string): number {
  if (/^\d+$/.test(left) && /^\d+$/.test(right)) {
    const a = BigInt(left);
    const b = BigInt(right);
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function snapshotName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function stablePartyId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function partyIdOf(source: LedgerSource, payload: Record<string, unknown>): string | null {
  return stablePartyId(source.partyId) ?? stablePartyId(payload.partyId);
}

function isVoidSource(source: LedgerSource): boolean {
  if (source.voided === true || source.deleted === true) return true;
  const payload = asRecord(source.payload);
  if (typeof payload.deletedAt === "number") return true;
  if (payload.voided === true) return true;
  return false;
}

function requireIdentity(source: LedgerSource): void {
  if (!source.ownerUid || !source.recordType || !source.recordId) {
    throw new Error("party_ledger_source_invalid");
  }
  if (!source.sourceEpoch || !source.revision || !source.effectiveDay || !source.acceptedAt) {
    throw new Error("party_ledger_source_invalid");
  }
}

function shell(source: LedgerSource, facts: LedgerFact[]): SourceContribution {
  return {
    sourceKey: sourceKeyFor(source),
    sourceEpoch: source.sourceEpoch,
    sourceRevision: source.revision,
    projectorVersion: PARTY_LEDGER_RULE_VERSION,
    facts,
  };
}

function makeFact(
  source: LedgerSource,
  effect: LedgerEffect,
  subrecordId: string,
  explanationKey: string,
  partyId: string | null,
  partyNameSnapshot: string | null,
  evidenceRefs: string[],
  money?: InrMoney,
): LedgerFact {
  const fact: LedgerFact = {
    id: ledgerFactId(source.ownerUid, source.recordType, source.recordId, source.sourceEpoch, effect, subrecordId),
    ownerUid: source.ownerUid,
    partyId,
    partyNameSnapshot,
    source: {
      recordType: source.recordType,
      recordId: source.recordId,
      sourceEpoch: source.sourceEpoch,
      revision: source.revision,
      subrecordId,
    },
    effect,
    effectiveDay: source.effectiveDay,
    acceptedAt: source.acceptedAt,
    ruleVersion: PARTY_LEDGER_RULE_VERSION,
    explanationKey,
    evidenceRefs,
  };
  if (money) fact.money = money;
  return fact;
}

function exclusionFact(
  source: LedgerSource,
  partyId: string | null,
  partyNameSnapshot: string | null,
  reason: string,
): LedgerFact {
  return makeFact(
    source,
    "activity",
    "rejected",
    "partyLedger.rules.unreadableAmount",
    partyId,
    partyNameSnapshot,
    [sourceKeyFor(source), "disposition:excluded", `reject:${reason}`],
  );
}

function activityFact(source: LedgerSource, partyId: string | null, partyNameSnapshot: string | null): LedgerFact {
  const rule = coverageFor(source.recordType);
  return makeFact(
    source,
    "activity",
    "record",
    rule.explanationKey,
    partyId,
    partyNameSnapshot,
    [sourceKeyFor(source), `disposition:${rule.disposition}`],
  );
}

function partyNameFor(recordType: string, payload: Record<string, unknown>): string | null {
  if (recordType === "business_cash_given") return snapshotName(payload.givenToName);
  if (recordType === "material_received") return snapshotName(payload.supplierName);
  if (recordType === "staff_matter") return snapshotName(payload.staffName);
  return snapshotName(payload.partyName) ?? snapshotName(payload.customerName) ?? snapshotName(payload.givenToName);
}

function mapCashPaid(source: LedgerSource): LedgerFact[] {
  const payload = asRecord(source.payload);
  const partyId = partyIdOf(source, payload);
  const partyNameSnapshot = snapshotName(payload.givenToName);
  const rule = coverageFor("business_cash_given");
  const parsed = parseInrDecimal(payload.amount);
  if (!parsed.ok) {
    return [exclusionFact(source, partyId, partyNameSnapshot, parsed.reason)];
  }
  return [
    makeFact(
      source,
      "cash_paid",
      "amount",
      rule.explanationKey,
      partyId,
      partyNameSnapshot,
      [sourceKeyFor(source)],
      parsed.money,
    ),
  ];
}

function mapFreight(source: LedgerSource): LedgerFact[] {
  const payload = asRecord(source.payload);
  const partyId = partyIdOf(source, payload);
  const partyNameSnapshot = snapshotName(payload.partyName);
  const rule = coverageFor("outward_freight_details");
  if (payload.freightType !== "paid") {
    return [
      makeFact(source, "activity", "freight", rule.explanationKey, partyId, partyNameSnapshot, [
        sourceKeyFor(source),
        "disposition:activity",
        "freight:not_paid_cash",
      ]),
    ];
  }
  const parsed = parseInrDecimal(payload.freightAmount);
  if (!parsed.ok) {
    return [exclusionFact(source, partyId, partyNameSnapshot, parsed.reason)];
  }
  return [
    makeFact(
      source,
      "cash_paid",
      "freight",
      rule.explanationKey,
      partyId,
      partyNameSnapshot,
      [sourceKeyFor(source)],
      parsed.money,
    ),
  ];
}

function utcDay(ms: number): string {
  if (!Number.isFinite(ms)) return "unknown";
  const date = new Date(ms);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function summaryRupees(amount: number) {
  if (!Number.isFinite(amount) || amount < 0) return parseInrDecimal(null);
  // computeCreditSummary already rounded to paise. This only renders that figure.
  return parseInrDecimal(amount.toFixed(2));
}

function creditCleared(record: CustomerCreditRecord): boolean {
  if (typeof record.deletedAt === "number") return true;
  return record.status === "cancelled" || record.status === "written_off" || record.status === "external_completed";
}

/**
 * Overlap rule for one customer-credit record:
 * `computeCreditSummary` is the only balance. `totalPayable` already nets the
 * down payment out of the sale (or uses the stored payable). `totalPaid` is
 * the payments already stored on the record, once. A closure payment is not
 * added again: if the app appended it into `payments`, the summary already
 * includes it; `closure.finalPaymentAmount` is never read here.
 * We emit receivable_increase for totalPayable and receivable_decrease for
 * totalPaid. We do not emit cash_received for the down payment.
 * Fixture: sale 2000, down payment 500, one payment 200.
 * Summary balance is 1300. It is not 2000+500+200.
 */
export function mapCredit(record: CustomerCreditRecord): LedgerFact[] {
  const extras = record as CustomerCreditRecord & CreditLedgerExtras;
  const recordType = extras.ledgerRecordType || "customer_credit";
  const epoch = extras.sourceEpoch || String(record.version ?? record.updatedAt ?? "0");
  const revision = extras.sourceRevision || String(record.version ?? "0");
  const effectiveDay = extras.effectiveDay || utcDay(record.saleDate);
  const acceptedAt =
    extras.acceptedAt ||
    (Number.isFinite(record.updatedAt) ? new Date(record.updatedAt).toISOString() : "1970-01-01T00:00:00.000Z");
  const source: LedgerSource = {
    ownerUid: record.userId,
    recordType,
    recordId: record.id,
    sourceEpoch: epoch,
    revision,
    effectiveDay,
    acceptedAt,
    partyId: stablePartyId(extras.partyId),
  };
  const partyNameSnapshot = snapshotName(record.customerName);
  const partyId = source.partyId ?? null;

  if (creditCleared(record)) return [];

  const chargeRule = coverageFor("customer_credit_charge");
  const paymentRule = coverageFor("customer_credit_payment");
  const notShopReceivable = record.mode === "external_finance" && record.shopFollowUpRequired !== true;
  const cashSale = record.mode === "cash";
  if (notShopReceivable || cashSale) {
    return [
      makeFact(source, "activity", "record", chargeRule.explanationKey, partyId, partyNameSnapshot, [
        sourceKeyFor(source),
        "disposition:activity",
        cashSale ? "down-payment-not-cash-received" : "not-shop-receivable",
      ]),
    ];
  }

  const summary = computeCreditSummary(record);
  const obligation = summaryRupees(summary.totalPayable);
  const paid = summaryRupees(summary.totalPaid);
  if (!obligation.ok) {
    return [exclusionFact(source, partyId, partyNameSnapshot, obligation.reason)];
  }
  if (!paid.ok) {
    return [exclusionFact(source, partyId, partyNameSnapshot, paid.reason)];
  }

  const facts: LedgerFact[] = [];
  if (BigInt(obligation.money.minor) !== 0n) {
    facts.push(
      makeFact(
        source,
        "receivable_increase",
        "charge",
        chargeRule.explanationKey,
        partyId,
        partyNameSnapshot,
        [sourceKeyFor(source), "summary:totalPayable", "down-payment-not-cash-received"],
        obligation.money,
      ),
    );
  }
  if (BigInt(paid.money.minor) !== 0n) {
    facts.push(
      makeFact(
        source,
        "receivable_decrease",
        "payments",
        paymentRule.explanationKey,
        partyId,
        partyNameSnapshot,
        [sourceKeyFor(source), "summary:totalPaid", "closure-not-a-second-collection"],
        paid.money,
      ),
    );
  }
  if (facts.length === 0) {
    return [
      makeFact(source, "activity", "record", chargeRule.explanationKey, partyId, partyNameSnapshot, [
        sourceKeyFor(source),
        "disposition:obligation",
        "summary:zero",
      ]),
    ];
  }
  return facts;
}

function mapCreditSource(source: LedgerSource): LedgerFact[] {
  if (!source.credit) {
    return [exclusionFact(source, partyIdOf(source, asRecord(source.payload)), null, "empty")];
  }
  const overlay = {
    ...source.credit,
    userId: source.ownerUid,
    id: source.recordId,
    sourceEpoch: source.sourceEpoch,
    sourceRevision: source.revision,
    effectiveDay: source.effectiveDay,
    acceptedAt: source.acceptedAt,
    partyId: partyIdOf(source, asRecord(source.payload)),
    ledgerRecordType: source.recordType,
  } as CustomerCreditRecord;
  return mapCredit(overlay);
}

/**
 * Desired contribution for one source revision.
 * Void and delete contribute no facts, so the desired money is zero.
 */
export function deriveContribution(source: LedgerSource): SourceContribution {
  requireIdentity(source);
  if (isVoidSource(source)) return shell(source, []);

  switch (source.recordType) {
    case "business_cash_given":
      return shell(source, mapCashPaid(source));
    case "outward_freight_details":
      return shell(source, mapFreight(source));
    case "customer_credit":
    case "customer_credit_charge":
    case "customer_credit_payment":
      // Payments inside the credit record are mapped once by mapCredit.
      // Do not also project each payment as its own cash or receivable source.
      return shell(source, mapCreditSource(source));
    default: {
      // Activity, drafts, unknown types, GRIN, purchase orders, and stated
      // professional amounts stay non-money. No payable is invented.
      const payload = asRecord(source.payload);
      return shell(source, [activityFact(source, partyIdOf(source, payload), partyNameFor(source.recordType, payload))]);
    }
  }
}

function withEffect(totals: PartyBucketTotals, effect: LedgerEffect, minor: string): PartyBucketTotals {
  const amount = inr(BigInt(minor));
  const cashPaid = inr(BigInt(totals.cashPaidMinor));
  const cashReceived = inr(BigInt(totals.cashReceivedMinor));
  const receivable = inr(BigInt(totals.receivableMinor));
  const payable = inr(BigInt(totals.payableMinor));
  switch (effect) {
    case "cash_paid":
      return { ...totals, cashPaidMinor: addInr(cashPaid, amount).minor };
    case "cash_received":
      return { ...totals, cashReceivedMinor: addInr(cashReceived, amount).minor };
    case "receivable_increase":
      return { ...totals, receivableMinor: addInr(receivable, amount).minor };
    case "receivable_decrease":
      return { ...totals, receivableMinor: subInr(receivable, amount).minor };
    case "payable_increase":
      return { ...totals, payableMinor: addInr(payable, amount).minor };
    case "payable_decrease":
      return { ...totals, payableMinor: subInr(payable, amount).minor };
    case "activity":
      return totals;
    default:
      return totals;
  }
}

/** Party/period totals implied by money facts. Unreadable facts have no money, so they add nothing. */
export function allocationsFor(facts: readonly LedgerFact[]): SourceAllocation[] {
  const grouped = new Map<string, SourceAllocation>();
  for (const fact of facts) {
    if (!fact.money || !/^-?\d+$/.test(fact.money.minor)) continue;
    if (fact.effect === "activity") continue;
    const partyId = fact.partyId ?? "";
    const key = `${fact.ownerUid}\u001f${partyId}\u001f${fact.effectiveDay}`;
    const existing = grouped.get(key) ?? {
      ownerUid: fact.ownerUid,
      partyId,
      period: fact.effectiveDay,
      totals: zeroBucketTotals(),
    };
    existing.totals = withEffect(existing.totals, fact.effect, fact.money.minor);
    grouped.set(key, existing);
  }
  return [...grouped.values()]
    .filter((row) => !bucketTotalsAreZero(row.totals))
    .sort((left, right) => {
      const keyLeft = `${left.ownerUid}\u001f${left.partyId}\u001f${left.period}`;
      const keyRight = `${right.ownerUid}\u001f${right.partyId}\u001f${right.period}`;
      return keyLeft < keyRight ? -1 : keyLeft > keyRight ? 1 : 0;
    });
}
