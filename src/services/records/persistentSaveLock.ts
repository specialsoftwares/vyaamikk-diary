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
import { createLogger } from "@/utils/logger";

import {
  SAVE_LOCK_TTL_MS,
  type SaveLockDoc,
  type SaveLockStatus,
} from "./saveLockTypes";
import type { RecordSaveKind } from "./saveIdempotency";

const log = createLogger("save/persistentLock");
const LOCAL_PREFIX = "vyd_persistent_save_lock_v1_";

const localQueues = new Map<string, Promise<unknown>>();

let firestoreForTests: Firestore | null = null;
let afterReadGate: ((existing: SaveLockDoc | null) => Promise<void>) | null = null;
let touchGate: (() => Promise<void>) | null = null;
let nowMsForTests: number | null = null;

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
 * Lease identity is `startedAt`. `expectedStartedAt == null` means acquire /
 * replace (not a stale owner write). Session authority is separate.
 */
export function lockLeaseMatches(
  existing: SaveLockDoc | null,
  expectedStartedAt: number | undefined
): boolean {
  if (expectedStartedAt == null) return true;
  if (!existing) return false;
  return existing.startedAt === expectedStartedAt;
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
  expectedLeaseStartedAt: number | undefined,
  mutator: (existing: SaveLockDoc | null) => SaveLockDoc | null
): Promise<SaveLockDoc | null> {
  if (afterReadGate) {
    const preview = usesFirestoreLock()
      ? await readFirestoreLock(userId, clientRecordId)
      : await readLocalLock(userId, clientRecordId);
    await afterReadGate(preview);
  }

  if (usesFirestoreLock()) {
    const ref = firestoreLockRef(userId, clientRecordId);
    return runTransaction(lockDb(), async (tx) => {
      const snap = await tx.get(ref);
      const existing = snap.exists() ? parseLock(snap.data() as Record<string, unknown>) : null;
      if (!lockLeaseMatches(existing, expectedLeaseStartedAt)) return existing;
      const next = mutator(existing);
      if (!next) return existing;
      tx.set(ref, lockToPayload(next));
      return next;
    });
  }

  return withSerializedLocal(localKey(userId, clientRecordId), async () => {
    const existing = await readLocalLock(userId, clientRecordId);
    if (!lockLeaseMatches(existing, expectedLeaseStartedAt)) return existing;
    const next = mutator(existing);
    if (!next) return existing;
    await AsyncStorage.setItem(localKey(userId, clientRecordId), JSON.stringify(next));
    return next;
  });
}

export async function markPersistentLockInFlight(params: {
  userId: string;
  clientRecordId: string;
  idempotencyKey: string;
  recordKind: RecordSaveKind;
  recordId?: string | null;
  ueid?: string;
  preserveStartedAt?: number;
}): Promise<SaveLockDoc> {
  const now = nowMs();
  const next = await applyLockTransition(params.userId, params.clientRecordId, undefined, (existing) => {
    const startedAt = mintLeaseStartedAt(existing, now, params.preserveStartedAt);
    return {
      clientRecordId: params.clientRecordId,
      idempotencyKey: params.idempotencyKey,
      userId: params.userId,
      ueid: params.ueid,
      recordKind: params.recordKind,
      recordId: params.recordId ?? existing?.recordId ?? null,
      status: "in_flight",
      startedAt,
      updatedAt: now,
      expiresAt: startedAt + SAVE_LOCK_TTL_MS,
      completedAt: null,
      failedAt: null,
      failureCode: null,
    };
  });
  if (!next) {
    throw new Error("persistent_lock_acquire_failed");
  }
  return next;
}

export async function touchPersistentLock(
  userId: string,
  clientRecordId: string,
  leaseStartedAt?: number
): Promise<void> {
  await touchGate?.();
  const now = nowMs();
  await applyLockTransition(userId, clientRecordId, leaseStartedAt, (existing) => {
    if (!existing) return null;
    return {
      ...existing,
      updatedAt: now,
      expiresAt: existing.startedAt + SAVE_LOCK_TTL_MS,
    };
  });
}

export async function attachRecordIdToPersistentLock(
  userId: string,
  clientRecordId: string,
  recordId: string,
  leaseStartedAt?: number
): Promise<void> {
  const now = nowMs();
  await applyLockTransition(userId, clientRecordId, leaseStartedAt, (existing) => {
    if (!existing) return null;
    return { ...existing, recordId, updatedAt: now };
  });
}

export async function markPersistentLockDone(
  userId: string,
  clientRecordId: string,
  recordId: string,
  leaseStartedAt?: number
): Promise<void> {
  const now = nowMs();
  await applyLockTransition(userId, clientRecordId, leaseStartedAt, (existing) => {
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
  });
}

export async function markPersistentLockFailed(
  userId: string,
  clientRecordId: string,
  failureCode: string,
  leaseStartedAt?: number
): Promise<void> {
  const now = nowMs();
  await applyLockTransition(userId, clientRecordId, leaseStartedAt, (existing) => {
    if (!existing) return null;
    return {
      ...existing,
      status: "failed",
      updatedAt: now,
      failedAt: now,
      failureCode,
    };
  });
}
