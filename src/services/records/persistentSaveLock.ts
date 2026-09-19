/**
 * Persistent save locks — Firestore (shared-dev/prod) or AsyncStorage (local-mock).
 *
 * Collection: users/{uid}/_saveLocks/{clientRecordId}
 * Lightweight coordination metadata only.
 *
 * Lease mutations are conditional: Firestore uses a transaction; local storage
 * serializes per key. A stale owner must not overwrite a newer lease.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, getDoc, runTransaction, type Firestore } from "firebase/firestore";

import { getActiveBackend } from "@/config/env";
import { getFirebaseDb } from "@/config/firebase";
import { mayIssueRemoteWork, type SyncSessionToken } from "@/sync/syncSessionOwnership";
import { createLogger } from "@/utils/logger";

import {
  SAVE_LOCK_TTL_MS,
  type SaveLockDoc,
  type SaveLockStatus,
} from "./saveLockTypes";
import type { RecordSaveKind } from "./saveIdempotency";

const log = createLogger("save/persistentLock");
const LOCAL_PREFIX = "vyd_persistent_save_lock_v1_";
const RETIRED_LEASE_PREFIX = "vyd_save_lock_retired_lease_v1_";

const localQueues = new Map<string, Promise<unknown>>();

let firestoreForTests: Firestore | null = null;
let afterReadGate: ((existing: SaveLockDoc | null) => Promise<void>) | null = null;
let touchGate: (() => Promise<void>) | null = null;
let insideTransactionGate: (() => Promise<void>) | null = null;
let nowMsForTests: number | null = null;
let lockMutationObserver: ((info: PersistentLockMutationObservation) => void) | null = null;

export type PersistentLockMutationObservation = {
  userId: string;
  clientRecordId: string;
  store: "firestore" | "local";
  startedAt: number;
  status: SaveLockStatus;
};

/** Node/CI seam. Production still uses getFirebaseDb() / active backend. */
export function setPersistentLockFirestoreForTests(db: Firestore | null): void {
  firestoreForTests = db;
}

export function setPersistentLockNowMsForTests(nowMs: number | null): void {
  nowMsForTests = nowMs;
}

function nowMs(): number {
  return nowMsForTests ?? Date.now();
}

/**
 * Test-only: runs after a preview read and before the atomic transition.
 * Lets another operation install a newer lease between read and write.
 */
export function setPersistentLockAfterReadGateForTests(
  gate: ((existing: SaveLockDoc | null) => Promise<void>) | null
): void {
  afterReadGate = gate;
}

/** Test-only: pause at the start of touchPersistentLock. */
export function setPersistentLockTouchGateForTests(
  gate: (() => Promise<void>) | null
): void {
  touchGate = gate;
}

/**
 * Test-only: pause inside the authoritative transition (Firestore callback
 * including retries, or the local serialized write).
 */
export function setPersistentLockInsideTransactionGateForTests(
  gate: (() => Promise<void>) | null
): void {
  insideTransactionGate = gate;
}

export function setPersistentLockMutationObserverForTests(
  observer: ((info: PersistentLockMutationObservation) => void) | null
): void {
  lockMutationObserver = observer;
}

function mayMutatePersistentLock(
  session: SyncSessionToken | null | undefined,
  userId: string
): boolean {
  if (session === undefined) return true;
  return mayIssueRemoteWork(session, userId);
}

function retiredLeaseIntentKey(
  userId: string,
  clientRecordId: string,
  leaseStartedAt: number
): string {
  return `${RETIRED_LEASE_PREFIX}${userId}_${clientRecordId}_${leaseStartedAt}`;
}

/** Local recovery intent for a specific lease. Does not clear a newer lease. */
export async function recordRetiredLeaseIntent(
  userId: string,
  clientRecordId: string,
  leaseStartedAt: number
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      retiredLeaseIntentKey(userId, clientRecordId, leaseStartedAt),
      JSON.stringify({ userId, clientRecordId, leaseStartedAt, recordedAt: Date.now() })
    );
  } catch {
    // Process release must not depend on this write.
  }
}

