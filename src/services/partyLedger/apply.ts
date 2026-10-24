/**
 * Apply a desired contribution onto pure ledger state.
 * Matching epoch + revision + projector version + contribution hash is a replay (delta zero).
 * A repeated command id with a different payload hash conflicts and does not post a second event.
 * An older epoch cannot replace a newer one.
 */

import type { AppliedSourceProjection, PartyBucketTotals, SourceContribution } from "@/services/partyLedger/contracts";
import {
  addBucketTotals,
  bucketTotalsAreZero,
  bucketTotalsKey,
  subBucketTotals,
  zeroBucketTotals,
} from "@/services/partyLedger/buckets";
import { canonicalJson } from "@/services/partyLedger/canonical";
import {
  allocationsFor,
  compareSourcePosition,
  type SourceAllocation,
} from "@/services/partyLedger/project";
import { sha256 } from "@/services/partyLedger/sha256";

export interface DesiredProjection {
  commandId: string;
  ownerUid: string;
  contribution: SourceContribution;
}

export interface StoredProjection extends AppliedSourceProjection {
  allocations: SourceAllocation[];
  commandId: string;
}

export interface LedgerApplyState {
  projections: Record<string, StoredProjection>;
  buckets: Record<string, PartyBucketTotals>;
  /** owner + command id → payload hash. The payload hash is the contribution hash. */
  commands: Record<string, string>;
}

export interface BucketDelta {
  ownerUid: string;
  partyId: string;
  period: string;
  cashPaidMinor: string;
  cashReceivedMinor: string;
  receivableMinor: string;
  payableMinor: string;
}

export type ApplyResult =
  | {
      kind: "applied" | "replay";
      state: LedgerApplyState;
      projection: AppliedSourceProjection;
      deltas: BucketDelta[];
      contributionHash: string;
    }
  | {
      kind: "conflict";
      state: LedgerApplyState;
      deltas: [];
      commandId: string;
      contributionHash: string;
    }
  | {
      kind: "stale";
      state: LedgerApplyState;
      deltas: [];
      sourceKey: string;
      contributionHash: string;
    };

export function emptyLedgerState(): LedgerApplyState {
  return { projections: {}, buckets: {}, commands: {} };
}

/** SHA-256 hex of the canonical contribution. This is also the command payload hash. */
export function contributionHashOf(contribution: SourceContribution): string {
  const facts = [...contribution.facts].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  return sha256(
    canonicalJson({
      facts,
      projectorVersion: contribution.projectorVersion,
      sourceEpoch: contribution.sourceEpoch,
      sourceKey: contribution.sourceKey,
      sourceRevision: contribution.sourceRevision,
    }),
  );
}

export function readBucket(
  state: LedgerApplyState,
  ownerUid: string,
  partyId: string,
  period: string,
): PartyBucketTotals {
  return state.buckets[bucketTotalsKey(ownerUid, partyId, period)] ?? zeroBucketTotals();
}

export function sumBucketsForOwner(state: LedgerApplyState, ownerUid: string): PartyBucketTotals {
  const prefix = `${ownerUid}\u001f`;
  let total = zeroBucketTotals();
  for (const [key, totals] of Object.entries(state.buckets)) {
    if (!key.startsWith(prefix)) continue;
    total = addBucketTotals(total, totals);
  }
  return total;
}

function commandKey(ownerUid: string, commandId: string): string {
  return `${ownerUid}\u001f${commandId}`;
}

function published(stored: StoredProjection): AppliedSourceProjection {
  return {
    ownerUid: stored.ownerUid,
    sourceKey: stored.sourceKey,
    sourceEpoch: stored.sourceEpoch,
    sourceRevision: stored.sourceRevision,
    projectorVersion: stored.projectorVersion,
    contributionHash: stored.contributionHash,
    totals: stored.totals,
    partyIds: stored.partyIds,
  };
}

function sumAllocations(allocations: readonly SourceAllocation[]): PartyBucketTotals {
  let total = zeroBucketTotals();
  for (const row of allocations) total = addBucketTotals(total, row.totals);
  return total;
}

function partyIdsOf(allocations: readonly SourceAllocation[]): string[] {
  return [...new Set(allocations.map((row) => row.partyId).filter((partyId) => partyId !== ""))].sort();
}

function allocationKey(row: SourceAllocation): string {
  return bucketTotalsKey(row.ownerUid, row.partyId, row.period);
}

function conflict(state: LedgerApplyState, commandId: string, contributionHash: string): ApplyResult {
  return { kind: "conflict", state, deltas: [], commandId, contributionHash };
}

