/**
 * Production Admin composition for undeployed GRIN callables.
 *
 * Binds packaged G1/G2 adapters to one resolved Admin app's Firestore + Storage.
 * Project and bucket come from productionAdminConfig.ts. Not exported from
 * functions/src/index.ts. Isolated Functions-emulator entry re-exports
 * createProductionGrinCallables as createIsolatedGrinCallables.
 *
 * Clock is Date.now() / crypto on this process (server attempt time).
 * Adapter firestoreCommitTime stays null and is not a commit timestamp.
 * Reported arrival remains a client field and is not used for FY/serial.
 *
 * Stored-byte open uses the bound bucket, object path, and actual generation
 * from object metadata. Reads stop at MAX_PDF_ORIGINAL_BYTES.
 *
 * Do not import tools/, Expo, React, @/config, or localDb.
 */
import { randomBytes, randomUUID } from "node:crypto";

import { getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

import { createComposedGrinCallables, type ComposedGrinCallables } from "./composed";
import { HASH_CHUNK_BYTES, MAX_PDF_ORIGINAL_BYTES } from "./evidence";
import { GoodsEvidenceRegisterAdapter } from "./g1/adapter";
import type { G1Firestore, G1Transaction } from "./g1/types";
import { GoodsEvidenceStorageAdapter } from "./g2/adapter";
import type { G2BlobStore, G2Clock, G2Firestore, G2Transaction } from "./g2/types";
import {
  resolveGrinAdminBinding,
  type GrinAdminAppLike,
  type GrinAdminAppPorts,
} from "./productionAdminConfig";

export {
  GRIN_ADMIN_CONFIG_CODES,
  GRIN_ADMIN_DEFAULT_APP_NAME,
  GrinAdminConfigError,
  ISOLATED_FUNCTIONS_PROJECT,
  ISOLATED_STORAGE_BUCKET,
  preflightGrinAdminBinding,
  resolveGrinAdminBinding,
} from "./productionAdminConfig";
export type {
  GrinAdminAppLike,
  GrinAdminAppPorts,
  GrinAdminBindingPreflight,
  GrinAdminConfigCode,
  ResolvedGrinAdminBinding,
} from "./productionAdminConfig";

export const PRODUCTION_COMPOSITION_KIND = "PRODUCTION_ADMIN_COMPOSED" as const;

type AdminDb = ReturnType<typeof getFirestore>;
type AdminBucket = ReturnType<ReturnType<typeof getStorage>["bucket"]>;

export type GrinAdminRuntimePorts = GrinAdminAppPorts & {
  getFirestore(app: GrinAdminAppLike): AdminDb;
  getStorage(app: GrinAdminAppLike): { bucket(name: string): AdminBucket };
};

export function liveGrinAdminRuntimePorts(): GrinAdminRuntimePorts {
  return {
    getApps: () => getApps(),
    initializeApp: (options) => initializeApp(options),
    getFirestore: (app) => getFirestore(app as App),
    getStorage: (app) => getStorage(app as App),
  };
}

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

function wrapAdminBlobStore(bucket: AdminBucket): G2BlobStore {
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
    async open(path, generation) {
      const file = bucket.file(path);
      const [exists] = await file.exists();
      if (!exists) return null;
      const [meta] = await file.getMetadata();
      const actualGeneration = String(meta.generation);
      if (generation && actualGeneration !== String(generation)) return null;
      const byteSize = Number(meta.size);
      if (!Number.isFinite(byteSize) || byteSize < 1 || byteSize > MAX_PDF_ORIGINAL_BYTES) {
        return null;
      }
      const stream = file.createReadStream();
      async function* chunks(): AsyncGenerator<Uint8Array> {
        let running = 0;
        try {
          for await (const piece of stream) {
            const buf = piece instanceof Uint8Array ? piece : Uint8Array.from(piece);
            running += buf.byteLength;
            if (running > MAX_PDF_ORIGINAL_BYTES) {
              return;
            }
            for (let i = 0; i < buf.byteLength; i += HASH_CHUNK_BYTES) {
              yield buf.subarray(i, Math.min(i + HASH_CHUNK_BYTES, buf.byteLength));
            }
          }
        } finally {
          const destroy = (stream as { destroy?: () => void }).destroy;
          if (typeof destroy === "function") destroy.call(stream);
        }
      }
      return {
        generation: actualGeneration,
        byteSize,
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

/**
 * Real Admin Firestore/Storage adapters + composed callables.
 * Fail-closed unless GRIN_GOODS_EVIDENCE_FUNCTIONS === "true" (composed.ts).
 * Firestore and Storage bind to the same resolved default Admin app.
 */
export function createProductionGrinCallables(
  env: NodeJS.ProcessEnv = process.env,
  ports: GrinAdminRuntimePorts = liveGrinAdminRuntimePorts()
): ComposedGrinCallables {
  const binding = resolveGrinAdminBinding(env, ports);
  const db = ports.getFirestore(binding.app);
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    // settings may only be applied once per process
  }
  const bucket = ports.getStorage(binding.app).bucket(binding.storageBucket);
  const registerAdapter = new GoodsEvidenceRegisterAdapter(wrapG1Firestore(db), productionG1Clock());
  const storageAdapter = new GoodsEvidenceStorageAdapter(
    wrapG2Firestore(db),
    wrapAdminBlobStore(bucket),
    productionG2Clock()
  );
  const composed = createComposedGrinCallables({
    adapter: registerAdapter,
    evidence: storageAdapter,
    env,
  });
  return {
    ...composed,
    compositionKind: "UNDEPLOYED_COMPOSED",
    compositionLabel: `${PRODUCTION_COMPOSITION_KIND} / not live deploy / not functions\/src\/index.ts`,
  };
}
