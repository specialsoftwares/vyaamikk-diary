/**
 * Device-local party ledger from saved records.
 * Pure: coverageFor + parseInrDecimal. No repositories and no Insights totals.
 * A later projector can replace this call if it returns the same shape.
 */

import { coverageFor } from "@/services/partyLedger/coverage";
import { PARTY_LEDGER_SERVER_PROJECTION_ENABLED } from "@/services/partyLedger/contracts";
import {
  minorOf,
  parseInrDecimal,
  sumInr,
  type InrMoney,
} from "@/services/partyLedger/money";
import { sha256Hex } from "@/utils/sha256Hex";

export const PARTY_LEDGER_UNASSIGNED_ID = "unassigned";

export type LedgerSourceFamily =
  | "diary"
  | "purchase_order"
  | "customer_credit"
  | "letterhead_document"
  | "professional_pack"
  | "goods_receipt"
  | "draft";

export type LocalLedgerLineKind = "cash_paid" | "activity" | "obligation" | "exclusion";

export type LocalLedgerExclusionReason = "unreadable_amount" | "not_positive";

export interface LocalLedgerRecord {
  id: string;
  ownerUid: string;
  recordType: string;
  /** Original party name. The key is normalized; this snapshot stays for display. */
  partyName?: string | null;
  /** Explicit assignment. When set, the row is not folded into a name-only party. */
  partyId?: string | null;
  amount?: unknown;
  freightType?: string | null;
  occurredAtMs?: number | null;
  deleted?: boolean;
  voided?: boolean;
  draft?: boolean;
  sourceFamily?: LedgerSourceFamily | null;
  /** Record opened by View source. Defaults to id. */
  sourceRecordId?: string | null;
}

export interface LedgerSourceLink {
  pathname: string;
  params: Record<string, string>;
}

export interface LocalLedgerLine {
  id: string;
  partyId: string;
  recordType: string;
  kind: LocalLedgerLineKind;
  explanationKey: string;
  displayName: string;
  provisional: boolean;
  unassigned: boolean;
  occurredAtMs: number | null;
  moneyMinor: string | null;
  exclusionReason: LocalLedgerExclusionReason | null;
  source: LedgerSourceLink;
}

export interface LocalPartySummary {
  partyId: string;
  displayName: string;
  provisional: boolean;
  unassigned: boolean;
  /** Null when cash was left out instead of being counted as zero. */
  cashPaidMinor: string | null;
  lines: LocalLedgerLine[];
}

export interface LocalPartyLedger {
  parties: LocalPartySummary[];
  serverProjectionEnabled: boolean;
}

interface PartyAssignment {
  partyId: string;
  provisional: boolean;
  unassigned: boolean;
  displayName: string;
}

interface Bucket {
  partyId: string;
  provisional: boolean;
  unassigned: boolean;
  displayName: string;
  lines: LocalLedgerLine[];
  cash: InrMoney[];
  exclusionCount: number;
}

/** NFKC and trim. Case and inner spacing stay so the screen keeps the saved name. */
export function partyDisplaySnapshot(name: string | null | undefined): string {
  if (typeof name !== "string") return "";
  return name.normalize("NFKC").trim();
}

