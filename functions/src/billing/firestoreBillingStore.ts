/**
 * firebase-admin adapter for BillingStore.
 *
 * Real Firestore natively enforces the reads-before-writes transaction
 * contract that MemoryBillingStore mirrors strictly for unit tests; the
 * emulator suite (applyTransition.emulator.test.ts) proves the billing
 * engine's transaction shape against this adapter.
 */

import type { Firestore } from "firebase-admin/firestore";

import { AlreadyExistsError, type BillingStore, type BillingTransaction } from "./store";

function isAlreadyExists(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: unknown }).code;
  return code === 6 || /already exists/i.test(err.message);
}

export class FirestoreBillingStore implements BillingStore {
  constructor(private readonly db: Firestore) {}

  async runTransaction<T>(fn: (tx: BillingTransaction) => Promise<T>): Promise<T> {
    try {
      return await this.db.runTransaction(async (t) => {
        const tx: BillingTransaction = {
          get: async (path) => {
            const snap = await t.get(this.db.doc(path));
            return {
              exists: snap.exists,
              data: () => snap.data() as Record<string, unknown> | undefined,
            };
          },
          create: (path, data) => {
            t.create(this.db.doc(path), data);
          },
          set: (path, data) => {
            t.set(this.db.doc(path), data);
          },
        };
        return fn(tx);
      });
    } catch (err) {
      if (isAlreadyExists(err)) {
        throw new AlreadyExistsError("firestore document");
      }
      throw err;
    }
  }
}
