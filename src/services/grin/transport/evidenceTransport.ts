/**
 * Mobile-safe JS evidence transport.
 *
 * Reserve via httpsCallable, upload retained bytes with Firebase JS Storage
 * (resumable; not a full-file base64 callable body), then verify stored bytes
 * via grinUploadEvidence. Rechecks auth after every await. Parses remote
 * shapes. Fail-closed when unexported: originalDurable false, retryable pending.
 *
 * Isolation: Firebase JS client only. No Admin SDK, node:fs, HostSqlite, or
 * tools/goods-evidence-* adapters.
 */

import { getFunctions, httpsCallable } from "firebase/functions";
import { getStorage, ref, uploadBytesResumable, getMetadata } from "firebase/storage";

import { env } from "@/config/env";
import { getFirebaseApp, getFirebaseAuth, getFirebaseStorage } from "@/config/firebase";
import {
  isAllowedOriginalMime,
  isSha256Hex,
  isWave1OriginalCategory,
  type AllowedOriginalMime,
} from "@/goodsEvidence/evidence";
import { canonicalFunctionsRegion } from "@/services/auth/authFlowErrorPresentation";
import type {
  GrinEvidenceUploadInput,
  GrinEvidenceUploadPort,
  GrinEvidenceUploadResult,
} from "@/services/grin/outbox/ports";

import {
  GRIN_BEGIN_EVIDENCE_CALLABLE,
  GRIN_RESERVE_EVIDENCE_CALLABLE,
  GRIN_UPLOAD_EVIDENCE_CALLABLE,
  type GrinHttpsEvidenceLifecyclePayload,
  type GrinHttpsEvidenceReservePayload,
} from "./callableNames";
import type { FirebaseGrinTransportDeps, GrinAuthSnapshot } from "./firebaseTransport";
import { mapCallableFailure } from "./parseRemote";

const GENERIC_UNEXPORTED: GrinEvidenceUploadResult = {
  ok: false,
  originalDurable: false,
  generation: null,
  retryable: true,
  evidenceId: null,
  receiptId: null,
  ledgerId: null,
  category: null,
  claimedSha256: null,
  actualSha256: null,
  reservationId: null,
};

function closed(retryable: boolean): GrinEvidenceUploadResult {
  return { ...GENERIC_UNEXPORTED, retryable };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export type EvidenceObjectPutResult = { generation: string };

export type FirebaseGrinEvidenceTransportDeps = FirebaseGrinTransportDeps & {
  readLocalBytes: (localPath: string) => Promise<Uint8Array>;
  putObject: (input: {
    storagePath: string;
    bytes: Uint8Array;
    contentType: string;
  }) => Promise<EvidenceObjectPutResult>;
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
      ok: false,
      originalDurable: false,
      generation: null,
      retryable: value.retryable === true,
      evidenceId: null,
      receiptId: null,
      ledgerId: null,
      category: null,
      claimedSha256: null,
      actualSha256: null,
      reservationId: null,
    };
  }
  if (typeof value.evidenceId !== "string" || value.evidenceId.length === 0) return closed(false);
  if (typeof value.receiptId !== "string" || value.receiptId.length === 0) return closed(false);
  if (typeof value.ledgerId !== "string" || value.ledgerId.length === 0) return closed(false);
  if (!isWave1OriginalCategory(value.category)) return closed(false);
  if (typeof value.generation !== "string" || value.generation.length === 0) return closed(false);
  if (value.generation === "verified") return closed(false);
  if (typeof value.actualSha256 !== "string" || !isSha256Hex(value.actualSha256)) return closed(false);
  const claimed = value.claimedSha256;
  if (claimed !== null && (typeof claimed !== "string" || !isSha256Hex(claimed))) return closed(false);
  const reservationId = value.reservationId;
  if (reservationId !== null && typeof reservationId !== "string") return closed(false);
  return {
    ok: true,
    originalDurable: true,
    generation: value.generation,
    retryable: false,
    evidenceId: value.evidenceId,
    receiptId: value.receiptId,
    ledgerId: value.ledgerId,
    category: value.category,
    claimedSha256: typeof claimed === "string" ? claimed : null,
    actualSha256: value.actualSha256,
    reservationId: typeof reservationId === "string" ? reservationId : null,
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

function stillOwner(
  deps: FirebaseGrinTransportDeps,
  uid: string
): boolean {
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

      let bytes: Uint8Array;
      try {
        bytes = await deps.readLocalBytes(input.localPath);
      } catch {
        return closed(true);
      }
      if (!stillOwner(deps, input.uid)) return closed(false);

      const mime = sniffOriginalMime(bytes);
      if (!mime || !isAllowedOriginalMime(mime)) return closed(false);
      if (input.sizeBytes > 0 && input.sizeBytes !== bytes.byteLength) return closed(false);

      let claimed = input.claimedSha256;
      if (claimed && isSha256Hex(claimed.toLowerCase())) {
        claimed = claimed.toLowerCase();
      } else {
        claimed = await sha256HexBytes(bytes);
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
        claimedByteSize: bytes.byteLength,
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
          bytes,
          contentType: mime,
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

async function defaultReadLocalBytes(localPath: string): Promise<Uint8Array> {
  if (!localPath) throw new Error("missing local original");
  try {
    const href = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(localPath) ? localPath : `file://${localPath}`;
    const response = await fetch(href);
    if (response.ok) {
      return new Uint8Array(await response.arrayBuffer());
    }
  } catch {
    // Expo FileSystem fallback below.
  }
  const FileSystem = require("expo-file-system/legacy") as {
    readAsStringAsync: (uri: string, opts: { encoding: string }) => Promise<string>;
    EncodingType: { Base64: string };
  };
  const base64 = await FileSystem.readAsStringAsync(localPath, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function defaultPutObject(input: {
  storagePath: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<EvidenceObjectPutResult> {
  const storage = getFirebaseStorage();
  const objectRef = ref(storage, input.storagePath);
  const task = uploadBytesResumable(objectRef, input.bytes, { contentType: input.contentType });
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
    readLocalBytes: defaultReadLocalBytes,
    putObject: defaultPutObject,
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
