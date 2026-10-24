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

/**
 * not_issued: the SDK commit was not called.
 * unknown: the commit was called and neither acceptance nor a definite rejection came back.
 * confirmed: the SDK commit resolved.
 * rejected: the server returned a definite rejection. The code on that error is the result.
 */
export type RevisionCommitOutcome = "not_issued" | "unknown" | "confirmed" | "rejected";

/** The commit was issued and its result was not confirmed. Retry must keep the same operation. */
export class RevisionUnknown extends Error {
  readonly outcome = "unknown" as const;
  readonly cause: unknown;
  constructor(cause: unknown) {
    super("revision_unknown");
    this.name = "RevisionUnknown";
    this.cause = cause;
  }
}

export function revisionRejectionCode(error: unknown): string | null {
  if (!isDefiniteRejection(error)) return null;
  return String((error as { code?: unknown }).code);
}

/**
 * After an issued write, only operation identity decides whether it is already
 * stored. A moved updatedAt does not. A cached or failed read stays unknown.
 * A definite rejection is kept unless identity shows this operation is already present,
 * or a server read shows another revision won the gate.
 */
export function decideIssuedRetry(input: {
  kind: "unknown" | "rejected";
  read: "unavailable" | "cached" | "deleted" | "present" | "absent";
  revisionMoved: boolean;
}): "return_current" | "retry_same" | "reject" | "unknown" | "missing" {
  if (input.read === "present") return "return_current";
  if (input.read === "deleted") return "missing";
  if (input.read === "unavailable" || input.read === "cached") {
    return input.kind === "rejected" ? "reject" : "unknown";
  }
  if (input.kind === "unknown") return "retry_same";
  return input.revisionMoved ? "retry_same" : "reject";
}

export type IssuedInspection<T> =
  | { state: "cached" | "deleted" | "unavailable" }
  | { state: "server"; revisionMoved: boolean; operationPresent: boolean; current: T };

/**
 * Re-read after an issued write. A session change keeps the issued outcome and
 * does not return the record. A failed read stays unavailable unless it is
 * itself a session error.
 */
export async function settleIssuedWrite<T>(input: {
  error: unknown;
  generationAtStart: number;
  currentGeneration: () => number;
  inspect: () => Promise<IssuedInspection<T>>;
}): Promise<{ action: "return"; current: T } | { action: "retry" } | { action: "missing" }> {
  if (input.error instanceof AppError) throw input.error;
  const kind = input.error instanceof RevisionUnknown
    ? "unknown"
    : revisionRejectionCode(input.error)
      ? "rejected"
      : null;
  if (!kind) throw input.error;
  const owned = () => input.currentGeneration() === input.generationAtStart;
  if (!owned()) throw issuedSessionError(kind);
  let inspection: IssuedInspection<T>;
  try {
    inspection = await input.inspect();
    if (!owned()) throw issuedSessionError(kind);
  } catch (inspectError) {
    if (inspectError instanceof AppError) throw inspectError;
    inspection = { state: "unavailable" };
  }
  if (!owned()) throw issuedSessionError(kind);
  const read = inspection.state === "server"
    ? inspection.operationPresent ? "present" : "absent"
    : inspection.state;
  const decision = decideIssuedRetry({
    kind,
    read,
    revisionMoved: inspection.state === "server" ? inspection.revisionMoved : false,
  });
  if (decision === "return_current" && inspection.state === "server") {
    if (!owned()) throw issuedSessionError(kind);
    return { action: "return", current: inspection.current };
  }
  if (decision === "retry_same") {
    if (!owned()) throw issuedSessionError(kind);
    return { action: "retry" };
  }
  if (decision === "missing") return { action: "missing" };
  throw input.error;
}

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

/** A session change after the SDK commit was issued. The record must not be published. */
export function issuedSessionError(kind: "unknown" | "rejected"): AppError {
  return new AppError("permission_denied", "Sign in again.", undefined, {
    reason: "session_changed",
    submitted: kind === "unknown",
    outcome: kind,
  });
}

function isDefiniteRejection(error: unknown): boolean {
  const code = typeof error === "object" && error != null && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";
  return code === "permission-denied" || code === "invalid-argument" || code === "failed-precondition" || code === "already-exists";
}

/** The server reported that this transaction attempt did not commit. */
function isConfirmedAbort(error: unknown): boolean {
  const code = typeof error === "object" && error != null && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";
  return code === "aborted";
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
  // Counts callbacks that returned after tx.set. A later callback does not
  // clear it: that earlier attempt may still be unresolved. A first-attempt
  // conflict, before any callback returns, stays a conflict. Code `aborted`
  // is a confirmed abort and is not an unknown commit.
  let returnedWriteAttempts = 0;
  try {
    await revisionCommitRuntime.runTransaction(input.db, async (tx) => {
      const earlierAttemptUnresolved = returnedWriteAttempts > 0;
      if (!owned()) sessionChanged(earlierAttemptUnresolved ? "unknown" : "not_issued");
      const fresh = await tx.get(input.ref);
      if (!owned()) sessionChanged(earlierAttemptUnresolved ? "unknown" : "not_issued");
      if (!fresh.exists()) throw new AppError("not_found", "Record not found.");
      const current = Number(fresh.data()?.updatedAt);
      if (current !== input.expectedRevision) {
        if (earlierAttemptUnresolved) throw new RevisionUnknown(new RevisionConflict());
        throw new RevisionConflict();
      }
      if (!owned()) sessionChanged(earlierAttemptUnresolved ? "unknown" : "not_issued");
      // Rules can verify the sibling gate on a batch. The emulator rejects that
      // same getAfter check when the write is inside the read transaction.
      if (!input.revisionRef) {
        tx.set(input.ref, input.cloud, { merge: true });
        returnedWriteAttempts += 1;
      }
    });
  } catch (error) {
    if (error instanceof RevisionUnknown) {
      if (!owned()) sessionChanged("unknown");
      throw error;
    }
    if (isConfirmedAbort(error)) throw new RevisionConflict();
    if (error instanceof AppError || error instanceof RevisionConflict) throw error;
    if (isDefiniteRejection(error)) throw error;
    if (returnedWriteAttempts > 0) {
      if (!owned()) sessionChanged("unknown");
      throw new RevisionUnknown(error);
    }
    if (!owned()) sessionChanged("not_issued");
    throw error;
  }
  if (!input.revisionRef) {
    if (!owned()) sessionChanged("confirmed");
    return;
  }
  if (!owned()) sessionChanged("not_issued");
  const next = Number(input.cloud.updatedAt);
  const batch = revisionCommitRuntime.writeBatch(input.db);
  batch.update(input.ref, input.cloud);
  batch.set(input.revisionRef, { base: input.expectedRevision, revision: next });
  try {
    await batch.commit();
  } catch (error) {
    // The batch was handed to the SDK. Do not read the document here: a later
    // revision, a deletion, or a failed read must not replace this result.
    if (isDefiniteRejection(error)) throw error;
    if (!owned()) sessionChanged("unknown");
    throw new RevisionUnknown(error);
  }
  if (!owned()) sessionChanged("confirmed");
}
