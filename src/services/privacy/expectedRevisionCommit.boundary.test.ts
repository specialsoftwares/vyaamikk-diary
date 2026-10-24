/**
 * Regression for the review reproduction that staged a write after the
 * generation changed during tx.get. Safe behaviour is to reject and not stage.
 * The transaction runner is injected. No live write is made.
 */
import assert from "node:assert/strict";

import { AppError } from "@/domain/errors";
import { RevisionConflict, RevisionUnknown, commitExpectedRevision, decideIssuedRetry, revisionCommitRuntime } from "./expectedRevisionCommit";

const original = revisionCommitRuntime.runTransaction;
const originalBatch = revisionCommitRuntime.writeBatch;
const originalGet = revisionCommitRuntime.getDoc;

function sessionReason(error: unknown): string | undefined {
  return error instanceof AppError ? String(error.details?.reason) : undefined;
}

async function main() {
  let generation = 0;
  let staged = false;
  revisionCommitRuntime.runTransaction = async (_db, work) => {
    await work({
      get: async () => {
        await Promise.resolve();
        generation = 1;
        return { exists: () => true, data: () => ({ updatedAt: 10 }) };
      },
      set: () => {
        staged = true;
      },
    } as never);
  };
  let duringRead: unknown;
  try {
    await commitExpectedRevision({
      db: {} as never,
      ref: {} as never,
      expectedRevision: 10,
      cloud: { updatedAt: 11 },
      generationAtStart: 0,
      currentGeneration: () => generation,
    });
  } catch (error) {
    duringRead = error;
  }
  assert.equal(generation, 1);
  assert.equal(staged, false);
  assert.equal(sessionReason(duringRead), "session_changed");
  assert.equal((duringRead as AppError).details?.submitted, false);

  generation = 0;
  staged = false;
  let attempts = 0;
  revisionCommitRuntime.runTransaction = async (_db, work) => {
    for (;;) {
      const queued: unknown[] = [];
      try {
        await work({
          get: async () => {
            attempts += 1;
            if (attempts === 1) return { exists: () => true, data: () => ({ updatedAt: 9 }) };
            generation = 1;
            return { exists: () => true, data: () => ({ updatedAt: 10 }) };
          },
          set: (value: unknown) => {
            queued.push(value);
          },
        } as never);
        staged = queued.length > 0;
        return;
      } catch (error) {
        if (error instanceof RevisionConflict) continue;
        throw error;
      }
    }
  };
  let retried: unknown;
  try {
    await commitExpectedRevision({
      db: {} as never,
      ref: {} as never,
      expectedRevision: 10,
      cloud: { updatedAt: 11 },
      generationAtStart: 0,
      currentGeneration: () => generation,
    });
  } catch (error) {
    retried = error;
  }
  assert.equal(staged, false);
  assert.equal(sessionReason(retried), "session_changed");

  generation = 0;
  staged = false;
  revisionCommitRuntime.runTransaction = async (_db, work) => {
    await work({
      get: async () => ({ exists: () => true, data: () => ({ updatedAt: 10 }) }),
      set: () => {
        staged = true;
        generation = 2;
      },
    } as never);
  };
  let acknowledged: unknown;
  try {
    await commitExpectedRevision({
      db: {} as never,
      ref: {} as never,
      expectedRevision: 10,
      cloud: { updatedAt: 11 },
      generationAtStart: 0,
      currentGeneration: () => generation,
    });
  } catch (error) {
    acknowledged = error;
  }
  assert.equal(staged, true);
  assert.equal(sessionReason(acknowledged), "session_changed");
  assert.equal((acknowledged as AppError).details?.submitted, true);
  assert.equal((acknowledged as AppError).details?.outcome, "confirmed");

  generation = 0;
  staged = false;
  let accepted = false;
  revisionCommitRuntime.runTransaction = async (_db, work) => {
    await work({
      get: async () => ({ exists: () => true, data: () => ({ updatedAt: 10 }) }),
      set: () => {
        staged = true;
      },
    } as never);
  };
  revisionCommitRuntime.writeBatch = (() => ({
    update: () => {
      staged = true;
    },
    set: () => undefined,
    commit: async () => {
      accepted = true;
      generation = 1;
      throw new Error("acknowledgment_lost_after_acceptance");
    },
  })) as never;
  let lostAck: unknown;
  try {
    await commitExpectedRevision({
      db: {} as never,
      ref: {} as never,
      revisionRef: {} as never,
      expectedRevision: 10,
      cloud: { updatedAt: 11 },
      generationAtStart: 0,
      currentGeneration: () => generation,
    });
  } catch (error) {
    lostAck = error;
  }
  assert.equal(accepted, true);
  assert.equal(staged, true);
  assert.equal(sessionReason(lostAck), "session_changed");
  assert.equal((lostAck as AppError).details?.outcome, "unknown");
  assert.equal((lostAck as AppError).details?.submitted, true);

  generation = 0;
  accepted = false;
  let reconciliationReads = 0;
  revisionCommitRuntime.getDoc = (async () => {
    reconciliationReads += 1;
    throw new Error("reconciliation_unavailable");
  }) as never;
  revisionCommitRuntime.writeBatch = (() => ({
    update: () => undefined,
    set: () => undefined,
    commit: async () => {
      throw Object.assign(new Error("denied"), { code: "permission-denied" });
    },
  })) as never;
  let rejected: unknown;
  try {
    await commitExpectedRevision({
      db: {} as never,
      ref: {} as never,
      revisionRef: {} as never,
      expectedRevision: 10,
      cloud: { updatedAt: 11 },
      generationAtStart: 0,
      currentGeneration: () => generation,
    });
  } catch (error) {
    rejected = error;
  }
  assert.equal(reconciliationReads, 0, "a definite rejection is not replaced by a reconciliation read");
  assert.equal(sessionReason(rejected), undefined);
  assert.equal((rejected as { code?: string }).code, "permission-denied");

  revisionCommitRuntime.getDoc = (async () => {
    throw new Error("cached_or_competing_read");
  }) as never;
  revisionCommitRuntime.writeBatch = (() => ({
    update: () => undefined,
    set: () => undefined,
    commit: async () => {
      throw new Error("acknowledgment_lost_same_session");
    },
  })) as never;
  let sameSession: unknown;
  try {
    await commitExpectedRevision({
      db: {} as never,
      ref: {} as never,
      revisionRef: {} as never,
      expectedRevision: 10,
      cloud: { updatedAt: 11, clientPaymentId: "pay_same" },
      generationAtStart: 0,
      currentGeneration: () => generation,
    });
  } catch (error) {
    sameSession = error;
  }
  assert.ok(sameSession instanceof RevisionUnknown);
  assert.equal((sameSession as RevisionUnknown).outcome, "unknown");
  assert.ok(!(sameSession instanceof RevisionConflict));

  let transactionStaged = false;
  revisionCommitRuntime.runTransaction = async (_db, work) => {
    await work({
      get: async () => ({ exists: () => true, data: () => ({ updatedAt: 10 }) }),
      set: () => {
        transactionStaged = true;
      },
    } as never);
    throw new Error("transaction_commit_lost");
  };
  let transactionLost: unknown;
  try {
    await commitExpectedRevision({
      db: {} as never,
      ref: {} as never,
      expectedRevision: 10,
      cloud: { updatedAt: 11 },
      generationAtStart: 0,
      currentGeneration: () => generation,
    });
  } catch (error) {
    transactionLost = error;
  }
  assert.equal(transactionStaged, true);
  assert.ok(transactionLost instanceof RevisionUnknown, "a returned transaction whose commit ack is lost stays unknown");

  revisionCommitRuntime.runTransaction = async (_db, work) => {
    await work({
      get: async () => ({ exists: () => true, data: () => ({ updatedAt: 10 }) }),
      set: () => {
        throw new Error("stage_failed");
      },
    } as never);
  };
  let stageFailed: unknown;
  try {
    await commitExpectedRevision({
      db: {} as never,
      ref: {} as never,
      expectedRevision: 10,
      cloud: { updatedAt: 11 },
      generationAtStart: 0,
      currentGeneration: () => generation,
    });
  } catch (error) {
    stageFailed = error;
  }
  assert.equal((stageFailed as Error).message, "stage_failed");
  assert.ok(!(stageFailed instanceof RevisionUnknown));

  assert.equal(decideIssuedRetry({ kind: "unknown", read: "present", revisionMoved: true }), "return_current");
  assert.equal(decideIssuedRetry({ kind: "unknown", read: "absent", revisionMoved: true }), "retry_same");
  assert.equal(decideIssuedRetry({ kind: "unknown", read: "cached", revisionMoved: true }), "unknown");
  assert.equal(decideIssuedRetry({ kind: "unknown", read: "unavailable", revisionMoved: false }), "unknown");
  assert.equal(decideIssuedRetry({ kind: "rejected", read: "deleted", revisionMoved: true }), "missing");
  assert.equal(decideIssuedRetry({ kind: "rejected", read: "absent", revisionMoved: true }), "retry_same");
  assert.equal(decideIssuedRetry({ kind: "rejected", read: "absent", revisionMoved: false }), "reject");
  assert.equal(decideIssuedRetry({ kind: "rejected", read: "unavailable", revisionMoved: true }), "reject");

  console.log("expectedRevisionCommit: generation changes during read, retry and acknowledgment stay unpublished");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  revisionCommitRuntime.runTransaction = original;
  revisionCommitRuntime.writeBatch = originalBatch;
  revisionCommitRuntime.getDoc = originalGet;
});
