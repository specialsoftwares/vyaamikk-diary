/**
 * Production Admin composition for undeployed GRIN callables.
 *
 * Binds packaged G1/G2 adapters to one resolved Admin app's Firestore + Storage.
 * Project and bucket come from productionAdminConfig.ts. Production index
 * re-exports lazy onCall wrappers from productionExports.ts; it must not
 * call createProductionGrinCallables at module load. Isolated
 * Functions-emulator entry re-exports createProductionGrinCallables as
 * createIsolatedGrinCallables.
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

import { loadContentKey, openGrinCloudDocument, sealGrinCloudDocument } from "../privacy/contentEncryption";
import { iterateEvidencePlaintext, writeSealedEvidence } from "../privacy/grinEvidenceBytes";
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

/** Same write the production transaction uses. A key failure throws before persistence. */
export function stageGrinProductionWrite(
  path: string,
  data: Record<string, unknown>,
  env: NodeJS.ProcessEnv
): Record<string, unknown> {
  const plain = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
  return sealGrinCloudDocument(path, plain, env);
}

export function readGrinProductionDocument(
  path: string,
  data: Record<string, unknown> | undefined,
  env: NodeJS.ProcessEnv
): Record<string, unknown> | undefined {
  return openGrinCloudDocument(path, data, env);
}

/**
 * Commit-on-success store with the production seal functions.
 * A thrown write discards every staged document, including serial and quota.
 */
export function createMemoryProductionGrinFirestore(env: NodeJS.ProcessEnv): {
  read(path: string): Record<string, unknown> | undefined;
  /** Stored bytes, including a sealed document the key can no longer open. */
  stored(path: string): Record<string, unknown> | undefined;
  seed(path: string, data: Record<string, unknown>): void;
  runTransaction<T>(fn: (tx: G1Transaction) => Promise<T>): Promise<T>;
} {
  const committed = new Map<string, Record<string, unknown>>();
  return {
    read(path) {
      return readGrinProductionDocument(path, committed.get(path), env);
    },
    stored(path) {
      const found = committed.get(path);
      return found ? { ...found } : undefined;
    },
    seed(path, data) {
      committed.set(path, JSON.parse(JSON.stringify(data)) as Record<string, unknown>);
    },
    async runTransaction(fn) {
      const staged = new Map(committed);
      const tx: G1Transaction = {
        async get(ref) {
          const data = staged.get(ref.path);
          return {
            exists: data != null,
            data: () => readGrinProductionDocument(ref.path, data, env),
          };
        },
        set(ref, data) {
          staged.set(ref.path, stageGrinProductionWrite(ref.path, data, env));
        },
        async list(_collectionPath: string) {
          return [];
        },
      };
      const result = await fn(tx);
      committed.clear();
      for (const [path, data] of staged) committed.set(path, data);
      return result;
    },
  };
}

function wrapG1Firestore(db: AdminDb, env: NodeJS.ProcessEnv): G1Firestore {
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
              data: () => openGrinCloudDocument(ref.path, snap.data() as Record<string, unknown> | undefined, env),
            };
          },
          set(ref, data) {
            tx.set(db.doc(ref.path), stageGrinProductionWrite(ref.path, data, env));
          },
          async list(collectionPath) {
            const querySnap = await tx.get(db.collection(collectionPath));
            return querySnap.docs.map((doc) => ({
              id: doc.id,
              path: doc.ref.path,
              exists: doc.exists,
              data: () => openGrinCloudDocument(doc.ref.path, doc.data() as Record<string, unknown> | undefined, env),
            }));
          },
        };
        return await fn(wrapped);
      }, options);
    },
  };
}

function wrapG2Firestore(db: AdminDb, env: NodeJS.ProcessEnv): G2Firestore {
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
              data: () => openGrinCloudDocument(ref.path, snap.data() as Record<string, unknown> | undefined, env),
            };
          },
          set(ref, data) {
            tx.set(db.doc(ref.path), stageGrinProductionWrite(ref.path, data, env));
          },
        };
        return await fn(wrapped);
      }, options);
    },
  };
}

function evidenceMarker(meta: { metadata?: { [key: string]: unknown } | null }): string {
  return String(meta.metadata?.vydEvidence ?? "");
}

async function* nodeChunks(stream: AsyncIterable<Uint8Array | Buffer>): AsyncGenerator<Uint8Array> {
  for await (const piece of stream) {
    yield piece instanceof Uint8Array ? piece : Uint8Array.from(piece);
  }
}

function writeWithBackpressure(stream: { write: (chunk: Buffer) => boolean; once: (event: "drain", fn: () => void) => void }, chunk: Uint8Array): Promise<void> {
  const buf = Buffer.from(chunk);
  if (stream.write(buf)) return Promise.resolve();
  return new Promise((resolve) => stream.once("drain", () => resolve()));
}

