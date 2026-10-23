/**
 * Atomic expected-revision commit. Encryption stays outside the transaction.
 * A retry must re-read and reseal; it must not write a payload prepared earlier.
 */

import { runTransaction, type DocumentReference, type Firestore } from "firebase/firestore";

import { AppError } from "@/domain/errors";

export class RevisionConflict extends Error {
  constructor() {
    super("revision_conflict");
    this.name = "RevisionConflict";
  }
}

/** Strictly newer than the stored revision, even when two writes share a millisecond. */
export function nextContentRevision(previous: number, now: number): number {
  const base = Number.isFinite(previous) ? previous : 0;
  const clock = Number.isFinite(now) ? now : base + 1;
  return Math.max(clock, base + 1);
}

export async function commitExpectedRevision(input: {
  db: Firestore;
  ref: DocumentReference;
  expectedRevision: number;
  cloud: Record<string, unknown>;
  generationAtStart: number;
  currentGeneration: () => number;
  revisionRef?: DocumentReference;
}): Promise<void> {
  if (input.currentGeneration() !== input.generationAtStart) {
    throw new AppError("permission_denied", "Sign in again.", undefined, { reason: "session_changed" });
  }
  await runTransaction(input.db, async (tx) => {
    if (input.currentGeneration() !== input.generationAtStart) {
      throw new AppError("permission_denied", "Sign in again.", undefined, { reason: "session_changed" });
    }
    const fresh = await tx.get(input.ref);
    if (!fresh.exists()) throw new AppError("not_found", "Record not found.");
    const current = Number(fresh.data()?.updatedAt);
    if (current !== input.expectedRevision) throw new RevisionConflict();
    tx.set(input.ref, input.cloud, { merge: true });
    if (input.revisionRef) {
      tx.set(input.revisionRef, {
        base: String(input.expectedRevision),
        next: String(input.cloud.updatedAt),
      });
    }
  });
}
