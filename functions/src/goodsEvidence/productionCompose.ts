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
import type { Readable, Writable } from "node:stream";

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

function readBound(stream: Readable): AsyncIterable<Uint8Array> {
  let failed: Error | null = null;
  let rejectError: ((error: Error) => void) | null = null;
  const failedRead = new Promise<never>((_, reject) => {
    rejectError = reject;
  });
  failedRead.catch(() => undefined);
  stream.on("error", (error: Error) => {
    failed = asError(error);
    rejectError?.(failed);
  });
  return {
    async *[Symbol.asyncIterator]() {
      const iterator = stream[Symbol.asyncIterator]();
      try {
        while (!failed) {
          const next = await Promise.race([iterator.next(), failedRead]);
          if (failed) throw failed;
          if (next.done) return;
          const piece = next.value as Uint8Array | Buffer;
          yield piece instanceof Uint8Array ? piece : Uint8Array.from(piece);
        }
        throw failed;
      } finally {
        if (typeof iterator.return === "function") await iterator.return();
      }
    },
  };
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function destroyQuiet(stream: Readable | Writable | null): void {
  if (!stream) return;
  stream.on("error", () => undefined);
  stream.destroy();
}

function writeWithBackpressure(stream: Writable, chunk: Uint8Array): Promise<void> {
  const buf = Buffer.from(chunk);
  return new Promise((resolve, reject) => {
    let settled = false;
    let sawFinish = false;
    const onError = (error: Error) => settle(() => reject(asError(error)));
    const onDrain = () => settle(() => resolve());
    const onFinish = () => {
      sawFinish = true;
      settle(() => resolve());
    };
    const onClose = () => {
      if (!sawFinish) settle(() => reject(new Error("write_closed")));
    };
    const settle = (action: () => void) => {
      if (settled) return;
      settled = true;
      stream.removeListener("error", onError);
      stream.removeListener("drain", onDrain);
      stream.removeListener("finish", onFinish);
      stream.removeListener("close", onClose);
      action();
    };
    stream.on("error", onError);
    let accepted = false;
    try {
      accepted = stream.write(buf);
    } catch (error) {
      settle(() => reject(asError(error)));
      return;
    }
    if (settled) return;
    if (accepted) {
      settle(() => resolve());
      return;
    }
    stream.on("drain", onDrain);
    stream.on("finish", onFinish);
    stream.on("close", onClose);
  });
}

function finishWrite(stream: Writable): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let sawFinish = false;
    const onError = (error: Error) => settle(() => reject(asError(error)));
    const onFinish = () => {
      sawFinish = true;
      settle(() => resolve());
    };
    const onClose = () => {
      if (!sawFinish) settle(() => reject(new Error("write_closed")));
    };
    const settle = (action: () => void) => {
      if (settled) return;
      settled = true;
      stream.removeListener("error", onError);
      stream.removeListener("finish", onFinish);
      stream.removeListener("close", onClose);
      action();
    };
    if (stream.writableFinished) {
      resolve();
      return;
    }
    stream.on("error", onError);
    stream.on("finish", onFinish);
    stream.on("close", onClose);
    try {
      stream.end();
    } catch (error) {
      settle(() => reject(asError(error)));
    }
  });
}

/** Replaces one pending generation with ciphertext. Each attempt owns its temp object. */
async function sealPendingEvidence(
  bucket: AdminBucket,
  path: string,
  env: NodeJS.ProcessEnv,
  expectedGeneration: string
): Promise<string> {
  const uid = path.split("/")[1] ?? "";
  const key = loadContentKey(env);
  const [before] = await bucket.file(path).getMetadata();
  if (before.generation == null || String(before.generation) !== expectedGeneration) {
    throw new Error("generation_conflict");
  }
  const sourceGeneration = expectedGeneration;
  const attemptId = randomBytes(16).toString("hex");
  const tempPath = `${path}.vyd-seal.${sourceGeneration}.${attemptId}`;
  let sourceStream: Readable | null = null;
  let out: Writable | null = null;
  let writeError: Error | null = null;
  let tempGeneration: string | null = null;
  let tempStarted = false;
  try {
    const reading = bucket.file(path, { generation: sourceGeneration }).createReadStream();
    sourceStream = reading;
    const temp = bucket.file(tempPath);
    tempStarted = true;
    const writing = temp.createWriteStream({
      resumable: false,
      validation: false,
      metadata: { contentType: "application/octet-stream" },
      preconditionOpts: { ifGenerationMatch: 0 },
    });
    out = writing;
    writing.on("error", (error: Error) => {
      writeError = asError(error);
    });
    const hashes = await writeSealedEvidence({
      key,
      uid,
      storagePath: path,
      sourceGeneration,
      plaintext: readBound(reading),
      write: async (chunk) => {
        if (writeError) throw writeError;
        await writeWithBackpressure(writing, chunk);
        if (writeError) throw writeError;
      },
    });
    await finishWrite(writing);
    if (writeError) throw writeError;
    const sourceSize = Number(before.size);
    if (!Number.isInteger(sourceSize) || sourceSize < 1 || hashes.originalByteLength !== sourceSize) {
      throw new Error("content_tampered");
    }
    const [created] = await temp.getMetadata();
    if (created.generation == null || created.generation === "") throw new Error("generation_conflict");
    tempGeneration = String(created.generation);
    const tempBound = bucket.file(tempPath, { generation: tempGeneration });
    await tempBound.setMetadata({
      metadata: {
        vydEvidence: "sealed",
        vydCiphertextSha256: hashes.ciphertextSha256,
        vydOriginalSha256: hashes.originalSha256,
      },
    });
    if (writeError) throw writeError;
    await tempBound.copy(bucket.file(path), { preconditionOpts: { ifGenerationMatch: sourceGeneration } });
    const [after] = await bucket.file(path).getMetadata();
    if (String(after.generation) === sourceGeneration) throw new Error("generation_conflict");
    return String(after.generation);
  } catch (error) {
    destroyQuiet(out);
    destroyQuiet(sourceStream);
    throw error;
  } finally {
    destroyQuiet(sourceStream);
    if (tempGeneration !== null) {
      await bucket.file(tempPath, { generation: tempGeneration }).delete({ ignoreNotFound: true }).catch(() => undefined);
    } else if (tempStarted) {
      await bucket.file(tempPath).delete({ ignoreNotFound: true }).catch(() => undefined);
    }
  }
}

