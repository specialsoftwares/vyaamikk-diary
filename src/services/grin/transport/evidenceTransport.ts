/**
 * Mobile-safe JS evidence callable client.
 *
 * Team 4/3 may inject this as GrinEvidenceUploadPort. It does not implement
 * Storage (Team 2). Unexported / unavailable callables stay fail-closed:
 * originalDurable false, identity fields null, no fabricated hashes.
 *
 * Isolation: JS httpsCallable only. No Admin SDK, host sqlite, tools adapters,
 * or filesystem reads of local originals.
 */

import { getFunctions, httpsCallable } from "firebase/functions";

import { env } from "@/config/env";
import { getFirebaseApp, getFirebaseAuth } from "@/config/firebase";
import { isWave1OriginalCategory } from "@/goodsEvidence/evidence";
import { canonicalFunctionsRegion } from "@/services/auth/authFlowErrorPresentation";
import type {
  GrinEvidenceUploadInput,
  GrinEvidenceUploadPort,
  GrinEvidenceUploadResult,
} from "@/services/grin/outbox/ports";

import { GRIN_UPLOAD_EVIDENCE_CALLABLE, type GrinHttpsEvidencePayload } from "./callableNames";
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
  if (typeof value.actualSha256 !== "string" || value.actualSha256.length === 0) return closed(false);
  const claimed = value.claimedSha256;
  if (claimed !== null && typeof claimed !== "string") return closed(false);
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

export type FirebaseGrinEvidenceTransport = GrinEvidenceUploadPort & {
  portKind: "INJECTED";
  transportKind: "FIREBASE_JS_HTTPS_CALLABLE";
  compositionLabel: "not live deploy; fail-closed when unexported";
};

export function createFirebaseGrinEvidenceTransport(
  deps: FirebaseGrinTransportDeps
): FirebaseGrinEvidenceTransport {
  const port: FirebaseGrinEvidenceTransport = {
    portKind: "INJECTED",
    transportKind: "FIREBASE_JS_HTTPS_CALLABLE",
    compositionLabel: "not live deploy; fail-closed when unexported",
    async upload(input: GrinEvidenceUploadInput): Promise<GrinEvidenceUploadResult> {
      const current = deps.currentAuth();
      if (current == null || current.uid.length === 0) return closed(false);
      if (current.uid !== input.uid) return closed(false);
      void input.localPath;
      const payload: GrinHttpsEvidencePayload = {
        ledgerId: input.ledgerId,
        receiptId: input.receiptId,
        evidenceId: input.evidenceId,
        role: input.role,
        claimedSha256: input.claimedSha256,
        category: input.category,
        sizeBytes: input.sizeBytes,
      };
      let raw: unknown;
      try {
        raw = await deps.call(GRIN_UPLOAD_EVIDENCE_CALLABLE, payload);
      } catch (err) {
        const mapped = mapCallableFailure(err);
        if (mapped) return closed(mapped.code !== "unauthenticated");
        throw err;
      }
      const after = deps.currentAuth();
      if (after == null || after.uid !== input.uid) return closed(false);
      return parseEvidenceUploadResult(raw);
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

/** Production-shaped JS client. Storage adapter remains Team 2. Callables unexported. */
export function createFirebaseJsGrinEvidenceTransport(): FirebaseGrinEvidenceTransport {
  return createFirebaseGrinEvidenceTransport({
    call: defaultCall,
    currentAuth: defaultCurrentAuth,
  });
}
