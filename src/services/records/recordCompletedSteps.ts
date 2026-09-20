/**
 * completedSteps is coordination metadata. It must never bump diary content `updatedAt`.
 * Content-CAS (expectedUpdatedAt) stays bound to the last user-visible field write.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  arrayUnion,
  doc,
  getDoc,
  runTransaction,
  updateDoc,
  type Firestore,
} from "firebase/firestore";

import { getActiveBackend } from "@/config/env";
import type { ActiveBackend } from "@/config/runtimeEnvironment";
import { getFirebaseDb } from "@/config/firebase";
import { mayIssueRemoteWork, type SyncSessionToken } from "@/sync/syncSessionOwnership";

import {
  mergeCompletedSteps,
  unionCompletedSteps,
  type SaveStepName,
} from "./saveLockTypes";
import type { RecordSaveKind } from "./saveIdempotency";

/** Round 12 local key: vyd_completed_steps_v1_{uid}_{recordKind}_{recordId} */
export const LOCAL_COMPLETED_STEPS_PREFIX = "vyd_completed_steps_v1_";
/** Round 10 local key: vyd_steps_v1_{uid}_{collection}_{recordId} */
export const LEGACY_COMPLETED_STEPS_PREFIX = "vyd_steps_v1_";
export const COMPLETED_STEPS_AT_FIELD = "completedStepsUpdatedAt";

const RECORD_SAVE_KINDS: readonly RecordSaveKind[] = [
  "business_entry",
  "professional_pack",
  "purchase_order",
  "customer_credit",
  "customer_credit_closure",
  "customer_credit_payment",
  "letterhead_doc",
  "draft_convert",
];

const localQueues = new Map<string, Promise<unknown>>();

async function withSerializedLocal<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = localQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const done = new Promise<void>((resolve) => {
    release = resolve;
  });
  localQueues.set(
    key,
    prev.then(
      () => done,
      () => done
    )
  );
  try {
    await prev.catch(() => undefined);
    return await fn();
  } finally {
    release();
  }
}

export function localCompletedStepsKey(
  userId: string,
  recordKind: RecordSaveKind,
  recordId: string
): string {
  return `${LOCAL_COMPLETED_STEPS_PREFIX}${userId}_${recordKind}_${recordId}`;
}

/** Exact Round 10 AsyncStorage key. Collection, not recordKind. */
export function legacyCompletedStepsKey(
  userId: string,
  recordKind: RecordSaveKind,
  recordId: string
): string {
  return `${LEGACY_COMPLETED_STEPS_PREFIX}${userId}_${completedStepsCollectionForKind(recordKind)}_${recordId}`;
}

export function kindsSharingCompletedStepsCollection(
  recordKind: RecordSaveKind
): RecordSaveKind[] {
  const collection = completedStepsCollectionForKind(recordKind);
  return RECORD_SAVE_KINDS.filter((kind) => completedStepsCollectionForKind(kind) === collection);
}

function localQueueId(userId: string, recordKind: RecordSaveKind, recordId: string): string {
  return `${userId}:${completedStepsCollectionForKind(recordKind)}:${recordId}`;
}

async function readLocalPayload(key: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    return parseLocalCompletedStepsPayload(raw);
  } catch {
    return [];
  }
}

/** Canonical Firestore subcollection for coordination metadata. */
export function completedStepsCollectionForKind(recordKind: RecordSaveKind): string {
  switch (recordKind) {
    case "professional_pack":
      return "professionalPacks";
    case "purchase_order":
      return "purchaseOrders";
    case "customer_credit":
    case "customer_credit_closure":
    case "customer_credit_payment":
      return "customerCreditRecords";
    case "letterhead_doc":
      return "letterheadDocs";
    default:
      return "entries";
  }
}

/**
 * Remote completed-step writes follow the explicit backend, not "Firebase is
 * importable". local-mock stays on AsyncStorage even when a web SDK exists.
 */
export function completedStepsUsesRemoteStore(backend: ActiveBackend): boolean {
  return backend === "firebase-shared-dev" || backend === "firebase-production";
}

let firestoreForTests: Firestore | null = null;