export async function hasRetiredLeaseIntent(
  userId: string,
  clientRecordId: string,
  leaseStartedAt: number
): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(
      retiredLeaseIntentKey(userId, clientRecordId, leaseStartedAt)
    );
    return raw != null && raw.length > 0;
  } catch {
    return false;
  }
}

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

function usesFirestoreLock(): boolean {
  if (firestoreForTests) return true;
  const backend = getActiveBackend();
  return backend === "firebase-shared-dev" || backend === "firebase-production";
}

function lockDb(): Firestore {
  return firestoreForTests ?? getFirebaseDb();
}

function localKey(userId: string, clientRecordId: string): string {
  return `${LOCAL_PREFIX}${userId}_${clientRecordId}`;
}

function firestoreLockRef(userId: string, clientRecordId: string) {
  return doc(lockDb(), "users", userId, "_saveLocks", clientRecordId);
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseLock(raw: Record<string, unknown>): SaveLockDoc {
  return {
    clientRecordId: String(raw.clientRecordId ?? ""),
    idempotencyKey: String(raw.idempotencyKey ?? ""),
    userId: String(raw.userId ?? ""),
    ueid: typeof raw.ueid === "string" ? raw.ueid : undefined,
    recordKind: raw.recordKind as RecordSaveKind,
    recordId: raw.recordId == null ? null : String(raw.recordId),
    status: (raw.status as SaveLockStatus) ?? "in_flight",
    startedAt: num(raw.startedAt),
    updatedAt: num(raw.updatedAt),
    expiresAt: num(raw.expiresAt),
    completedAt: raw.completedAt == null ? null : num(raw.completedAt),
    failedAt: raw.failedAt == null ? null : num(raw.failedAt),
    failureCode: typeof raw.failureCode === "string" ? raw.failureCode : null,
  };
}

function lockToPayload(lock: SaveLockDoc): Record<string, unknown> {
  return {
    clientRecordId: lock.clientRecordId,
    idempotencyKey: lock.idempotencyKey,
    userId: lock.userId,
    ...(lock.ueid ? { ueid: lock.ueid } : {}),
    recordKind: lock.recordKind,
    recordId: lock.recordId ?? null,
    status: lock.status,
    startedAt: lock.startedAt,
    updatedAt: lock.updatedAt,
    expiresAt: lock.expiresAt,
    completedAt: lock.completedAt ?? null,
    failedAt: lock.failedAt ?? null,
    failureCode: lock.failureCode ?? null,
  };
}

export function isLockExpired(lock: SaveLockDoc, now = nowMs()): boolean {
  return now >= lock.expiresAt;
}

/**
 * Lease identity is `startedAt`.
 * `undefined` = unconditional (compatibility / first-writer tests).
 * `null` = mutate only when no lease exists.
 * `number` = mutate only that exact observed lease.
 * Session authority is separate.
 */
export function lockLeaseMatches(
  existing: SaveLockDoc | null,
  expectedStartedAt: number | null | undefined
): boolean {
  if (expectedStartedAt === undefined) return true;
  if (expectedStartedAt === null) return existing == null;
  if (!existing) return false;
  return existing.startedAt === expectedStartedAt;
}

export const PERSISTENT_LOCK_ACQUIRE_FAILED = "persistent_lock_acquire_failed";

export function isPersistentLockAcquireFailed(error: unknown): boolean {
  return error instanceof Error && error.message === PERSISTENT_LOCK_ACQUIRE_FAILED;
}

/**
 * Recovery/re-acquire may replace only a lease whose identity matches the caller.
 * clientRecordId and authoritative recordId may differ after attach.
 */
export function persistentLockCallerMayReplace(
  existing: SaveLockDoc,
  caller: {
    userId: string;
    clientRecordId: string;
    recordKind: RecordSaveKind;
    idempotencyKey: string;
    recordId?: string | null;
  }
): boolean {
  if (existing.userId !== caller.userId) return false;
  if (existing.clientRecordId !== caller.clientRecordId) return false;
  if (existing.recordKind !== caller.recordKind) return false;
  if (existing.idempotencyKey !== caller.idempotencyKey) return false;
  const have = existing.recordId ?? null;
  const want = caller.recordId ?? null;
  if (want && have && want !== have) return false;
  return true;
}

/** Distinct even when two replacements observe the same millisecond. */
export function mintLeaseStartedAt(
  existing: SaveLockDoc | null,
  now: number,
  preserveStartedAt?: number
): number {
  if (preserveStartedAt != null && Number.isFinite(preserveStartedAt)) {
    return preserveStartedAt;
  }
  if (existing && existing.startedAt >= now) return existing.startedAt + 1;
  return now;
}

async function readLocalLock(userId: string, clientRecordId: string): Promise<SaveLockDoc | null> {
  try {
    const raw = await AsyncStorage.getItem(localKey(userId, clientRecordId));
    if (!raw) return null;
    return parseLock(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return null;
  }
}

async function readFirestoreLock(
  userId: string,
  clientRecordId: string
): Promise<SaveLockDoc | null> {
  const snap = await getDoc(firestoreLockRef(userId, clientRecordId));
  if (!snap.exists()) return null;
  return parseLock(snap.data() as Record<string, unknown>);
}

export async function readPersistentSaveLock(
  userId: string,
  clientRecordId: string
): Promise<SaveLockDoc | null> {
  if (usesFirestoreLock()) {
    try {
      return await readFirestoreLock(userId, clientRecordId);
    } catch (e) {
      log.warn("read_lock_failed", { userId, clientRecordId, err: String(e) });
      return null;
    }
  }
  return readLocalLock(userId, clientRecordId);
}

async function applyLockTransition(
  userId: string,
  clientRecordId: string,
  expectedLeaseStartedAt: number | null | undefined,
  mutator: (existing: SaveLockDoc | null) => SaveLockDoc | null,
  session?: SyncSessionToken | null
): Promise<{ lock: SaveLockDoc | null; mutated: boolean }> {
  if (afterReadGate) {
    const preview = usesFirestoreLock()
      ? await readFirestoreLock(userId, clientRecordId)
      : await readLocalLock(userId, clientRecordId);
    await afterReadGate(preview);
  }

  let mutated = false;

  if (usesFirestoreLock()) {
    const ref = firestoreLockRef(userId, clientRecordId);
    const lock = await runTransaction(lockDb(), async (tx) => {
      mutated = false;
      if (!mayMutatePersistentLock(session, userId)) {
        const snap = await tx.get(ref);
        return snap.exists() ? parseLock(snap.data() as Record<string, unknown>) : null;
      }
      const snap = await tx.get(ref);
      const existing = snap.exists() ? parseLock(snap.data() as Record<string, unknown>) : null;
      await insideTransactionGate?.();
      if (!mayMutatePersistentLock(session, userId)) return existing;
      if (!lockLeaseMatches(existing, expectedLeaseStartedAt)) return existing;
      const next = mutator(existing);
      if (!next) return existing;
      if (!mayMutatePersistentLock(session, userId)) return existing;
      tx.set(ref, lockToPayload(next));
      mutated = true;
      lockMutationObserver?.({
        userId,
        clientRecordId,
        store: "firestore",
        startedAt: next.startedAt,
        status: next.status,
      });
      return next;
    });
    return { lock, mutated };
  }

  const lock = await withSerializedLocal(localKey(userId, clientRecordId), async () => {
    mutated = false;
    if (!mayMutatePersistentLock(session, userId)) {
      return readLocalLock(userId, clientRecordId);
    }
    await insideTransactionGate?.();
    if (!mayMutatePersistentLock(session, userId)) {
      return readLocalLock(userId, clientRecordId);
    }
    const existing = await readLocalLock(userId, clientRecordId);
    if (!lockLeaseMatches(existing, expectedLeaseStartedAt)) return existing;
    const next = mutator(existing);
    if (!next) return existing;
    if (!mayMutatePersistentLock(session, userId)) return existing;
    await AsyncStorage.setItem(localKey(userId, clientRecordId), JSON.stringify(next));
    mutated = true;
    lockMutationObserver?.({
      userId,
      clientRecordId,
      store: "local",
      startedAt: next.startedAt,
      status: next.status,
    });
    return next;
  });
  return { lock, mutated };
}

export async function markPersistentLockInFlight(params: {
  userId: string;
  clientRecordId: string;
  idempotencyKey: string;
  recordKind: RecordSaveKind;
  recordId?: string | null;
  ueid?: string;
  preserveStartedAt?: number;
  /**
   * `number` = that exact observed lease; `null` = document must still be empty;
   * omit for an unconditional acquire (compatibility).
   */
  expectedLeaseStartedAt?: number | null;
  /** Original admission token. Omit for callers that predate session threading. */
  session?: SyncSessionToken | null;
}): Promise<SaveLockDoc> {
  const now = nowMs();
  const { lock, mutated } = await applyLockTransition(
    params.userId,
    params.clientRecordId,
    params.expectedLeaseStartedAt,
    (existing) => {
      if (typeof params.expectedLeaseStartedAt === "number") {
        if (!existing) return null;
        if (
          !persistentLockCallerMayReplace(existing, {
            userId: params.userId,
            clientRecordId: params.clientRecordId,
            recordKind: params.recordKind,
            idempotencyKey: params.idempotencyKey,
            recordId: params.recordId,
          })
        ) {
          return null;
        }
      }
      const startedAt = mintLeaseStartedAt(existing, now, params.preserveStartedAt);
      return {
        clientRecordId: params.clientRecordId,
        idempotencyKey: params.idempotencyKey,
        userId: params.userId,
        ueid: params.ueid,
        recordKind: params.recordKind,
        recordId: params.recordId ?? existing?.recordId ?? null,
        status: "in_flight" as const,
        startedAt,
        updatedAt: now,
        expiresAt: startedAt + SAVE_LOCK_TTL_MS,
        completedAt: null,
        failedAt: null,
        failureCode: null,
      };
    },
    params.session
  );
  if (!mutated || !lock || lock.status !== "in_flight" || lock.userId !== params.userId) {
    throw new Error(PERSISTENT_LOCK_ACQUIRE_FAILED);
  }
  return lock;
}

export async function touchPersistentLock(
  userId: string,
  clientRecordId: string,
  leaseStartedAt?: number,
  session?: SyncSessionToken | null
): Promise<void> {
  if (touchGate) await touchGate();
  const now = nowMs();
  await applyLockTransition(
    userId,
    clientRecordId,
    leaseStartedAt,
    (existing) => {
      if (!existing) return null;
      if (existing.status !== "in_flight") return null;
      return {
        ...existing,
        updatedAt: now,
        expiresAt: existing.startedAt + SAVE_LOCK_TTL_MS,
      };
    },
    session
  );
}

export async function attachRecordIdToPersistentLock(
  userId: string,
  clientRecordId: string,
  recordId: string,
  leaseStartedAt?: number,
  session?: SyncSessionToken | null
): Promise<void> {
  const now = nowMs();
  await applyLockTransition(
    userId,
    clientRecordId,
    leaseStartedAt,
    (existing) => {
      if (!existing) return null;
      return { ...existing, recordId, updatedAt: now };
    },
    session
  );
}

export async function markPersistentLockDone(
  userId: string,
  clientRecordId: string,
  recordId: string,
  leaseStartedAt?: number,
  session?: SyncSessionToken | null
): Promise<void> {
  const now = nowMs();
  await applyLockTransition(
    userId,
    clientRecordId,
    leaseStartedAt,
    (existing) => {
      if (!existing) return null;
      return {
        ...existing,
        recordId,
        status: "done",
        updatedAt: now,
        completedAt: now,
        failedAt: null,
        failureCode: null,
      };
    },
    session
  );
}

export async function markPersistentLockFailed(
  userId: string,
  clientRecordId: string,
  failureCode: string,
  leaseStartedAt?: number,
  session?: SyncSessionToken | null
): Promise<void> {
  const now = nowMs();
  await applyLockTransition(
    userId,
    clientRecordId,
    leaseStartedAt,
    (existing) => {
      if (!existing) return null;
      return {
        ...existing,
        status: "failed",
        updatedAt: now,
        failedAt: now,
        failureCode,
      };
    },
    session
  );
}
