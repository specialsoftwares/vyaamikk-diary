/**
 * In-process G1Firestore with JSON persistence normalization.
 * Used to reproduce reviewer findings and unit-test adapter behavior
 * without the Firestore emulator. Not a production backend.
 */
import type { G1DocRef, G1DocSnap, G1Firestore, G1QueryDocSnap, G1Transaction } from "./types";

export type InjectedStore = G1Firestore & {
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

export function createInjectedStore(): InjectedStore {
  const snapshot = new Map<string, string>();
  const store: InjectedStore = {
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
      const tx: G1Transaction = {
        async get(ref: G1DocRef): Promise<G1DocSnap> {
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
        set(ref: G1DocRef, data: Record<string, unknown>) {
          staged.set(ref.path, persist(JSON.parse(JSON.stringify(data)) as Record<string, unknown>));
        },
        async list(collectionPath: string): Promise<G1QueryDocSnap[]> {
          const prefix = `${collectionPath.replace(/\/$/, "")}/`;
          const seen = new Map<string, G1QueryDocSnap>();
          const consider = (path: string, raw: string | undefined) => {
            if (!path.startsWith(prefix)) return;
            const rest = path.slice(prefix.length);
            if (!rest || rest.includes("/")) return;
            const data = restore(raw);
            seen.set(path, {
              id: rest,
              path,
              exists: data != null,
              data: () => (data == null ? undefined : { ...data }),
            });
          };
          for (const [path, raw] of snapshot) consider(path, raw);
          for (const [path, raw] of staged) consider(path, raw);
          return [...seen.values()].filter((snap) => snap.exists);
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

export function seedInjectedOwner(
  store: InjectedStore,
  uid: string,
  ledgerId: string,
  policy: { newCommands: "allow" | "deny"; reconciliation: "allow" | "deny" } = {
    newCommands: "allow",
    reconciliation: "allow",
  }
): void {
  store.snapshot.set(`users/${uid}`, persist({ uid, status: "active" }));
  store.snapshot.set(
    `users/${uid}/goodsEvidenceLedgers/${ledgerId}`,
    persist({ ownerUid: uid, status: "active" })
  );
  store.snapshot.set(
    `users/${uid}/goodsEvidenceAdmission/runtime`,
    persist({ schemaVersion: 1, ...policy })
  );
}
