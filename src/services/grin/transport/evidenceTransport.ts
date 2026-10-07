/**
 * Mobile-safe JS evidence transport.
 *
 * Hashing/sniffing use FileHandle reads of HASH_CHUNK_BYTES / 16 bytes.
 * Upload uses Expo `File` (Blob) with Firebase `uploadBytesResumable`.
 * That API slices a Blob per resumable chunk; it does **not** prove bounded
 * JS or native peak memory. Avoidable full-file base64 expansion is removed.
 *
 * JS allocations in the production path:
 * - mime sniff: MIME_SNIFF_BYTES (16)
 * - hasher (outbox): HASH_CHUNK_BYTES (64 KiB) via FileHandle
 * - upload: Expo File Blob handed to Firebase. Worst-case JS copy remains
 *   unmeasured on device. Enforced ceiling MAX_PDF_ORIGINAL_BYTES (15 MiB)
 *   / MAX_IMAGE_ORIGINAL_BYTES (10 MiB) and MAX_CONCURRENT_UPLOADS_PER_OWNER=2.
 * - Test injections may still pass a full Uint8Array up to that ceiling.
 *
 * Device peak-memory acceptance is G6 pending. Isolation: Firebase JS client
 * only. No Admin SDK, node:fs, HostSqlite, or tools/goods-evidence-* adapters.
 */

import { getFunctions, httpsCallable } from "firebase/functions";
import { getStorage, ref, uploadBytesResumable, getMetadata } from "firebase/storage";

import { env } from "@/config/env";
import { getFirebaseApp, getFirebaseAuth, getFirebaseStorage } from "@/config/firebase";
import {
  MIME_SNIFF_BYTES,
  iterateBoundedChunks,
  readPrefixFromHandle,
} from "@/goodsEvidence/boundedRead";
import {
  MAX_PDF_ORIGINAL_BYTES,
  isAllowedOriginalMime,
  isSha256Hex,
  isWave1OriginalCategory,
  maxBytesForOriginalMime,
  originalSizeError,
  type AllowedOriginalMime,
} from "@/goodsEvidence/evidence";
import { createGrinSha256ChunkHasher } from "@/screens/grin/grinOriginalHash";
import { canonicalFunctionsRegion } from "@/services/auth/authFlowErrorPresentation";
import type {
  GrinEvidenceUploadInput,
  GrinEvidenceUploadPort,
  GrinEvidenceUploadResult,
} from "@/services/grin/outbox/ports";
import { nonDurableEvidenceUploadResult } from "@/services/grin/outbox/ports";

import {
  GRIN_BEGIN_EVIDENCE_CALLABLE,
  GRIN_RESERVE_EVIDENCE_CALLABLE,
  GRIN_UPLOAD_EVIDENCE_CALLABLE,
  type GrinHttpsEvidenceLifecyclePayload,
  type GrinHttpsEvidenceReservePayload,
} from "./callableNames";
import type { FirebaseGrinTransportDeps, GrinAuthSnapshot } from "./firebaseTransport";
import { mapCallableFailure } from "./parseRemote";

const GENERIC_UNEXPORTED: GrinEvidenceUploadResult = nonDurableEvidenceUploadResult(true);

