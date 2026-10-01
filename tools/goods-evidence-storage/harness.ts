/**
 * Emulator harness for G2. Not a production Storage worker.
 * firebase-admin is loaded from functions/ so this file is not a live callable.
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { HASH_CHUNK_BYTES } from "../../src/goodsEvidence/evidence";
import type { G2BlobStore, G2Clock, G2Firestore, G2Transaction } from "./types";

const functionsRequire = createRequire(
  join(dirname(fileURLToPath(import.meta.url)), "../../functions/package.json")
);

const adminApp = functionsRequire("firebase-admin/app");
const adminFirestore = functionsRequire("firebase-admin/firestore");
const adminStorage = functionsRequire("firebase-admin/storage");

export const PROJECT_ID = "demo-vyaamikk-grin-g2";
export const STORAGE_BUCKET = `${PROJECT_ID}.appspot.com`;

export function requireEmulators(): void {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("FIRESTORE_EMULATOR_HOST required (firebase emulators:exec)");
  }
  if (!process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
    throw new Error("FIREBASE_STORAGE_EMULATOR_HOST required (firebase emulators:exec)");
  }
}

export function adminAppReady() {
  requireEmulators();
  if (adminApp.getApps().length === 0) {
    adminApp.initializeApp({ projectId: PROJECT_ID, storageBucket: STORAGE_BUCKET });
  }
  const db = adminFirestore.getFirestore();
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    // settings may only be applied once per process
  }
  const bucket = adminStorage.getStorage().bucket(STORAGE_BUCKET);
  return { db, bucket };
}

export async function resetAdmin(): Promise<void> {
  for (const app of adminApp.getApps()) {
    await adminApp.deleteApp(app);
  }
}

export function wrapAdminFirestore(db: { doc: (path: string) => unknown; runTransaction: Function }): G2Firestore {
  return {
    doc(path: string) {
      return { path };
    },
    runTransaction(fn, options) {
      return db.runTransaction(async (tx: { get: Function; set: Function }) => {
        const wrapped: G2Transaction = {
          async get(ref) {
            const snap = await tx.get(db.doc(ref.path));
            return {
              exists: snap.exists,
              data: () => snap.data() as Record<string, unknown> | undefined,
            };
          },
          set(ref, data) {
            tx.set(db.doc(ref.path), JSON.parse(JSON.stringify(data)));
          },
        };
        return await fn(wrapped);
      }, options);
    },
  };
}

export function wrapAdminBlobStore(bucket: {
  file: (path: string) => {
    exists: () => Promise<[boolean]>;
    save: (data: Buffer, opts: object) => Promise<unknown>;
    getMetadata: () => Promise<[Record<string, unknown>]>;
    download: () => Promise<[Buffer]>;
    createReadStream: () => AsyncIterable<Uint8Array | Buffer>;
    delete: (opts?: object) => Promise<unknown>;
  };
}): G2BlobStore & {
  emulatorOverwrite: (path: string, bytes: Uint8Array, contentType: string) => Promise<string>;
  emulatorDelete: (path: string) => Promise<void>;
} {
  return {
    async putIfAbsent(path, bytes, contentType) {
      const file = bucket.file(path);
      const [exists] = await file.exists();
      if (exists) return { ok: false, code: "already_exists" };
      await file.save(Buffer.from(bytes), {
        contentType,
        resumable: false,
        public: false,
        metadata: { contentType },
      });
      const [meta] = await file.getMetadata();
      return {
        ok: true,
        generation: String(meta.generation),
        byteSize: Number(meta.size),
        contentType: String(meta.contentType ?? contentType),
      };
    },
    async stat(path) {
      const file = bucket.file(path);
      const [exists] = await file.exists();
      if (!exists) return null;
      const [meta] = await file.getMetadata();
      return {
        generation: String(meta.generation),
        byteSize: Number(meta.size),
        contentType: String(meta.contentType ?? ""),
      };
    },
    async open(path) {
      const file = bucket.file(path);
      const [exists] = await file.exists();
      if (!exists) return null;
      const [meta] = await file.getMetadata();
      const stream = file.createReadStream();
      async function* chunks(): AsyncGenerator<Uint8Array> {
        for await (const piece of stream) {
          const buf = piece instanceof Uint8Array ? piece : Uint8Array.from(piece);
          for (let i = 0; i < buf.byteLength; i += HASH_CHUNK_BYTES) {
            yield buf.subarray(i, Math.min(i + HASH_CHUNK_BYTES, buf.byteLength));
          }
        }
      }
      return {
        generation: String(meta.generation),
        byteSize: Number(meta.size),
        contentType: String(meta.contentType ?? ""),
        chunks: chunks(),
      };
    },
    async emulatorOverwrite(path, bytes, contentType) {
      const file = bucket.file(path);
      await file.save(Buffer.from(bytes), {
        contentType,
        resumable: false,
        public: false,
        metadata: { contentType },
      });
      const [meta] = await file.getMetadata();
      return String(meta.generation);
    },
    async emulatorDelete(path) {
      const file = bucket.file(path);
      const [exists] = await file.exists();
      if (exists) await file.delete({ ignoreNotFound: true });
    },
  };
}

export function fixedClock(utcMs: number): G2Clock & { seq: number } {
  const clock = {
    seq: 0,
    nowMs: () => utcMs,
    objectKey: () => (++clock.seq).toString(16).padStart(32, "0"),
  };
  return clock;
}

export async function seedOwner(
  db: { doc: (path: string) => { set: Function; get: Function; delete: Function } },
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
): Promise<void> {
  const policy =
    options.policy === undefined
      ? { schemaVersion: 1, newCommands: "allow" as const, reconciliation: "allow" as const }
      : options.policy;
  const admissionRef = db.doc(`users/${uid}/goodsEvidenceAdmission/runtime`);
  if (policy) {
    await admissionRef.set({ schemaVersion: 1, ...policy });
  } else {
    const snap = await admissionRef.get();
    if (snap.exists) await admissionRef.delete();
  }
  await db.doc(`users/${uid}`).set({ uid, status: options.userStatus ?? "active" });
  await db.doc(`users/${uid}/goodsEvidenceLedgers/${ledgerId}`).set({
    ownerUid: options.ownerUid ?? uid,
    status: options.ledgerStatus ?? "active",
  });
  if (options.receipt !== false) {
    await db.doc(`users/${uid}/goodsEvidenceLedgers/${ledgerId}/receipts/${receiptId}`).set({
      original: { receiptId, ownerUid: uid, ledgerId },
    });
  }
}