/** Node/CI seam. Production still uses getFirebaseDb(). */
export function setCompletedStepsFirestoreForTests(db: Firestore | null): void {
  firestoreForTests = db;
}

export interface CompletedStepWriteObservation {
  userId: string;
  recordKind: RecordSaveKind;
  recordId: string;
  step: SaveStepName;
  /** Distinguishes an already-dispatched primary update from a later fallback write. */
  phase?: "primary_update" | "fallback_write";
}

let completedStepWriteObserver: ((observation: CompletedStepWriteObservation) => void) | null =
  null;

export function setCompletedStepWriteObserverForTests(
  observer: ((observation: CompletedStepWriteObservation) => void) | null
): void {
  completedStepWriteObserver = observer;
}

export type CompletedStepBoundaryHooks = {
  /** After the primary update is noted as started, fail it so fallback can run. */
  failPrimaryUpdate?: boolean;
  /** Pause before the completed-step fetch used by recovery/re-acquire. */
  beforeFetch?: () => Promise<void>;
  /** Pause the fallback read (getDoc / local get). */
  beforeFallbackGet?: () => Promise<void>;
  /** Pause immediately before a fallback write is dispatched. */
  beforeFallbackWrite?: () => Promise<void>;
  /** Pause inside the Firestore transaction callback (including retries). */
  insideTransactionCallback?: () => Promise<void>;
};

let boundaryHooks: CompletedStepBoundaryHooks | null = null;

export function setCompletedStepBoundaryHooksForTests(
  hooks: CompletedStepBoundaryHooks | null
): void {
  boundaryHooks = hooks;
}

function noteCompletedStepWrite(observation: CompletedStepWriteObservation): void {
  completedStepWriteObserver?.(observation);
}

function db(): Firestore {
  return firestoreForTests ?? getFirebaseDb();
}

function useFirestore(): boolean {
  if (firestoreForTests) return true;
  return completedStepsUsesRemoteStore(getActiveBackend());
}

function recordRef(userId: string, recordKind: RecordSaveKind, recordId: string) {
  return doc(db(), "users", userId, completedStepsCollectionForKind(recordKind), recordId);
}

function parseCompletedSteps(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is string => typeof s === "string" && s.length > 0);
}

/** Accept current `{ completedSteps }` objects and older array / `{ steps }` payloads. */
export function parseLocalCompletedStepsPayload(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parseCompletedSteps(parsed);
    if (parsed && typeof parsed === "object") {
      const rec = parsed as { completedSteps?: unknown; steps?: unknown };
      if (Array.isArray(rec.completedSteps)) return parseCompletedSteps(rec.completedSteps);
      if (Array.isArray(rec.steps)) return parseCompletedSteps(rec.steps);
    }
  } catch {
    return [];
  }
  return [];
}

/** Patch shape for coordination-only writes — never includes content `updatedAt`. */
export function completedStepsCoordinationPatch(
  completedSteps: ReturnType<typeof arrayUnion> | string[],
  nowMs: number
): Record<string, unknown> {
  return {
    completedSteps,
    [COMPLETED_STEPS_AT_FIELD]: nowMs,
  };
}

function mayWriteCompletedSteps(
  session: SyncSessionToken | null | undefined,
  userId: string
): boolean {
  if (session === undefined) return true;
  return mayIssueRemoteWork(session, userId);
}

function localLookupKeys(
  userId: string,
  recordKind: RecordSaveKind,
  recordId: string
): string[] {
  const keys = [
    localCompletedStepsKey(userId, recordKind, recordId),
    legacyCompletedStepsKey(userId, recordKind, recordId),
  ];
  for (const kind of kindsSharingCompletedStepsCollection(recordKind)) {
    if (kind === recordKind) continue;
    keys.push(localCompletedStepsKey(userId, kind, recordId));
  }
  return [...new Set(keys)];
}

async function fetchLocalCompletedSteps(
  userId: string,
  recordKind: RecordSaveKind,
  recordId: string
): Promise<string[]> {
  const lists = await Promise.all(localLookupKeys(userId, recordKind, recordId).map(readLocalPayload));
  return unionCompletedSteps(...lists);
}

