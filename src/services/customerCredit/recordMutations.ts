import { doc, type Firestore } from "firebase/firestore";

import { AppError } from "@/domain/errors";
import type { CustomerCreditRecord } from "@/domain/customerCredit";
import { currentAuthMutationGeneration } from "@/services/auth/authSessionFence";
import {
  commitExpectedRevision,
  decideIssuedRetry,
  nextContentRevision,
  RevisionConflict,
  RevisionUnknown,
  revisionCommitRuntime,
  revisionRejectionCode,
} from "@/services/privacy/expectedRevisionCommit";

import { appendPayment, applyFullClosure } from "./shared";
import type { AddCreditPaymentInput, CloseFullyPaidInput } from "./types";

const RETRIES = 5;

function toCloud(record: CustomerCreditRecord): Record<string, unknown> {
  const { pdfUri: _pdf, customerPhoto: _photo, closure, ...rest } = record;
  const closureCloud = closure ? { ...closure, paymentProofUri: null } : null;
  return { ...rest, pdfUri: null, customerPhoto: null, closure: closureCloud };
}

function recordRef(db: Firestore, userId: string, recordId: string) {
  return doc(db, "users", userId, "customerCreditRecords", recordId);
}

export async function mutateCustomerCreditOnDb(
  db: Firestore,
  userId: string,
  recordId: string,
  mutate: (existing: CustomerCreditRecord, now: number) => CustomerCreditRecord,
  parseExisting: (id: string, data: Record<string, unknown>) => CustomerCreditRecord,
  nowMs = Date.now(),
  options?: {
    restoreRaw?: (raw: Record<string, unknown>) => Promise<Record<string, unknown>>;
    protectCloud?: (
      record: CustomerCreditRecord,
      raw: Record<string, unknown>
    ) => Promise<Record<string, unknown>>;
    currentGeneration?: () => number;
  }
): Promise<CustomerCreditRecord> {
  if (!userId) throw new AppError("permission_denied", "Not signed in.");
  const ref = recordRef(db, userId, recordId);
  const readGeneration = options?.currentGeneration ?? currentAuthMutationGeneration;
  const generation = readGeneration();
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    if (readGeneration() !== generation) {
      throw new AppError("permission_denied", "Sign in again.", undefined, { reason: "session_changed" });
    }
    const snap = await revisionCommitRuntime.getDoc(ref);
    if (!snap.exists()) throw new AppError("not_found", "Record not found.");
    const stored = snap.data() as Record<string, unknown>;
    const expectedRevision = Number(stored.updatedAt);
    const raw = options?.restoreRaw ? await options.restoreRaw(stored) : stored;
    if (readGeneration() !== generation) {
      throw new AppError("permission_denied", "Sign in again.", undefined, { reason: "session_changed" });
    }
    const existing = parseExisting(snap.id, raw);
    const changed = mutate(existing, nowMs);
    if (changed === existing) return existing;
    const stamped = { ...changed, updatedAt: nextContentRevision(existing.updatedAt, nowMs) };
    const cloud = options?.protectCloud ? await options.protectCloud(stamped, stored) : toCloud(stamped);
    try {
      await commitExpectedRevision({
        db,
        ref,
        revisionRef: doc(db, "users", userId, "customerCreditRecords", recordId, "opRevision", "current"),
        expectedRevision,
        cloud,
        generationAtStart: generation,
        currentGeneration: readGeneration,
      });
      return stamped;
    } catch (error) {
      if (error instanceof RevisionConflict) continue;
      const kind = error instanceof RevisionUnknown ? "unknown" : revisionRejectionCode(error) ? "rejected" : null;
      if (!kind) throw error;
      let read: "unavailable" | "cached" | "deleted" | "present" | "absent" = "unavailable";
      let revisionMoved = false;
      let currentRecord: CustomerCreditRecord | null = null;
      try {
        const after = await revisionCommitRuntime.getDoc(ref);
        if (after.metadata?.fromCache === true) {
          read = "cached";
        } else if (!after.exists()) {
          read = "deleted";
        } else {
          const afterStored = after.data() as Record<string, unknown>;
          revisionMoved = Number(afterStored.updatedAt) !== expectedRevision;
          const afterRaw = options?.restoreRaw ? await options.restoreRaw(afterStored) : afterStored;
          const afterExisting = parseExisting(after.id, afterRaw);
          const again = mutate(afterExisting, nowMs);
          if (again === afterExisting) {
            read = "present";
            currentRecord = afterExisting;
          } else {
            read = "absent";
          }
        }
      } catch {
        read = "unavailable";
      }
      const decision = decideIssuedRetry({ kind, read, revisionMoved });
      if (decision === "return_current" && currentRecord) return currentRecord;
      if (decision === "retry_same") continue;
      if (decision === "missing") throw new AppError("not_found", "Record not found.");
      throw error;
    }
  }
  throw new AppError(
    "save_failed",
    "This record changed on another device. Try again.",
    undefined,
    { reason: "revision_conflict" }
  );
}

/**
 * Firestore payment append used by the production Customer Credit repository.
 * Encryption, when supplied, runs outside the commit. A lost acknowledgement
 * retries the same payment id against a fresh read.
 */
export async function addCustomerCreditPaymentOnDb(
  db: Firestore,
  userId: string,
  recordId: string,
  payment: AddCreditPaymentInput,
  parseExisting: (id: string, data: Record<string, unknown>) => CustomerCreditRecord,
  nowMs = Date.now(),
  options?: {
    restoreRaw?: (raw: Record<string, unknown>) => Promise<Record<string, unknown>>;
    protectCloud?: (
      record: CustomerCreditRecord,
      raw: Record<string, unknown>
    ) => Promise<Record<string, unknown>>;
    currentGeneration?: () => number;
  }
): Promise<CustomerCreditRecord> {
  return mutateCustomerCreditOnDb(
    db,
    userId,
    recordId,
    (existing, now) => appendPayment(existing, payment, now),
    parseExisting,
    nowMs,
    options
  );
}

/** Firestore full-closure write used by the production Customer Credit repository. */
export async function closeCustomerCreditFullyPaidOnDb(
  db: Firestore,
  userId: string,
  input: CloseFullyPaidInput,
  parseExisting: (id: string, data: Record<string, unknown>) => CustomerCreditRecord,
  nowMs = Date.now(),
  options?: {
    restoreRaw?: (raw: Record<string, unknown>) => Promise<Record<string, unknown>>;
    protectCloud?: (
      record: CustomerCreditRecord,
      raw: Record<string, unknown>
    ) => Promise<Record<string, unknown>>;
    currentGeneration?: () => number;
  }
): Promise<CustomerCreditRecord> {
  return mutateCustomerCreditOnDb(
    db,
    userId,
    input.recordId,
    (existing, now) =>
      applyFullClosure(
        existing,
        input.closure,
        {
          appendPayment: input.appendFinalPayment !== false,
          clientPaymentId: input.clientMutationId,
        },
        now
      ),
    parseExisting,
    nowMs,
    options
  );
}
