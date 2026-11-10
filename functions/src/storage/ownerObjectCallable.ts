/**
 * Production callable for owner object transfer.
 * Identity is the verified bearer subject. The handler does not read a payload uid
 * as authority. The upload ticket can create a staging object once. The read ticket
 * lasts one minute and is not cancelled when the session ends.
 */

import { createHash, randomBytes } from "node:crypto";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";

import { getAdminBucket, getAdminDb } from "../admin";
import { assertAdmittedCallableUser } from "../identity/admitCallableUser";
import {
  admissionPath,
  evidenceObjectPath,
  ledgerPath,
  objectKeyPath,
  receiptPath,
  userPath,
} from "../goodsEvidence/g2/paths";
import {
  OBJECT_TRANSFER_CREATE_HEADER,
  OBJECT_TRANSFER_CREATE_HEADER_VALUE,
  evaluateGrinUploadAuthority,
  performOwnerObjectTransfer,
  type AttemptTransitionResult,
  type CopyGenerationResult,
  type GrinTransferScope,
  type OwnerObjectPorts,
  type StoredGeneration,
  type TransferAttempt,
  type TransferAttemptStatus,
  type TransferRequest,
  type TransferResult,
} from "./ownerObjectTransfer";

type FileMetadata = {
  generation?: string | number;
  size?: string | number;
  contentType?: string;
  metadata?: Record<string, string>;
};

type GenerationFile = {
  exists(): Promise<[boolean]>;
  getMetadata(): Promise<[FileMetadata]>;
  download(options: { start: number; end: number }): Promise<[Buffer]>;
  createReadStream(): AsyncIterable<Buffer>;
  getSignedUrl(config: {
    version: "v4";
    action: "read" | "write";
    expires: number;
    contentType?: string;
    extensionHeaders?: Record<string, string>;
  }): Promise<[string]>;
  copy(
    destination: GenerationFile,
    options: {
      preconditionOpts: { ifGenerationMatch: string };
      metadata: { contentType: string; metadata: Record<string, string> };
    }
  ): Promise<[GenerationFile, { generation?: string | number } | undefined]>;
  delete(): Promise<unknown>;
  name?: string;
  metadata?: FileMetadata;
};

export type ObjectBucket = {
  file(path: string, options?: { generation?: string }): GenerationFile;
  getFiles(query: { prefix: string; versions: true; autoPaginate?: boolean }): Promise<[GenerationFile[]]>;
};

type AttemptDb = {
  collection(path: string): {
    doc(id: string): {
      get(): Promise<{ exists: boolean; data(): TransferAttempt | undefined }>;
    };
  };
  doc(path: string): { get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }> };
  runTransaction<T>(fn: (tx: {
    get(ref: { get(): Promise<{ exists: boolean; data(): TransferAttempt | undefined }> }): Promise<{ exists: boolean; data(): TransferAttempt | undefined }>;
    set(ref: unknown, data: TransferAttempt): void;
  }) => Promise<T>): Promise<T>;
};

