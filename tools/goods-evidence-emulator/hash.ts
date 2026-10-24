import { createHash } from "node:crypto";

import { canonicalJson } from "../../src/goodsEvidence/canonical";
import type { GrinEvent, ImmutableGrin } from "../../src/goodsEvidence/types";

/** Node SHA-256 of versioned canonical JSON. Not @/utils/sha256Hex. */
export function hashCanonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export function hashOriginalSnapshot(grin: ImmutableGrin): string {
  const { originalSnapshotHash: _ignored, ...rest } = grin;
  return hashCanonical(rest);
}

export function hashEventEnvelope(input: {
  eventId: string;
  receiptId: string;
  streamSequence: number;
  type: GrinEvent["type"];
  actorUid: string;
  serverAcceptedAtUtc: string;
  clientObservedAtUtc: string;
  reason: string;
  expectedPreviousVersion: number;
  typedChanges: Record<string, unknown>;
  previousHash: string | null;
}): string {
  return hashCanonical({
    actorUid: input.actorUid,
    clientObservedAtUtc: input.clientObservedAtUtc,
    eventId: input.eventId,
    expectedPreviousVersion: input.expectedPreviousVersion,
    previousHash: input.previousHash,
    reason: input.reason,
    receiptId: input.receiptId,
    serverAcceptedAtUtc: input.serverAcceptedAtUtc,
    streamSequence: input.streamSequence,
    type: input.type,
    typedChanges: input.typedChanges,
  });
}

export function freezeDigest(input: {
  commandId: string;
  type: string;
  ownerUid: string;
  ledgerId: string;
  body: unknown;
}): string {
  return hashCanonical({
    body: input.body,
    commandId: input.commandId,
    ledgerId: input.ledgerId,
    ownerUid: input.ownerUid,
    type: input.type,
  });
}