function finishWrite(stream: { end: (cb: () => void) => void; once: (event: "error", fn: (error: Error) => void) => void }): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.once("error", reject);
    stream.end(() => resolve());
  });
}

/** Replaces a pending plaintext upload with ciphertext. A failed copy leaves the pending object. */
async function sealPendingEvidence(
  bucket: AdminBucket,
  file: ReturnType<AdminBucket["file"]>,
  path: string,
  env: NodeJS.ProcessEnv
): Promise<string> {
  const uid = path.split("/")[1] ?? "";
  const key = loadContentKey(env);
  const [before] = await file.getMetadata();
  const sourceGeneration = Number(before.generation);
  const temp = bucket.file(`${path}.vyd-seal-tmp`);
  const out = temp.createWriteStream({ resumable: false, metadata: { contentType: "application/octet-stream" } });
  try {
    const hashes = await writeSealedEvidence({
      key,
      uid,
      storagePath: path,
      plaintext: nodeChunks(file.createReadStream()),
      write: (chunk) => writeWithBackpressure(out, chunk),
    });
    await finishWrite(out);
    await temp.setMetadata({
      metadata: {
        vydEvidence: "sealed",
        vydCiphertextSha256: hashes.ciphertextSha256,
        vydOriginalSha256: hashes.originalSha256,
      },
    });
    await temp.copy(file, { preconditionOpts: { ifGenerationMatch: sourceGeneration } });
  } catch (error) {
    await temp.delete({ ignoreNotFound: true }).catch(() => undefined);
    throw error;
  }
  await temp.delete({ ignoreNotFound: true }).catch(() => undefined);
  const [after] = await file.getMetadata();
  if (String(after.generation) === String(before.generation)) throw new Error("generation_conflict");
  return String(after.generation);
}

async function* legacyPlaintextChunks(file: ReturnType<AdminBucket["file"]>): AsyncGenerator<Uint8Array> {
  const stream = file.createReadStream();
  try {
    for await (const chunk of nodeChunks(stream)) {
      for (let i = 0; i < chunk.byteLength; i += HASH_CHUNK_BYTES) {
        yield chunk.subarray(i, Math.min(i + HASH_CHUNK_BYTES, chunk.byteLength));
      }
    }
  } finally {
    const destroy = (stream as { destroy?: () => void }).destroy;
    if (typeof destroy === "function") destroy.call(stream);
  }
}

async function* sealedPlaintextChunks(
  file: ReturnType<AdminBucket["file"]>,
  path: string,
  env: NodeJS.ProcessEnv
): AsyncGenerator<Uint8Array> {
  const uid = path.split("/")[1] ?? "";
  const key = loadContentKey(env);
  const generator = iterateEvidencePlaintext({
    key,
    uid,
    storagePath: path,
    stored: nodeChunks(file.createReadStream()),
  });
  let step = await generator.next();
  while (!step.done) {
    const next = step.value;
    for (let i = 0; i < next.byteLength; i += HASH_CHUNK_BYTES) {
      yield next.subarray(i, Math.min(i + HASH_CHUNK_BYTES, next.byteLength));
    }
    step = await generator.next();
  }
}

function wrapAdminBlobStore(bucket: AdminBucket, env: NodeJS.ProcessEnv): G2BlobStore {
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
      let [meta] = await file.getMetadata();
      let actualGeneration = String(meta.generation);
      if (generation && actualGeneration !== String(generation)) return null;
      const marker = evidenceMarker(meta);
      if (marker === "pending" && !generation) {
        actualGeneration = await sealPendingEvidence(bucket, file, path, env);
        [meta] = await file.getMetadata();
      }
      const byteSize = Number(meta.size);
      const storedLimit = MAX_PDF_ORIGINAL_BYTES + 64;
      if (!Number.isFinite(byteSize) || byteSize < 1 || byteSize > storedLimit) return null;
      const sealed = evidenceMarker(meta) === "sealed";
      return {
        generation: actualGeneration,
        byteSize,
        contentType: String(meta.contentType ?? ""),
        chunks: sealed ? sealedPlaintextChunks(file, path, env) : legacyPlaintextChunks(file),
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
  const registerAdapter = new GoodsEvidenceRegisterAdapter(wrapG1Firestore(db, env), productionG1Clock());
  const storageAdapter = new GoodsEvidenceStorageAdapter(
    wrapG2Firestore(db, env),
    wrapAdminBlobStore(bucket, env),
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
    compositionLabel: `${PRODUCTION_COMPOSITION_KIND} / not live deploy / lazy productionExports`,
  };
}
