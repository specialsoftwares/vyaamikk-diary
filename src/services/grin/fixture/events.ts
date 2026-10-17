import { GOODS_EVIDENCE_SCHEMA_VERSION } from "@/goodsEvidence/constants";
import { hashEventEnvelope, hashOriginalSnapshot } from "@/goodsEvidence/hashChain";
import { cloneSnapshot } from "@/goodsEvidence/snapshot";
import type { GrinEvent, GrinEventType, ImmutableGrin } from "@/goodsEvidence/types";

export function sealOriginal(draft: Omit<ImmutableGrin, "originalSnapshotHash"> & { originalSnapshotHash?: string | null }): ImmutableGrin {
  const withNullHash: ImmutableGrin = { ...draft, originalSnapshotHash: null };
  const originalSnapshotHash = hashOriginalSnapshot(withNullHash);
  return { ...withNullHash, originalSnapshotHash };
}

export function makeFixtureEvent(input: {
  eventId: string;
  receiptId: string;
  streamSequence: number;
  type: GrinEventType;
  actorUid: string;
  serverAcceptedAtUtc: string;
  clientObservedAtUtc: string;
  reason: string;
  expectedPreviousVersion: number;
  typedChanges: Record<string, unknown>;
  previousHash: string | null;
}): GrinEvent {
  const envelope = {
    eventId: input.eventId,
    receiptId: input.receiptId,
    streamSequence: input.streamSequence,
    type: input.type,
    actorUid: input.actorUid,
    serverAcceptedAtUtc: input.serverAcceptedAtUtc,
    clientObservedAtUtc: input.clientObservedAtUtc,
    reason: input.reason,
    expectedPreviousVersion: input.expectedPreviousVersion,
    typedChanges: cloneSnapshot(input.typedChanges),
    previousHash: input.previousHash,
  };
  return {
    schemaVersion: GOODS_EVIDENCE_SCHEMA_VERSION,
    ...envelope,
    eventHash: hashEventEnvelope(envelope),
    firestoreCommitTime: null,
  };
}

export function appendFixtureEvent(
  events: GrinEvent[],
  input: Omit<Parameters<typeof makeFixtureEvent>[0], "streamSequence" | "expectedPreviousVersion" | "previousHash">
): GrinEvent {
  const previous = events[events.length - 1] ?? null;
  const event = makeFixtureEvent({
    ...input,
    streamSequence: events.length + 1,
    expectedPreviousVersion: events.length,
    previousHash: previous?.eventHash ?? null,
  });
  events.push(event);
  return event;
}