/** NFKC, trim, collapse whitespace, then en-US casefold. Used only for the provisional key. */
export function normalizePartyNameKey(name: string | null | undefined): string {
  const snapshot = partyDisplaySnapshot(name);
  if (!snapshot) return "";
  return snapshot.replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

/** Provisional id until an explicit party assignment exists. Stable for owner + name key. */
export function provisionalPartyId(ownerUid: string, partyName: string | null | undefined): string | null {
  const key = normalizePartyNameKey(partyName);
  if (!key) return null;
  const owner = typeof ownerUid === "string" ? ownerUid.trim() : "";
  return `prov_${sha256Hex(`${owner}\u0000${key}`)}`;
}

export function ledgerSourceLink(record: {
  id: string;
  recordType: string;
  sourceFamily?: LedgerSourceFamily | null;
  sourceRecordId?: string | null;
}): LedgerSourceLink {
  const id = (record.sourceRecordId || record.id).trim();
  const family = record.sourceFamily ?? inferFamily(record.recordType);
  switch (family) {
    case "purchase_order":
      return { pathname: "/(app)/purchase-order/form", params: { id } };
    case "customer_credit":
      return { pathname: "/(app)/customer-credit/[id]", params: { id } };
    case "letterhead_document":
      return { pathname: "/(app)/letterhead/create", params: { documentId: id } };
    case "professional_pack":
      return { pathname: "/(app)/professional-pack/[id]", params: { id } };
    case "goods_receipt":
      return { pathname: "/(app)/grin/[receiptId]", params: { receiptId: id } };
    case "draft":
      return { pathname: "/(app)/drafts", params: {} };
    default:
      return { pathname: "/(app)/diary/[id]", params: { id } };
  }
}

export function exploreLocalPartyLedger(records: readonly LocalLedgerRecord[]): LocalPartyLedger {
  const buckets = new Map<string, Bucket>();
  const seen = new Set<string>();

  for (const record of records) {
    const id = typeof record.id === "string" ? record.id.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (isDropped(record)) continue;

    const rule = coverageFor(record.recordType.trim());
    const assignment = assignParty(record);
    const bucket = bucketFor(buckets, assignment);
    const occurredAtMs = occurredAt(record);
    const source = ledgerSourceLink(record);
    const base = {
      id,
      partyId: bucket.partyId,
      recordType: record.recordType.trim(),
      explanationKey: rule.explanationKey,
      displayName: assignment.displayName,
      provisional: bucket.provisional,
      unassigned: bucket.unassigned,
      occurredAtMs,
      source,
    };

    if (rule.disposition === "cash" && !freightCountsAsCash(record)) {
      const shown = positiveMoney(record.amount);
      bucket.lines.push({
        ...base,
        kind: "activity",
        moneyMinor: shown.ok ? shown.money.minor : null,
        exclusionReason: null,
      });
      continue;
    }

    if (rule.disposition === "cash") {
      const parsed = positiveMoney(record.amount);
      if (!parsed.ok) {
        bucket.exclusionCount += 1;
        bucket.lines.push({
          ...base,
          kind: "exclusion",
          moneyMinor: null,
          exclusionReason: parsed.reason,
        });
        continue;
      }
      bucket.cash.push(parsed.money);
      bucket.lines.push({
        ...base,
        kind: "cash_paid",
        moneyMinor: parsed.money.minor,
        exclusionReason: null,
      });
      continue;
    }

    if (rule.disposition === "activity" || rule.disposition === "obligation") {
      const shown = record.amount == null || record.amount === "" ? null : positiveMoney(record.amount);
      bucket.lines.push({
        ...base,
        kind: rule.disposition === "obligation" ? "obligation" : "activity",
        moneyMinor: shown && shown.ok ? shown.money.minor : null,
        exclusionReason: null,
      });
    }
  }

  const parties = [...buckets.values()].map((bucket) => {
    bucket.lines.sort(compareLines);
    return {
      partyId: bucket.partyId,
      displayName: bucket.displayName,
      provisional: bucket.provisional,
      unassigned: bucket.unassigned,
      cashPaidMinor: cashPaidMinor(bucket),
      lines: bucket.lines,
    };
  });
  parties.sort(compareParties);

  return {
    parties,
    serverProjectionEnabled: PARTY_LEDGER_SERVER_PROJECTION_ENABLED,
  };
}

function inferFamily(recordType: string): LedgerSourceFamily {
  switch (recordType) {
    case "purchase_order":
      return "purchase_order";
    case "customer_credit_charge":
    case "customer_credit_payment":
      return "customer_credit";
    case "letterhead_document":
      return "letterhead_document";
    case "professional_pack":
      return "professional_pack";
    case "goods_receipt":
      return "goods_receipt";
    case "draft":
      return "draft";
    default:
      return "diary";
  }
}

function isDropped(record: LocalLedgerRecord): boolean {
  if (record.draft || record.deleted || record.voided) return true;
  const recordType = record.recordType.trim();
  if (!recordType || recordType === "draft" || recordType === "voided") return true;
  return coverageFor(recordType).disposition === "excluded";
}

function freightCountsAsCash(record: LocalLedgerRecord): boolean {
  if (record.recordType.trim() !== "outward_freight_details") return true;
  return typeof record.freightType === "string" && record.freightType.trim().toLowerCase() === "paid";
}

function positiveMoney(
  amount: unknown
): { ok: true; money: InrMoney } | { ok: false; reason: LocalLedgerExclusionReason } {
  const parsed = parseInrDecimal(amount);
  if (!parsed.ok) return { ok: false, reason: "unreadable_amount" };
  if (minorOf(parsed.money) <= 0n) return { ok: false, reason: "not_positive" };
  return { ok: true, money: parsed.money };
}

function assignParty(record: LocalLedgerRecord): PartyAssignment {
  const explicit = typeof record.partyId === "string" ? record.partyId.trim() : "";
  const displayName = partyDisplaySnapshot(record.partyName);
  if (explicit) {
    return { partyId: explicit, provisional: false, unassigned: false, displayName };
  }
  const provisional = provisionalPartyId(record.ownerUid ?? "", displayName);
  if (!provisional) {
    return {
      partyId: PARTY_LEDGER_UNASSIGNED_ID,
      provisional: false,
      unassigned: true,
      displayName: "",
    };
  }
  return { partyId: provisional, provisional: true, unassigned: false, displayName };
}

function bucketFor(buckets: Map<string, Bucket>, assignment: PartyAssignment): Bucket {
  const mapKey = assignment.unassigned
    ? "unassigned"
    : assignment.provisional
      ? `provisional:${assignment.partyId}`
      : `assigned:${assignment.partyId}`;
  const existing = buckets.get(mapKey);
  if (existing) {
    if (!existing.displayName && assignment.displayName) existing.displayName = assignment.displayName;
    return existing;
  }
  const created: Bucket = {
    partyId: assignment.partyId,
    provisional: assignment.provisional,
    unassigned: assignment.unassigned,
    displayName: assignment.displayName,
    lines: [],
    cash: [],
    exclusionCount: 0,
  };
  buckets.set(mapKey, created);
  return created;
}

function occurredAt(record: LocalLedgerRecord): number | null {
  const value = record.occurredAtMs;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function cashPaidMinor(bucket: Bucket): string | null {
  if (bucket.cash.length > 0) return sumInr(bucket.cash).minor;
  if (bucket.exclusionCount > 0) return null;
  return "0";
}

function compareLines(left: LocalLedgerLine, right: LocalLedgerLine): number {
  const leftAt = left.occurredAtMs ?? -1;
  const rightAt = right.occurredAtMs ?? -1;
  if (rightAt !== leftAt) return rightAt - leftAt;
  return left.id.localeCompare(right.id);
}

function compareParties(left: LocalPartySummary, right: LocalPartySummary): number {
  const rank = (party: LocalPartySummary) => (party.unassigned ? 0 : party.provisional ? 1 : 2);
  const byRank = rank(left) - rank(right);
  if (byRank !== 0) return byRank;
  const byName = left.displayName.localeCompare(right.displayName, "en");
  if (byName !== 0) return byName;
  return left.partyId.localeCompare(right.partyId);
}
