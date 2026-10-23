/**
 * Atomic expected-revision commit. Encryption stays outside the transaction.
 * A retry must re-read and reseal; it must not write a payload prepared earlier.
 */

import { getDoc, runTransaction, writeBatch, type DocumentReference, type Firestore } from "firebase/firestore";

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

function sessionChanged(submitted: boolean): never {
  throw new AppError("permission_denied", "Sign in again.", undefined, {
    reason: "session_changed",
    // True only after the transaction has already committed. A later logout
    // cannot recall that server write; the caller must not publish it.
    submitted,
  });
}

/** Production uses the Firestore SDK. Tests replace the runner, not the checks. */
export const revisionCommitRuntime = {
  runTransaction,
};

export async function commitExpectedRevision(input: {
  db: Firestore;
  ref: DocumentReference;
  expectedRevision: number;
  cloud: Record<string, unknown>;
  generationAtStart: number;
  currentGeneration: () => number;
  revisionRef?: DocumentReference;
}): Promise<void> {
  const owned = () => input.currentGeneration() === input.generationAtStart;
  if (!owned()) sessionChanged(false);
  await revisionCommitRuntime.runTransaction(input.db, async (tx) => {
    // Every callback attempt, including a transaction retry, rechecks ownership.
    if (!owned()) sessionChanged(false);
    const fresh = await tx.get(input.ref);
    if (!owned()) sessionChanged(false);
    if (!fresh.exists()) throw new AppError("not_found", "Record not found.");
    const current = Number(fresh.data()?.updatedAt);
    if (current !== input.expectedRevision) throw new RevisionConflict();
    if (!owned()) sessionChanged(false);
    // Rules can verify the sibling gate on a batch. The emulator rejects that
    // same getAfter check when the write is inside the read transaction.
    if (!input.revisionRef) tx.set(input.ref, input.cloud, { merge: true });
  });
  if (!owned()) sessionChanged(input.revisionRef == null);
  if (input.revisionRef) {
    const next = Number(input.cloud.updatedAt);
    const batch = writeBatch(input.db);
    batch.update(input.ref, input.cloud);
    batch.set(input.revisionRef, { base: input.expectedRevision, revision: next });
    try {
      await batch.commit();
    } catch (error) {
      if (!owned()) sessionChanged(false);
      const after = await getDoc(input.ref);
      if (!after.exists()) throw new AppError("not_found", "Record not found.");
      if (Number(after.data()?.updatedAt) !== input.expectedRevision) throw new RevisionConflict();
      throw error;
    }
  }
  if (!owned()) sessionChanged(true);
}