async function closePlaintext(generator: AsyncGenerator<Uint8Array, {
  kind: "legacy" | "sealed";
  originalSha256: string;
  ciphertextSha256: string | null;
  sourceGeneration: string | null;
}>): Promise<void> {
  await generator.return({
    kind: "legacy",
    originalSha256: "",
    ciphertextSha256: null,
    sourceGeneration: null,
  }).catch(() => undefined);
}

function contentKeyOrNull(env: NodeJS.ProcessEnv): Buffer | null {
  try {
    return loadContentKey(env);
  } catch {
    return null;
  }
}

async function* evidencePlaintextChunks(
  file: ReturnType<AdminBucket["file"]>,
  path: string,
  env: NodeJS.ProcessEnv,
  requiredSourceGeneration?: string
): AsyncGenerator<Uint8Array> {
  const uid = path.split("/")[1] ?? "";
  const stream = file.createReadStream();
  const generator = iterateEvidencePlaintext({
    key: contentKeyOrNull(env),
    uid,
    storagePath: path,
    stored: readBound(stream),
  });
  try {
    let step = await generator.next();
    while (!step.done) {
      const next = step.value;
      for (let i = 0; i < next.byteLength; i += HASH_CHUNK_BYTES) {
        yield next.subarray(i, Math.min(i + HASH_CHUNK_BYTES, next.byteLength));
      }
      step = await generator.next();
    }
    if (
      requiredSourceGeneration !== undefined &&
      (step.value.kind !== "sealed" || step.value.sourceGeneration !== requiredSourceGeneration)
    ) {
      throw new Error("content_tampered");
    }
  } finally {
    await closePlaintext(generator);
    destroyQuiet(stream);
  }
}

async function ciphertextMatchesSourceGeneration(
  file: ReturnType<AdminBucket["file"]>,
  path: string,
  env: NodeJS.ProcessEnv,
  requestedGeneration: string
): Promise<boolean> {
  const key = contentKeyOrNull(env);
  if (!key) return false;
  const uid = path.split("/")[1] ?? "";
  const stream = file.createReadStream();
  const generator = iterateEvidencePlaintext({
    key,
    uid,
    storagePath: path,
    stored: readBound(stream),
  });
  try {
    let step = await generator.next();
    while (!step.done) step = await generator.next();
    return step.value.kind === "sealed" && step.value.sourceGeneration === requestedGeneration;
  } catch {
    return false;
  } finally {
    await closePlaintext(generator);
    destroyQuiet(stream);
  }
}

export function wrapAdminBlobStore(bucket: AdminBucket, env: NodeJS.ProcessEnv): G2BlobStore {
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
      // Packaging asserts this exact parameter list. Recovery passes `{ sealPending: false }`
      // so a pending marker on a different generation cannot start a seal.
      const options = arguments[2] as { sealPending?: boolean } | undefined;
      const file = bucket.file(path);
      const [exists] = await file.exists();
      if (!exists) return null;
      let [meta] = await file.getMetadata();
      let actualGeneration = String(meta.generation);
      const storedLimit = MAX_PDF_ORIGINAL_BYTES + 64;
      const readableSize = (size: number) => Number.isFinite(size) && size >= 1 && size <= storedLimit;
      if (generation && actualGeneration !== String(generation)) {
        const byteSize = Number(meta.size);
        if (!readableSize(byteSize)) return null;
        const authenticated = await ciphertextMatchesSourceGeneration(
          bucket.file(path, { generation: actualGeneration }),
          path,
          env,
          String(generation)
        );
        if (!authenticated) return null;
        const [after] = await file.getMetadata();
        const afterGeneration = String(after.generation);
        const afterSize = Number(after.size);
        if (afterGeneration !== actualGeneration || !readableSize(afterSize)) return null;
        return {
          generation: afterGeneration,
          byteSize: afterSize,
          contentType: String(after.contentType ?? ""),
          chunks: evidencePlaintextChunks(
            bucket.file(path, { generation: afterGeneration }),
            path,
            env,
            String(generation)
          ),
        };
      }
      if (
        options?.sealPending !== false &&
        generation &&
        evidenceMarker(meta) === "pending" &&
        actualGeneration === String(generation)
      ) {
        actualGeneration = await sealPendingEvidence(bucket, path, env, actualGeneration);
        [meta] = await file.getMetadata();
        if (String(meta.generation) !== actualGeneration) return null;
      } else if (options?.sealPending === false && evidenceMarker(meta) === "pending") {
        return null;
      }
      const byteSize = Number(meta.size);
      if (!readableSize(byteSize)) return null;
      return {
        generation: actualGeneration,
        byteSize,
        contentType: String(meta.contentType ?? ""),
        chunks: evidencePlaintextChunks(bucket.file(path, { generation: actualGeneration }), path, env),
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
