/**
 * FAKE_ in-process Firestore for G2 unit tests.
 * Labelled fake — not a production backend.
 */
import type { G2DocRef, G2DocSnap, G2Firestore, G2Transaction } from "./types";

export type FAKE_InjectedFirestore = G2Firestore & {
  snapshot: Map<string, string>;
  appliedWrites: number;
  failNextCommit: boolean;
  failCommitError: unknown;
  throwOnGet: Map<string, unknown>;
};

function persist(data: Record<string, unknown>): string {
  return JSON.stringify(data);
}

function restore(raw: string | undefined): Record<string, unknown> | undefined {
  if (raw == null) return undefined;
  return JSON.parse(raw) as Record<string, unknown>;
}

export function FAKE_createInjectedFirestore(): FAKE_InjectedFirestore {
  const snapshot = new Map<string, string>();
  const store: FAKE_InjectedFirestore = {
    snapshot,
    appliedWrites: 0,
    failNextCommit: false,
    failCommitError: Object.assign(new Error("injected_commit_rejected"), { code: 10 }),
    throwOnGet: new Map(),
    doc(path: string) {
      return { path };
    },
    async runTransaction(fn) {
      const staged = new Map<string, string>();
      const tx: G2Transaction = {
        async get(ref: G2DocRef): Promise<G2DocSnap> {
          if (store.throwOnGet.has(ref.path)) {
            throw store.throwOnGet.get(ref.path);
          }
          const raw = staged.has(ref.path) ? staged.get(ref.path) : snapshot.get(ref.path);
          const data = restore(raw);
          return {
            exists: data != null,
            data: () => (data == null ? undefined : { ...data }),
          };
        },
        set(ref: G2DocRef, data: Record<string, unknown>) {
          staged.set(ref.path, persist(JSON.parse(JSON.stringify(data)) as Record<string, unknown>));
        },
      };
      const result = await fn(tx);
      if (store.failNextCommit) {
        store.failNextCommit = false;
        throw store.failCommitError;
      }
      for (const [path, raw] of staged) {
        snapshot.set(path, raw);
        store.appliedWrites += 1;
      }
      return result;
    },
  };
  return store;
}

export function FAKE_seedOwner(
  store: FAKE_InjectedFirestore,
  uid: string,
  ledgerId: string,
  receiptId: string,
  options: {
    userStatus?: string;
    ledgerStatus?: string;
    ownerUid?: string;
    policy?: { newCommands: "allow" | "deny"; reconciliation: "allow" | "deny" } | null;
    receipt?: boolean;
  } = {}
): void {
  const policy =
    options.policy === undefined
      ? { schemaVersion: 1, newCommands: "allow" as const, reconciliation: "allow" as const }
      : options.policy;
  store.snapshot.set(`users/${uid}`, persist({ uid, status: options.userStatus ?? "active" }));
  store.snapshot.set(
    `users/${uid}/goodsEvidenceLedgers/${ledgerId}`,
    persist({ ownerUid: options.ownerUid ?? uid, status: options.ledgerStatus ?? "active" })
  );
  if (policy) {
    store.snapshot.set(
      `users/${uid}/goodsEvidenceAdmission/runtime`,
      persist({ schemaVersion: 1, ...policy })
    );
  }
  if (options.receipt !== false) {
    store.snapshot.set(
      `users/${uid}/goodsEvidenceLedgers/${ledgerId}/receipts/${receiptId}`,
      persist({ original: { receiptId, ownerUid: uid, ledgerId } })
    );
  }
}