function asRecord(data: unknown): Record<string, unknown> {
  return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

function metadataOf(meta: FileMetadata | undefined): Record<string, string> {
  const source = meta?.metadata ?? {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

function generationOf(meta: FileMetadata | undefined): string {
  if (meta?.generation == null) return "";
  return String(meta.generation);
}

function storedFrom(file: GenerationFile, meta: FileMetadata): StoredGeneration | null {
  const generation = generationOf(meta);
  const size = Number(meta.size);
  if (!generation || !Number.isFinite(size)) return null;
  return {
    generation,
    size,
    contentType: String(meta.contentType ?? ""),
    metadata: metadataOf(meta),
  };
}

function mapFailure(result: Extract<TransferResult, { ok: false }>): HttpsError {
  if (result.code === "denied") return new HttpsError("permission-denied", "object_denied");
  if (result.code === "not_found") return new HttpsError("not-found", "object_not_found");
  if (result.code === "conflict") return new HttpsError("aborted", "object_conflict");
  if (result.code === "expired") return new HttpsError("failed-precondition", "object_transfer_expired");
  if (result.code === "unknown") return new HttpsError("unavailable", "object_transfer_unknown");
  return new HttpsError("invalid-argument", `object_${result.code}`);
}

function errorCode(error: unknown): number {
  if (!error || typeof error !== "object" || !("code" in error)) return 0;
  return Number((error as { code: unknown }).code);
}

type GenerationRequest = {
  qs?: Record<string, unknown>;
};

/**
 * `@google-cloud/storage` stores `file(path, { generation })` with `Number(generation)`.
 * Generations above 2^53-1 change value. Copy reads `file.generation` when the
 * request is built; metadata and delete close over the coerced query at construction.
 * Put the original string back on the file and on the outgoing query.
 */
function exactGenerationFile(bucket: ObjectBucket, path: string, generation: string): GenerationFile {
  const file = bucket.file(path, { generation });
  const target = file as GenerationFile & {
    generation?: string | number;
    interceptors?: Array<{ request: (req: GenerationRequest) => GenerationRequest }>;
  };
  target.generation = generation;
  if (Array.isArray(target.interceptors)) {
    const coerced = String(Number(generation));
    target.interceptors.push({
      request(req) {
        const qs = (req.qs ??= {});
        if (qs.generation != null) qs.generation = generation;
        if (qs.sourceGeneration != null) qs.sourceGeneration = generation;
        if (qs.ifGenerationMatch != null && coerced !== generation && String(qs.ifGenerationMatch) === coerced) {
          qs.ifGenerationMatch = generation;
        }
        return req;
      },
    });
  }
  return file;
}

export async function loadGrinUploadAuthority(
  db: { doc(path: string): { get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }> } },
  uid: string,
  scope: GrinTransferScope,
  storagePath: string,
  objectKey: string
): Promise<boolean> {
  const [user, ledger, admission, receipt, evidence, objectKeyDoc] = await Promise.all([
    db.doc(userPath(uid)).get(),
    db.doc(ledgerPath(uid, scope.ledgerId)).get(),
    db.doc(admissionPath(uid)).get(),
    db.doc(receiptPath(uid, scope.ledgerId, scope.receiptId)).get(),
    db.doc(evidenceObjectPath(uid, scope.ledgerId, scope.evidenceId)).get(),
    db.doc(objectKeyPath(uid, objectKey)).get(),
  ]);
  return evaluateGrinUploadAuthority({
    uid,
    ledgerId: scope.ledgerId,
    receiptId: scope.receiptId,
    evidenceId: scope.evidenceId,
    objectKey,
    storagePath,
    user: user.exists ? user.data() ?? null : null,
    ledger: ledger.exists ? ledger.data() ?? null : null,
    admission: admission.exists ? admission.data() ?? null : null,
    receiptExists: receipt.exists,
    evidence: evidence.exists ? evidence.data() ?? null : null,
    objectKeyDoc: objectKeyDoc.exists ? objectKeyDoc.data() ?? null : null,
  });
}

export function createOwnerObjectPorts(deps: {
  db: AttemptDb;
  bucket: ObjectBucket;
  admitSession: () => Promise<boolean>;
  admitRestore: () => Promise<boolean>;
  now?: () => number;
  newAttemptId?: () => string;
  newClaim?: () => string;
}): OwnerObjectPorts {
  const db = deps.db;
  const bucket = deps.bucket;

  async function readGeneration(path: string, generation: string): Promise<StoredGeneration | null> {
    const target = exactGenerationFile(bucket, path, generation);
    const [exists] = await target.exists();
    if (!exists) return null;
    const [meta] = await target.getMetadata();
    const stored = storedFrom(target, meta);
    if (!stored || stored.generation !== generation) return null;
    return stored;
  }

  return {
    now: deps.now ?? (() => Date.now()),
    newAttemptId: deps.newAttemptId ?? (() => randomBytes(16).toString("hex")),
    newClaim: deps.newClaim ?? (() => randomBytes(16).toString("hex")),
    admitSession: deps.admitSession,
    admitRestore: deps.admitRestore,
    async readAccount(uid) {
      const snap = await db.doc(userPath(uid)).get();
      return snap.exists ? (snap.data() as { status?: unknown }) : null;
    },
    async readDeletion(uid) {
      const snap = await db.doc(`deletionJobs/${uid}`).get();
      return snap.exists ? (snap.data() as { status?: unknown }) : null;
    },
    async authorizeGrin(attempt) {
      if (!attempt.grin) return false;
      const objectKey = attempt.path.split("/")[3] ?? "";
      return loadGrinUploadAuthority(db, attempt.uid, attempt.grin, attempt.path, objectKey);
    },
    async createAttempt(attempt) {
      const ref = db.collection("ownerObjectTransfers").doc(attempt.attemptId);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists) return "exists" as const;
        tx.set(ref, attempt);
        return "created" as const;
      });
    },
    async readAttempt(attemptId) {
      const snap = await db.collection("ownerObjectTransfers").doc(attemptId).get();
      return snap.exists ? (snap.data() as TransferAttempt) : null;
    },
    async transition(attemptId, from, expectedClaim, next) {
      const ref = db.collection("ownerObjectTransfers").doc(attemptId);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return { applied: false, attempt: null } satisfies AttemptTransitionResult;
        const current = snap.data() as TransferAttempt;
        if (!from.includes(current.status)) return { applied: false, attempt: current };
        if (expectedClaim != null && current.publicationClaim !== expectedClaim) {
          return { applied: false, attempt: current };
        }
        const updated = next(current);
        tx.set(ref, updated);
        return { applied: true, attempt: updated } satisfies AttemptTransitionResult;
      });
    },
    async signUpload(stagingPath, contentType, expiresAt) {
      const requiredHeaders = { [OBJECT_TRANSFER_CREATE_HEADER]: OBJECT_TRANSFER_CREATE_HEADER_VALUE };
      const [url] = await bucket.file(stagingPath).getSignedUrl({
        version: "v4",
        action: "write",
        expires: expiresAt,
        contentType,
        extensionHeaders: requiredHeaders,
      });
      return { url, requiredHeaders };
    },
    async signRead(path, generation, expiresAt) {
      const [url] = await exactGenerationFile(bucket, path, generation).getSignedUrl({
        version: "v4",
        action: "read",
        expires: expiresAt,
      });
      return url;
    },
    async listGenerations(path) {
      const [files] = await bucket.getFiles({ prefix: path, versions: true, autoPaginate: true });
      const listed: StoredGeneration[] = [];
      for (const file of files) {
        if (file.name != null && file.name !== path) continue;
        const meta = file.metadata?.generation != null ? file.metadata : (await file.getMetadata())[0];
        const stored = storedFrom(file, meta);
        if (stored) listed.push(stored);
      }
      return listed;
    },
    readGeneration,
    async readBytes(path, generation, length) {
      const target = exactGenerationFile(bucket, path, generation);
      const [exists] = await target.exists();
      if (!exists) return null;
      const [data] = await target.download({ start: 0, end: Math.max(0, length - 1) });
      return new Uint8Array(data.subarray(0, length));
    },
    async hashGeneration(path, generation, maxBytes) {
      const target = exactGenerationFile(bucket, path, generation);
      const [exists] = await target.exists();
      if (!exists) return null;
      const hash = createHash("sha256");
      let seen = 0;
      for await (const chunk of target.createReadStream()) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        seen += bytes.length;
        if (seen > maxBytes) return null;
        hash.update(bytes);
      }
      if (seen < 1) return null;
      return hash.digest("hex");
    },
    async copyGeneration(input): Promise<CopyGenerationResult> {
      try {
        const source = exactGenerationFile(bucket, input.from, input.fromGeneration);
        const destination = bucket.file(input.to);
        const [copied, response] = await source.copy(destination, {
          preconditionOpts: { ifGenerationMatch: input.ifGenerationMatch },
          metadata: { contentType: input.contentType, metadata: input.metadata },
        });
        const generation = generationOf(copied.metadata) || (response?.generation == null ? "" : String(response.generation));
        if (!generation) return { outcome: "unknown" };
        const bound = await readGeneration(input.to, generation);
        if (!bound || bound.generation !== generation) return { outcome: "unknown" };
        return { outcome: "copied", generation: bound.generation, size: bound.size };
      } catch (error) {
        if (errorCode(error) === 412) return { outcome: "precondition" };
        return { outcome: "unknown" };
      }
    },
    async removeGeneration(path, generation) {
      try {
        await exactGenerationFile(bucket, path, generation).delete();
        return "removed";
      } catch (error) {
        const code = errorCode(error);
        if (code === 404) return "missing";
        if (code === 412) return "conflict";
        return "unknown";
      }
    },
  };
}

