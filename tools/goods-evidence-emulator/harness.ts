import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { G1Clock, G1Firestore, G1Transaction } from "./types";

const functionsRequire = createRequire(
  join(dirname(fileURLToPath(import.meta.url)), "../../functions/package.json")
);

const { initializeApp, getApps, deleteApp } = functionsRequire("firebase-admin/app") as typeof import("firebase-admin/app");
const { getFirestore } = functionsRequire("firebase-admin/firestore") as typeof import("firebase-admin/firestore");

const PROJECT_ID = "demo-vyaamikk-grin-g1";

export function requireEmulator(): void {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("FIRESTORE_EMULATOR_HOST required (firebase emulators:exec)");
  }
}

type AdminDb = ReturnType<typeof getFirestore>;

export function adminDb(): AdminDb {
  requireEmulator();
  if (getApps().length === 0) {
    initializeApp({ projectId: PROJECT_ID });
  }
  const db = getFirestore();
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    // settings may only be applied once per process
  }
  return db;
}

export async function resetAdmin(): Promise<void> {
  for (const app of getApps()) {
    await deleteApp(app);
  }
}

export function wrapAdminFirestore(db: AdminDb): G1Firestore {
  return {
    doc(path: string) {
      return { path };
    },
    runTransaction(fn, options) {
      return db.runTransaction(async (tx) => {
        const wrapped: G1Transaction = {
          async get(ref) {
            const snap = await tx.get(db.doc(ref.path));
            return {
              exists: snap.exists,
              data: () => (snap.data() as Record<string, unknown> | undefined),
            };
          },
          set(ref, data) {
            tx.set(db.doc(ref.path), JSON.parse(JSON.stringify(data)) as Record<string, unknown>);
          },
          async list(collectionPath) {
            const querySnap = await tx.get(db.collection(collectionPath));
            return querySnap.docs.map((doc) => ({
              id: doc.id,
              path: doc.ref.path,
              exists: doc.exists,
              data: () => doc.data() as Record<string, unknown> | undefined,
            }));
          },
        };
        return await fn(wrapped);
      }, options);
    },
  };
}

export function fixedClock(utcMs: number): G1Clock & { seq: number } {
  const clock = {
    seq: 0,
    nowMs: () => utcMs,
    uuid: () => `id_${++clock.seq}`,
  };
  return clock;
}

export function mutableClock(startMs: number): G1Clock & { now: number; seq: number } {
  const clock = {
    now: startMs,
    seq: 0,
    nowMs: () => clock.now,
    uuid: () => `id_${++clock.seq}`,
  };
  return clock;
}

export async function seedOwner(
  db: AdminDb,
  uid: string,
  ledgerId: string,
  options: {
    userStatus?: string;
    ledgerStatus?: string;
    ownerUid?: string;
    policy?: { newCommands: "allow" | "deny"; reconciliation: "allow" | "deny" } | null;
  } = {}
): Promise<void> {
  const policy = options.policy === undefined
    ? { schemaVersion: 1, newCommands: "allow" as const, reconciliation: "allow" as const }
    : options.policy;
  const admissionRef = db.doc(`users/${uid}/goodsEvidenceAdmission/runtime`);
  if (policy) {
    await admissionRef.set({ schemaVersion: 1, ...policy });
  } else {
    const snap = await admissionRef.get();
    if (snap.exists) await admissionRef.delete();
  }
  await db.doc(`users/${uid}`).set({
    uid,
    status: options.userStatus ?? "active",
  });
  await db.doc(`users/${uid}/goodsEvidenceLedgers/${ledgerId}`).set({
    ownerUid: options.ownerUid ?? uid,
    status: options.ledgerStatus ?? "active",
  });
}

export function makeReadBarrier(n: number): () => Promise<void> {
  let count = 0;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return async () => {
    count += 1;
    if (count >= n) release?.();
    await Promise.race([
      gate,
      new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error("g1_test_barrier_timeout")), 8000);
      }),
    ]);
  };
}
