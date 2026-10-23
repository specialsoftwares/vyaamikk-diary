/**
 * Regression for the review reproduction that staged a write after the
 * generation changed during tx.get. Safe behaviour is to reject and not stage.
 * The transaction runner is injected. No live write is made.
 */
import assert from "node:assert/strict";

import { AppError } from "@/domain/errors";
import { RevisionConflict, commitExpectedRevision, revisionCommitRuntime } from "./expectedRevisionCommit";

const original = revisionCommitRuntime.runTransaction;

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
  console.log("expectedRevisionCommit: generation changes during read, retry and acknowledgment stay unpublished");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  revisionCommitRuntime.runTransaction = original;
});
