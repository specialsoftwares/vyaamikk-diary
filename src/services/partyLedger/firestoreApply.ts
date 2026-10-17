/**
 * Transactional projection of one accepted source.
 * Reads the applied projection, the command, and every bucket this source
 * touches before it writes. The production flag stays off; this function
 * runs only when a caller opens a transaction.
 */

import type { PartyBucketTotals } from "@/services/partyLedger/contracts";
import {
  applyProjection,
  emptyLedgerState,
  type ApplyResult,
  type StoredProjection,
} from "@/services/partyLedger/apply";
import { allocationsFor, deriveContribution, type LedgerSource } from "@/services/partyLedger/project";
import { sha256 } from "@/services/partyLedger/sha256";

export interface LedgerDocStore {
  get(path: string): Promise<Record<string, unknown> | null>;
  set(path: string, data: Record<string, unknown>): void;
  delete(path: string): void;
}

export function partyLedgerProjectionPath(ownerUid: string, sourceKey: string): string {
  return `users/${ownerUid}/partyLedgerProjections/${sha256(sourceKey)}`;
}

export function partyLedgerBucketPath(ownerUid: string, bucketKey: string): string {
  return `users/${ownerUid}/partyLedgerBuckets/${sha256(bucketKey)}`;
}

export function partyLedgerCheckpointPath(ownerUid: string): string {
  return `users/${ownerUid}/partyLedgerCheckpoints/resume`;
}

function asStored(raw: Record<string, unknown> | null): StoredProjection | null {
  if (!raw || typeof raw.sourceKey !== "string" || typeof raw.contributionHash !== "string") return null;
  return raw as unknown as StoredProjection;
}

function bucketKeyOf(row: { ownerUid: string; partyId: string; period: string }): string {
  return `${row.ownerUid}\u001f${row.partyId}\u001f${row.period}`;
}

export async function applyAcceptedSource(
  store: LedgerDocStore,
  source: LedgerSource,
  commandId: string
): Promise<ApplyResult> {
  if (!source.ownerUid || source.ownerUid.includes("/")) throw new Error("party_ledger_owner");
  const contribution = deriveContribution(source);
  const projectionPath = partyLedgerProjectionPath(source.ownerUid, contribution.sourceKey);
  const commandPath = `users/${source.ownerUid}/partyLedgerCommands/${sha256(commandId)}`;
  const prior = asStored(await store.get(projectionPath));
  const commandRaw = await store.get(commandPath);
  const nextAllocations = allocationsFor(contribution.facts);
  const keys = [
    ...new Set([
      ...(prior?.allocations ?? []).map(bucketKeyOf),
      ...nextAllocations.map(bucketKeyOf),
    ]),
  ].sort();
  const loadedBuckets = new Map<string, PartyBucketTotals>();
  for (const key of keys) {
    const raw = await store.get(partyLedgerBucketPath(source.ownerUid, key));
    const totals = raw?.totals;
    if (totals && typeof totals === "object") loadedBuckets.set(key, totals as PartyBucketTotals);
  }

  const state = emptyLedgerState();
  if (prior) state.projections[contribution.sourceKey] = prior;
  for (const [key, totals] of loadedBuckets) state.buckets[key] = totals;
  if (typeof commandRaw?.hash === "string") {
    state.commands[`${source.ownerUid}\u001f${commandId}`] = commandRaw.hash;
  }

  const result = applyProjection(state, {
    commandId,
    ownerUid: source.ownerUid,
    contribution,
  });
  if (result.kind !== "applied") return result;

  const stored = result.state.projections[contribution.sourceKey];
  if (!stored) return result;
  store.set(projectionPath, { ...stored });
  for (const key of keys) {
    const totals = result.state.buckets[key];
    const path = partyLedgerBucketPath(source.ownerUid, key);
    if (!totals) store.delete(path);
    else store.set(path, { bucketKey: key, ownerUid: source.ownerUid, totals });
  }
  store.set(commandPath, {
    ownerUid: source.ownerUid,
    commandId,
    hash: result.contributionHash,
  });
  store.set(partyLedgerCheckpointPath(source.ownerUid), {
    ownerUid: source.ownerUid,
    cursor: contribution.sourceKey,
    commandId,
    sourceEpoch: source.sourceEpoch,
    sourceRevision: source.revision,
    projectorVersion: contribution.projectorVersion,
  });
  return result;
}
