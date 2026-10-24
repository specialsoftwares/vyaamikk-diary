/**
 * Pure reconciliation cursor. Do not point this at production Firestore.
 * A crash mid-batch leaves the previous generation visible. The next generation
 * is exposed only when the hash of the included source keys matches the plan.
 */

import type { PartyBucketTotals } from "@/services/partyLedger/contracts";
import { addBucketTotals, bucketTotalsKey, sameBucketTotals, zeroBucketTotals } from "@/services/partyLedger/buckets";
import { canonicalJson } from "@/services/partyLedger/canonical";
import type { LedgerApplyState } from "@/services/partyLedger/apply";
import {
  allocationsFor,
  compareSourcePosition,
  deriveContribution,
  sourceKeyFor,
  type LedgerSource,
  type SourceAllocation,
} from "@/services/partyLedger/project";
import { sha256 } from "@/services/partyLedger/sha256";

export interface ReconcileCursor {
  visibleGeneration: number;
  visibleSourceKeyHash: string | null;
  visibleTotals: Record<string, PartyBucketTotals>;
  pending: null | {
    generation: number;
    plannedSourceKeyHash: string;
    includedSourceKeys: string[];
    allocationsBySource: Record<string, SourceAllocation[]>;
  };
}

export function emptyCursor(): ReconcileCursor {
  return {
    visibleGeneration: 0,
    visibleSourceKeyHash: null,
    visibleTotals: {},
    pending: null,
  };
}

/** Hash of the unique source keys, order-independent. */
export function sourceKeysHash(keys: readonly string[]): string {
  return sha256(canonicalJson([...new Set(keys)].sort()));
}

export function visibleTotalsOf(cursor: ReconcileCursor): Record<string, PartyBucketTotals> {
  return cursor.visibleTotals;
}

export function openGeneration(cursor: ReconcileCursor, plannedSourceKeys: readonly string[]): ReconcileCursor {
  if (cursor.pending) throw new Error("party_ledger_reconcile_already_open");
  return {
    ...cursor,
    pending: {
      generation: cursor.visibleGeneration + 1,
      plannedSourceKeyHash: sourceKeysHash(plannedSourceKeys),
      includedSourceKeys: [],
      allocationsBySource: {},
    },
  };
}

/** Fold one accepted source into the pending generation. Visible totals stay put. */
export function includeAcceptedSource(cursor: ReconcileCursor, source: LedgerSource): ReconcileCursor {
  if (!cursor.pending) throw new Error("party_ledger_reconcile_closed");
  const key = sourceKeyFor(source);
  const included = cursor.pending.includedSourceKeys.includes(key)
    ? cursor.pending.includedSourceKeys
    : [...cursor.pending.includedSourceKeys, key];
  return {
    ...cursor,
    pending: {
      ...cursor.pending,
      includedSourceKeys: included,
      allocationsBySource: {
        ...cursor.pending.allocationsBySource,
        [key]: allocationsFor(deriveContribution(source).facts),
      },
    },
  };
}

/** Drop a partial batch. The previous generation remains the visible one. */
export function abandonGeneration(cursor: ReconcileCursor): ReconcileCursor {
  if (!cursor.pending) return cursor;
  return { ...cursor, pending: null };
}

function imageFrom(allocationsBySource: Record<string, SourceAllocation[]>): Record<string, PartyBucketTotals> {
  const totals: Record<string, PartyBucketTotals> = {};
  for (const rows of Object.values(allocationsBySource)) {
    for (const row of rows) {
      const key = bucketTotalsKey(row.ownerUid, row.partyId, row.period);
      totals[key] = addBucketTotals(totals[key] ?? zeroBucketTotals(), row.totals);
    }
  }
  return totals;
}

/**
 * Publish the pending generation only when every included key matches the plan.
 * A short batch returns sealed: false and leaves the previous generation visible.
 */
export function sealGeneration(cursor: ReconcileCursor): { cursor: ReconcileCursor; sealed: boolean } {
  if (!cursor.pending) return { cursor, sealed: false };
  const actual = sourceKeysHash(cursor.pending.includedSourceKeys);
  if (actual !== cursor.pending.plannedSourceKeyHash) return { cursor, sealed: false };
  return {
    sealed: true,
    cursor: {
      visibleGeneration: cursor.pending.generation,
      visibleSourceKeyHash: actual,
      visibleTotals: imageFrom(cursor.pending.allocationsBySource),
      pending: null,
    },
  };
}

/**
 * Expected bucket image from accepted sources.
 * When several revisions of one source key are present, the newest epoch/revision wins.
 */
export function expectedFromSources(sources: readonly LedgerSource[]): Record<string, PartyBucketTotals> {
  const best = new Map<string, LedgerSource>();
  for (const source of sources) {
    const key = sourceKeyFor(source);
    const existing = best.get(key);
    if (
      !existing ||
      compareSourcePosition(
        { epoch: source.sourceEpoch, revision: source.revision },
        { epoch: existing.sourceEpoch, revision: existing.revision },
      ) > 0
    ) {
      best.set(key, source);
    }
  }
  const allocationsBySource: Record<string, SourceAllocation[]> = {};
  for (const [key, source] of best) {
    allocationsBySource[key] = allocationsFor(deriveContribution(source).facts);
  }
  return imageFrom(allocationsBySource);
}

export function compareBucketTotals(
  expected: Record<string, PartyBucketTotals>,
  actual: Record<string, PartyBucketTotals>,
): { match: boolean; mismatches: string[] } {
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  const mismatches: string[] = [];
  for (const key of [...keys].sort()) {
    const left = expected[key] ?? zeroBucketTotals();
    const right = actual[key] ?? zeroBucketTotals();
    if (!sameBucketTotals(left, right)) mismatches.push(key);
  }
  return { match: mismatches.length === 0, mismatches };
}

export function reconcileApplied(
  sources: readonly LedgerSource[],
  state: LedgerApplyState,
): { match: boolean; mismatches: string[] } {
  return compareBucketTotals(expectedFromSources(sources), state.buckets);
}