function closed(retryable: boolean): GrinEvidenceUploadResult {
  return { ...GENERIC_UNEXPORTED, retryable };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export type EvidenceObjectPutResult = { generation: string };

export type EvidenceObjectPutInput = {
  storagePath: string;
  contentType: string;
  /** Test injection. Production passes `localPath` instead of a JS copy of the file. */
  bytes?: Uint8Array;
  localPath?: string;
};

export type FirebaseGrinEvidenceTransportDeps = FirebaseGrinTransportDeps & {
  /**
   * Test/host injection. When present, the full retained file is materialized
   * up to MAX_PDF_ORIGINAL_BYTES. Production omits this and uses FileHandle
   * prefix + Expo File Blob upload.
   */
  readLocalBytes?: (localPath: string) => Promise<Uint8Array>;
  readPrefix?: (localPath: string) => Promise<Uint8Array>;
  fileSize?: (localPath: string) => Promise<number | null>;
  putObject: (input: EvidenceObjectPutInput) => Promise<EvidenceObjectPutResult>;
};

export type FirebaseGrinEvidenceTransport = GrinEvidenceUploadPort & {
  portKind: "INJECTED";
  transportKind: "FIREBASE_JS_HTTPS_CALLABLE";
  compositionLabel: "not live deploy; fail-closed when unexported";
};

function parseEvidenceUploadResult(value: unknown): GrinEvidenceUploadResult {
  if (!isPlainObject(value) || typeof value.ok !== "boolean") return closed(false);
  if (value.ok !== true || value.originalDurable !== true) {
    return {
      ...nonDurableEvidenceUploadResult(value.retryable === true),
    };
  }
  if (typeof value.evidenceId !== "string" || value.evidenceId.length === 0) return closed(false);
  if (typeof value.receiptId !== "string" || value.receiptId.length === 0) return closed(false);
  if (typeof value.ledgerId !== "string" || value.ledgerId.length === 0) return closed(false);
  if (typeof value.ownerUid !== "string" || value.ownerUid.length === 0) return closed(false);
  if (!isWave1OriginalCategory(value.category)) return closed(false);
  if (!isAllowedOriginalMime(value.mime)) return closed(false);
  if (typeof value.sizeBytes !== "number" || !Number.isInteger(value.sizeBytes) || value.sizeBytes < 1) {
    return closed(false);
  }
  if (typeof value.storagePath !== "string" || value.storagePath.length === 0) return closed(false);
  if (typeof value.generation !== "string" || value.generation.length === 0 || value.generation === "verified") {
    return closed(false);
  }
  if (typeof value.actualSha256 !== "string" || !isSha256Hex(value.actualSha256)) return closed(false);
  const claimed = value.claimedSha256;
  if (claimed !== null && (typeof claimed !== "string" || !isSha256Hex(claimed))) return closed(false);
  const reservationId = value.reservationId;
  if (typeof reservationId !== "string" || reservationId.length === 0) return closed(false);
  return {
    ok: true,
    originalDurable: true,
    generation: value.generation,
    retryable: false,
    ownerUid: value.ownerUid,
    mime: value.mime,
    sizeBytes: value.sizeBytes,
    storagePath: value.storagePath,
    evidenceId: value.evidenceId,
    receiptId: value.receiptId,
    ledgerId: value.ledgerId,
    category: value.category,
    claimedSha256: typeof claimed === "string" ? claimed : null,
    actualSha256: value.actualSha256,
    reservationId,
  };
}

function parseReserveResult(
  value: unknown
): { ok: true; storagePath: string; evidenceId: string } | { ok: false; retryable: boolean } {
  if (!isPlainObject(value) || value.ok !== true) {
    const retryable = isPlainObject(value) && (value.retryable === true || value.code === "not_found");
    return { ok: false, retryable };
  }
  if (typeof value.storagePath !== "string" || value.storagePath.length === 0) {
    return { ok: false, retryable: false };
  }
  if (typeof value.evidenceId !== "string" || value.evidenceId.length === 0) {
    return { ok: false, retryable: false };
  }
  return { ok: true, storagePath: value.storagePath, evidenceId: value.evidenceId };
}

function sniffOriginalMime(bytes: Uint8Array): AllowedOriginalMime | null {
  if (bytes.byteLength >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return "application/pdf";
  }
  if (bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.byteLength >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (
    bytes.byteLength >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

async function sha256HexBytes(bytes: Uint8Array): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const copy = Uint8Array.from(bytes);
  const digest = await subtle.digest("SHA-256", copy.buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function stillOwner(deps: FirebaseGrinTransportDeps, uid: string): boolean {
  const current = deps.currentAuth();
  return current != null && current.uid.length > 0 && current.uid === uid;
}

async function invoke(
  deps: FirebaseGrinTransportDeps,
  uid: string,
  name: string,
  payload: unknown
): Promise<{ ok: true; raw: unknown } | { ok: false; retryable: boolean }> {
  if (!stillOwner(deps, uid)) return { ok: false, retryable: false };
  let raw: unknown;
  try {
    raw = await deps.call(name, payload);
  } catch (err) {
    const mapped = mapCallableFailure(err);
    if (mapped) return { ok: false, retryable: mapped.code !== "unauthenticated" };
    throw err;
  }
  if (!stillOwner(deps, uid)) return { ok: false, retryable: false };
  return { ok: true, raw };
}

export function createFirebaseGrinEvidenceTransport(
  deps: FirebaseGrinEvidenceTransportDeps
): FirebaseGrinEvidenceTransport {
  const port: FirebaseGrinEvidenceTransport = {
    portKind: "INJECTED",
    transportKind: "FIREBASE_JS_HTTPS_CALLABLE",
    compositionLabel: "not live deploy; fail-closed when unexported",
    async upload(input: GrinEvidenceUploadInput): Promise<GrinEvidenceUploadResult> {
      if (!stillOwner(deps, input.uid)) return closed(false);
      if (input.role === "thumbnail" || input.role === "metadata") {
        return closed(true);
      }
      if (!isWave1OriginalCategory(input.category)) return closed(false);

      let bytes: Uint8Array | null = null;
      let mime: AllowedOriginalMime | null = null;
      let sizeBytes = 0;
      if (deps.readLocalBytes) {
        try {
          bytes = await deps.readLocalBytes(input.localPath);
        } catch {
          return closed(true);
        }
        if (!stillOwner(deps, input.uid)) return closed(false);
        if (bytes.byteLength > MAX_PDF_ORIGINAL_BYTES) return closed(false);
        mime = sniffOriginalMime(bytes);
        sizeBytes = bytes.byteLength;
      } else {
        try {
          const prefix = deps.readPrefix
            ? await deps.readPrefix(input.localPath)
            : await defaultReadPrefix(input.localPath);
          const measured = deps.fileSize
            ? await deps.fileSize(input.localPath)
            : await defaultFileSize(input.localPath);
          mime = sniffOriginalMime(prefix);
          sizeBytes = measured ?? 0;
        } catch {
          return closed(true);
        }
        if (!stillOwner(deps, input.uid)) return closed(false);
      }
      if (!mime || !isAllowedOriginalMime(mime)) return closed(false);
      if (originalSizeError(mime, sizeBytes)) return closed(false);
      if (input.sizeBytes > 0 && input.sizeBytes !== sizeBytes) return closed(false);

      let claimed = input.claimedSha256;
      if (claimed && isSha256Hex(claimed.toLowerCase())) {
        claimed = claimed.toLowerCase();
      } else if (bytes) {
        claimed = await sha256HexBytes(bytes);
      } else {
        claimed = await defaultHashLocalPath(input.localPath, maxBytesForOriginalMime(mime));
      }
      if (!claimed || !isSha256Hex(claimed)) return closed(true);
      if (!stillOwner(deps, input.uid)) return closed(false);

      const reservePayload: GrinHttpsEvidenceReservePayload = {
        ledgerId: input.ledgerId,
        receiptId: input.receiptId,
        evidenceId: input.evidenceId,
        category: input.category,
        mime,
        claimedSha256: claimed,
        claimedByteSize: sizeBytes,
      };
      const reservedCall = await invoke(deps, input.uid, GRIN_RESERVE_EVIDENCE_CALLABLE, reservePayload);
      if (!reservedCall.ok) return closed(reservedCall.retryable);
      const reserved = parseReserveResult(reservedCall.raw);
      if (!reserved.ok) return closed(reserved.retryable);

      const lifecycle: GrinHttpsEvidenceLifecyclePayload = {
        ledgerId: input.ledgerId,
        receiptId: input.receiptId,
        evidenceId: input.evidenceId,
      };
      const began = await invoke(deps, input.uid, GRIN_BEGIN_EVIDENCE_CALLABLE, lifecycle);
      if (!began.ok) return closed(began.retryable);
      if (isPlainObject(began.raw) && began.raw.ok === false) {
        return closed(began.raw.retryable === true);
      }

      try {
        await deps.putObject({
          storagePath: reserved.storagePath,
          contentType: mime,
          bytes: bytes ?? undefined,
          localPath: input.localPath,
        });
      } catch {
        // Object may already exist from a lost response. Verify still hashes stored bytes.
      }
      if (!stillOwner(deps, input.uid)) return closed(false);

      const verifiedCall = await invoke(deps, input.uid, GRIN_UPLOAD_EVIDENCE_CALLABLE, lifecycle);
      if (!verifiedCall.ok) return closed(verifiedCall.retryable);
      return parseEvidenceUploadResult(verifiedCall.raw);
    },
  };
  return port;
}

function defaultCall(name: string, data: unknown): Promise<unknown> {
  const region = canonicalFunctionsRegion(env.firebase.functionsRegion);
  const callable = httpsCallable(getFunctions(getFirebaseApp(), region || undefined), name);
  return callable(data).then((result) => result.data);
}

function defaultCurrentAuth(): GrinAuthSnapshot {
  const uid = getFirebaseAuth().currentUser?.uid;
  return uid ? { uid } : null;
}

async function defaultReadPrefix(localPath: string): Promise<Uint8Array> {
  const { File } = await import("expo-file-system");
  const file = new File(localPath);
  if (!file.exists) throw new Error("missing local original");
  return readPrefixFromHandle(() => file.open(), MIME_SNIFF_BYTES);
}

async function defaultFileSize(localPath: string): Promise<number | null> {
  const { File } = await import("expo-file-system");
  const file = new File(localPath);
  if (!file.exists) return null;
  const size = file.size;
  return typeof size === "number" && Number.isInteger(size) && size > 0 ? size : null;
}

async function defaultHashLocalPath(localPath: string, maxBytes: number): Promise<string> {
  const { File } = await import("expo-file-system");
  const file = new File(localPath);
  if (!file.exists) throw new Error("missing local original");
  const hasher = createGrinSha256ChunkHasher();
  for await (const chunk of iterateBoundedChunks(() => file.open(), { maxBytes })) {
    hasher.update(chunk);
  }
  return hasher.digestHex();
}

async function defaultPutObject(input: EvidenceObjectPutInput): Promise<EvidenceObjectPutResult> {
  const storage = getFirebaseStorage();
  const objectRef = ref(storage, input.storagePath);
  let data: Blob | Uint8Array;
  if (input.bytes) {
    if (input.bytes.byteLength > MAX_PDF_ORIGINAL_BYTES) throw new Error("too_large");
    data = input.bytes;
  } else if (input.localPath) {
    const { File } = await import("expo-file-system");
    data = new File(input.localPath);
  } else {
    throw new Error("missing local original");
  }
  const task = uploadBytesResumable(objectRef, data, { contentType: input.contentType });
  await new Promise<void>((resolve, reject) => {
    task.on("state_changed", undefined, reject, () => resolve());
  });
  const meta = await getMetadata(objectRef);
  return { generation: String(meta.generation ?? "") };
}

/** Production-shaped JS client. Callables remain unexported / undeployed. */
export function createFirebaseJsGrinEvidenceTransport(): FirebaseGrinEvidenceTransport {
  return createFirebaseGrinEvidenceTransport({
    call: defaultCall,
    currentAuth: defaultCurrentAuth,
    putObject: defaultPutObject,
    readPrefix: defaultReadPrefix,
    fileSize: defaultFileSize,
  });
}

/** Test-only Storage helper using an already-connected Firebase JS app. */
export async function putReservedObjectWithJsStorage(input: {
  storage: ReturnType<typeof getStorage>;
  storagePath: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<EvidenceObjectPutResult> {
  const objectRef = ref(input.storage, input.storagePath);
  const task = uploadBytesResumable(objectRef, input.bytes, { contentType: input.contentType });
  await new Promise<void>((resolve, reject) => {
    task.on("state_changed", undefined, reject, () => resolve());
  });
  const meta = await getMetadata(objectRef);
  return { generation: String(meta.generation ?? "") };
}