function grinFrom(data: Record<string, unknown>): GrinTransferScope | null {
  if (data.ledgerId == null && data.receiptId == null && data.evidenceId == null) return null;
  if (typeof data.ledgerId !== "string" || typeof data.receiptId !== "string" || typeof data.evidenceId !== "string") {
    return null;
  }
  return { ledgerId: data.ledgerId, receiptId: data.receiptId, evidenceId: data.evidenceId };
}

export async function handleOwnerObjectTransfer(
  request: CallableRequest,
  ports?: OwnerObjectPorts
): Promise<TransferResult> {
  const admitted = await assertAdmittedCallableUser(request);
  const uid = admitted?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const data = asRecord(request.data);
  const operation = data.operation;
  if (operation !== "begin" && operation !== "commit" && operation !== "abort" && operation !== "read" && operation !== "delete") {
    throw new HttpsError("invalid-argument", "object_invalid");
  }
  const activePorts = ports ?? createOwnerObjectPorts({
    db: getAdminDb() as unknown as AttemptDb,
    bucket: getAdminBucket() as unknown as ObjectBucket,
    admitSession: async () => {
      try {
        const again = await assertAdmittedCallableUser(request);
        return again?.uid === uid;
      } catch {
        return false;
      }
    },
    admitRestore: async () => {
      try {
        const again = await assertAdmittedCallableUser(request);
        return again?.uid === uid;
      } catch {
        return false;
      }
    },
  });
  const payload: TransferRequest = {
    uid,
    operation,
    path: typeof data.path === "string" ? data.path : undefined,
    contentType: typeof data.contentType === "string" ? data.contentType : undefined,
    attemptId: typeof data.attemptId === "string" ? data.attemptId : undefined,
    generation: typeof data.generation === "string" ? data.generation : undefined,
    payloadUid: typeof data.uid === "string" ? data.uid : undefined,
    grin: grinFrom(data),
  };
  const result = await performOwnerObjectTransfer(payload, activePorts);
  if (!result.ok) throw mapFailure(result);
  return result;
}

export const ownerObjectTransfer = onCall(
  { region: "asia-south1", timeoutSeconds: 60, memory: "256MiB" },
  async (request) => {
    await assertAdmittedCallableUser(request);
    return handleOwnerObjectTransfer(request);
  }
);

export type { TransferAttemptStatus };