export function applyProjection(state: LedgerApplyState, desired: DesiredProjection): ApplyResult {
  const { ownerUid, contribution } = desired;
  const contributionHash = contributionHashOf(contribution);
  if (!desired.commandId || !ownerUid || !contribution.sourceKey.startsWith(`${ownerUid}:`)) {
    return conflict(state, desired.commandId, contributionHash);
  }
  if (contribution.facts.some((fact) => fact.ownerUid !== ownerUid)) {
    return conflict(state, desired.commandId, contributionHash);
  }

  const knownHash = state.commands[commandKey(ownerUid, desired.commandId)];
  if (knownHash !== undefined && knownHash !== contributionHash) {
    return conflict(state, desired.commandId, contributionHash);
  }

  const prior = state.projections[contribution.sourceKey];
  if (prior && prior.ownerUid !== ownerUid) {
    return conflict(state, desired.commandId, contributionHash);
  }

  if (knownHash === contributionHash) {
    return {
      kind: "replay",
      state,
      projection: prior ? published(prior) : published(storeFrom(desired, contributionHash, [])),
      deltas: [],
      contributionHash,
    };
  }

  const sameIdentity =
    prior !== undefined &&
    prior.sourceEpoch === contribution.sourceEpoch &&
    prior.sourceRevision === contribution.sourceRevision &&
    prior.projectorVersion === contribution.projectorVersion &&
    prior.contributionHash === contributionHash;

  if (sameIdentity && prior) {
    const replayState =
      knownHash === contributionHash
        ? state
        : { ...state, commands: { ...state.commands, [commandKey(ownerUid, desired.commandId)]: contributionHash } };
    return {
      kind: "replay",
      state: replayState,
      projection: published(prior),
      deltas: [],
      contributionHash,
    };
  }

  if (
    prior &&
    compareSourcePosition(
      { epoch: contribution.sourceEpoch, revision: contribution.sourceRevision },
      { epoch: prior.sourceEpoch, revision: prior.sourceRevision },
    ) < 0
  ) {
    return { kind: "stale", state, deltas: [], sourceKey: contribution.sourceKey, contributionHash };
  }

  if (
    prior &&
    prior.sourceEpoch === contribution.sourceEpoch &&
    prior.sourceRevision === contribution.sourceRevision &&
    prior.projectorVersion === contribution.projectorVersion &&
    prior.contributionHash !== contributionHash
  ) {
    return conflict(state, desired.commandId, contributionHash);
  }

  const allocations = allocationsFor(contribution.facts).filter((row) => row.ownerUid === ownerUid);
  const buckets = { ...state.buckets };
  const deltas: BucketDelta[] = [];
  const keys = new Set<string>([
    ...(prior?.allocations ?? []).map(allocationKey),
    ...allocations.map(allocationKey),
  ]);

  for (const key of [...keys].sort()) {
    const before = prior?.allocations.find((row) => allocationKey(row) === key)?.totals ?? zeroBucketTotals();
    const after = allocations.find((row) => allocationKey(row) === key)?.totals ?? zeroBucketTotals();
    const delta = subBucketTotals(after, before);
    if (bucketTotalsAreZero(delta)) continue;
    const [deltaOwner, partyId, period] = key.split("\u001f");
    const updated = addBucketTotals(buckets[key] ?? zeroBucketTotals(), delta);
    if (bucketTotalsAreZero(updated)) delete buckets[key];
    else buckets[key] = updated;
    deltas.push({
      ownerUid: deltaOwner ?? ownerUid,
      partyId: partyId ?? "",
      period: period ?? "",
      cashPaidMinor: delta.cashPaidMinor,
      cashReceivedMinor: delta.cashReceivedMinor,
      receivableMinor: delta.receivableMinor,
      payableMinor: delta.payableMinor,
    });
  }

  const stored = storeFrom(desired, contributionHash, allocations);
  return {
    kind: "applied",
    state: {
      projections: { ...state.projections, [contribution.sourceKey]: stored },
      buckets,
      commands: { ...state.commands, [commandKey(ownerUid, desired.commandId)]: contributionHash },
    },
    projection: published(stored),
    deltas,
    contributionHash,
  };
}

function storeFrom(
  desired: DesiredProjection,
  contributionHash: string,
  allocations: SourceAllocation[],
): StoredProjection {
  return {
    ownerUid: desired.ownerUid,
    sourceKey: desired.contribution.sourceKey,
    sourceEpoch: desired.contribution.sourceEpoch,
    sourceRevision: desired.contribution.sourceRevision,
    projectorVersion: desired.contribution.projectorVersion,
    contributionHash,
    totals: sumAllocations(allocations),
    partyIds: partyIdsOf(allocations),
    allocations,
    commandId: desired.commandId,
  };
}
