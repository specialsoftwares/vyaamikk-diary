/**
 * Isolated Functions-emulator composition. Not exported from functions/src/index.ts.
 * Wires the same createComposedGrinCallables factory as production HOLD handlers,
 * injecting G1 register adapter + G2 storage adapter. Admin SDK stays in this
 * tools entry only.
 */
import { randomBytes, randomUUID } from "node:crypto";

import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

import { createComposedGrinCallables } from "../../../functions/src/goodsEvidence/composed";
import { HASH_CHUNK_BYTES } from "../../../src/goodsEvidence/evidence";
import { GoodsEvidenceRegisterAdapter } from "../adapter";
import type { G1Firestore, G1Transaction } from "../types";
import { GoodsEvidenceStorageAdapter } from "../../goods-evidence-storage/adapter";
import type { G2BlobStore, G2Clock, G2Firestore, G2Transaction } from "../../goods-evidence-storage/types";

export const ISOLATED_FUNCTIONS_PROJECT = "demo-vyaamikk-grin-t1";
export const ISOLATED_STORAGE_BUCKET = `${ISOLATED_FUNCTIONS_PROJECT}.appspot.com`;

type AdminDb = ReturnType<typeof getFirestore>;

function wrapG1Firestore(db: AdminDb): G1Firestore {
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
              data: () => snap.data() as Record<string, unknown> | undefined,
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

function wrapG2Firestore(db: AdminDb): G2Firestore {
  return {
    doc(path: string) {
      return { path };
    },
    runTransaction(fn, options) {
      return db.runTransaction(async (tx) => {
        const wrapped: G2Transaction = {
          async get(ref) {
            const snap = await tx.get(db.doc(ref.path));
            return {
              exists: snap.exists,
              data: () => snap.data() as Record<string, unknown> | undefined,
            };
          },
          set(ref, data) {
            tx.set(db.doc(ref.path), JSON.parse(JSON.stringify(data)) as Record<string, unknown>);
          },
        };
        return await fn(wrapped);
      }, options);
    },
  };
}

function wrapAdminBlobStore(bucket: ReturnType<ReturnType<typeof getStorage>["bucket"]>): G2BlobStore {
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
  };
}

function productionG1Clock() {
  return {
    nowMs: () => Date.now(),
    uuid: () => randomUUID().replace(/-/g, "").slice(0, 32),
  };
}

function productionG2Clock(): G2Clock {
  return {
    nowMs: () => Date.now(),
    objectKey: () => randomBytes(16).toString("hex"),
  };
}

export function createIsolatedGrinCallables(env: NodeJS.ProcessEnv = process.env) {
  const projectId = env.GCLOUD_PROJECT || ISOLATED_FUNCTIONS_PROJECT;
  const storageBucket = env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`;
  if (getApps().length === 0) {
    initializeApp({ projectId, storageBucket });
  }
  const db = getFirestore();
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    // settings may only be applied once per process
  }
  const bucket = getStorage().bucket(storageBucket);
  const registerAdapter = new GoodsEvidenceRegisterAdapter(wrapG1Firestore(db), productionG1Clock());
  const storageAdapter = new GoodsEvidenceStorageAdapter(
    wrapG2Firestore(db),
    wrapAdminBlobStore(bucket),
    productionG2Clock()
  );
  return createComposedGrinCallables({
    adapter: registerAdapter,
    evidence: storageAdapter,
    env,
  });
}
