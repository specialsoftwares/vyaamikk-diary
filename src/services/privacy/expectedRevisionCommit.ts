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

/** not_issued: the SDK commit was not called. unknown: it was called and the outcome was not confirmed. confirmed: the SDK commit resolved. */
export type RevisionCommitOutcome = "not_issued" | "unknown" | "confirmed";

function sessionChanged(outcome: RevisionCommitOutcome): never {
  throw new AppError("permission_denied", "Sign in again.", undefined, {
    reason: "session_changed",
    // False only when the write was never handed to the SDK. Unknown means
    // the acknowledgment was lost after the commit was issued; logout cannot
    // recall it, and the caller must not publish it or replay it as new.
    submitted: outcome !== "not_issued",
    outcome,
  });
}

function isDefiniteRejection(error: unknown): boolean {
  const code = typeof error === "object" && error != null && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";
  return code === "permission-denied" || code === "invalid-argument" || code === "failed-precondition" || code === "already-exists";
}

/** Production uses the Firestore SDK. Tests replace the runners, not the checks. */
export const revisionCommitRuntime = {
  runTransaction,
  writeBatch,
  getDoc,
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
  if (!owned()) sessionChanged("not_issued");
  let writeIssued = false;
  try {
    await revisionCommitRuntime.runTransaction(input.db, async (tx) => {
      // Every callback attempt, including a transaction retry, rechecks ownership.
      if (!owned()) sessionChanged("not_issued");
      const fresh = await tx.get(input.ref);
      if (!owned()) sessionChanged("not_issued");
      if (!fresh.exists()) throw new AppError("not_found", "Record not found.");
      const current = Number(fresh.data()?.updatedAt);
      if (current !== input.expectedRevision) throw new RevisionConflict();
      if (!owned()) sessionChanged("not_issued");
      // Rules can verify the sibling gate on a batch. The emulator rejects that
      // same getAfter check when the write is inside the read transaction.
      if (!input.revisionRef) {
        writeIssued = true;
        tx.set(input.ref, input.cloud, { merge: true });
      }
    });
  } catch (error) {
    if (error instanceof AppError || error instanceof RevisionConflict) throw error;
    if (isDefiniteRejection(error)) throw error;
    if (!owned()) sessionChanged(writeIssued ? "unknown" : "not_issued");
    throw error;
  }
  if (!owned()) sessionChanged(writeIssued ? "confirmed" : "not_issued");
  if (input.revisionRef) {
    const next = Number(input.cloud.updatedAt);
    const batch = revisionCommitRuntime.writeBatch(input.db);
    batch.update(input.ref, input.cloud);
    batch.set(input.revisionRef, { base: input.expectedRevision, revision: next });
    writeIssued = true;
    try {
      await batch.commit();
    } catch (error) {
      if (!owned() && !isDefiniteRejection(error)) sessionChanged("unknown");
      const after = await revisionCommitRuntime.getDoc(input.ref);
      if (!after.exists()) throw new AppError("not_found", "Record not found.");
      if (Number(after.data()?.updatedAt) !== input.expectedRevision) throw new RevisionConflict();
      throw error;
    }
  }
  if (!owned()) sessionChanged("confirmed");
}