export async function fetchRecordCompletedSteps(
  userId: string,
  recordKind: RecordSaveKind,
  recordId: string
): Promise<string[]> {
  if (!recordId) return [];
  await boundaryHooks?.beforeFetch?.();
  if (useFirestore()) {
    try {
      const snap = await getDoc(recordRef(userId, recordKind, recordId));
      if (!snap.exists()) return [];
      return parseCompletedSteps(snap.data()?.completedSteps);
    } catch {
      return [];
    }
  }
  return fetchLocalCompletedSteps(userId, recordKind, recordId);
}

async function appendCompletedStepFallbackAtomic(
  userId: string,
  recordKind: RecordSaveKind,
  recordId: string,
  step: SaveStepName,
  session?: SyncSessionToken | null
): Promise<string[]> {
  const ref = recordRef(userId, recordKind, recordId);
  const nowMs = Date.now();
  await runTransaction(db(), async (tx) => {
    if (!mayWriteCompletedSteps(session, userId)) return;
    const snap = await tx.get(ref);
    await boundaryHooks?.insideTransactionCallback?.();
    if (!mayWriteCompletedSteps(session, userId)) return;
    if (!snap.exists()) return;
    tx.update(ref, completedStepsCoordinationPatch(arrayUnion(step), nowMs));
  });
  return fetchRecordCompletedSteps(userId, recordKind, recordId);
}

export async function appendRecordCompletedStep(
  userId: string,
  recordKind: RecordSaveKind,
  recordId: string,
  step: SaveStepName,
  session?: SyncSessionToken | null
): Promise<string[]> {
  if (!recordId) return [];
  const observationBase = { userId, recordKind, recordId, step };

  if (useFirestore()) {
    const ref = recordRef(userId, recordKind, recordId);
    const nowMs = Date.now();
    try {
      if (!mayWriteCompletedSteps(session, userId)) {
        return fetchRecordCompletedSteps(userId, recordKind, recordId);
      }
      noteCompletedStepWrite({ ...observationBase, phase: "primary_update" });
      if (boundaryHooks?.failPrimaryUpdate) {
        boundaryHooks.failPrimaryUpdate = false;
        throw new Error("completed_step_primary_update_failed");
      }
      await updateDoc(ref, completedStepsCoordinationPatch(arrayUnion(step), nowMs));
      return fetchRecordCompletedSteps(userId, recordKind, recordId);
    } catch {
      await boundaryHooks?.beforeFallbackGet?.();
      const snap = await getDoc(ref);
      const current = snap.exists() ? parseCompletedSteps(snap.data()?.completedSteps) : [];
      if (!mayWriteCompletedSteps(session, userId)) {
        return current;
      }
      await boundaryHooks?.beforeFallbackWrite?.();
      if (!mayWriteCompletedSteps(session, userId)) {
        return current;
      }
      if (!snap.exists()) return current;
      noteCompletedStepWrite({ ...observationBase, phase: "fallback_write" });
      return appendCompletedStepFallbackAtomic(userId, recordKind, recordId, step, session);
    }
  }

  const currentKey = localCompletedStepsKey(userId, recordKind, recordId);
  return withSerializedLocal(localQueueId(userId, recordKind, recordId), async () => {
    const existing = await fetchLocalCompletedSteps(userId, recordKind, recordId);
    await boundaryHooks?.beforeFallbackGet?.();
    if (!mayWriteCompletedSteps(session, userId)) {
      return existing;
    }
    await boundaryHooks?.beforeFallbackWrite?.();
    if (!mayWriteCompletedSteps(session, userId)) {
      return existing;
    }
    const next = mergeCompletedSteps(existing, step);
    noteCompletedStepWrite({ ...observationBase, phase: "primary_update" });
    try {
      await AsyncStorage.setItem(currentKey, JSON.stringify({ completedSteps: next }));
    } catch {
      // Keep Round 10 (and any sibling) payloads. Unpersisted merge is not durable.
      return fetchLocalCompletedSteps(userId, recordKind, recordId);
    }
    return next;
  });
}
