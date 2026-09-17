/**
 * Persistent save locks — Firestore (shared-dev/prod) or AsyncStorage (local-mock).
 *
 * Collection: users/{uid}/_saveLocks/{clientRecordId}
 * Lightweight coordination metadata only.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, getDoc, setDoc } from "firebase/firestore";

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

function usesFirestoreLock(): boolean {
  const backend = getActiveBackend();
  return backend === "firebase-shared-dev" || backend === "firebase-production";
}

function localKey(userId: string, clientRecordId: string): string {
  return `${LOCAL_PREFIX}${userId}_${clientRecordId}`;
}

function firestoreLockRef(userId: string, clientRecordId: string) {
  return doc(getFirebaseDb(), "users", userId, "_saveLocks", clientRecordId);
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
    failureCode: raw.failureCode == null ? null : String(raw.failureCode),
  };
}

export async function readPersistentSaveLock(
  userId: string,
  clientRecordId: string
): Promise<SaveLockDoc | null> {
  if (!userId || !clientRecordId) return null;
  try {
    if (usesFirestoreLock()) {
      const snap = await getDoc(firestoreLockRef(userId, clientRecordId));
      if (!snap.exists()) return null;
      return parseLock(snap.data() as Record<string, unknown>);
    }
    const raw = await AsyncStorage.getItem(localKey(userId, clientRecordId));
    if (!raw) return null;
    return parseLock(JSON.parse(raw) as Record<string, unknown>);
  } catch (e) {
    log.warn("read lock failed", e);
    return null;
  }
}

export async function writePersistentSaveLock(lock: SaveLockDoc): Promise<void> {
  if (!lock.userId || !lock.clientRecordId) return;
  try {
    if (usesFirestoreLock()) {
      await setDoc(firestoreLockRef(lock.userId, lock.clientRecordId), lock, {
        merge: true,
      });
      return;
    }
    await AsyncStorage.setItem(
      localKey(lock.userId, lock.clientRecordId),
      JSON.stringify(lock)
    );
  } catch (e) {
    log.warn("write lock failed", e);
  }
}

export function isLockExpired(lock: SaveLockDoc, now = Date.now()): boolean {
  return lock.expiresAt > 0 && now > lock.expiresAt;
}

export async function markPersistentLockInFlight(params: {
  userId: string;
  ueid?: string;
  clientRecordId: string;
  idempotencyKey: string;
  recordKind: RecordSaveKind;
  recordId?: string | null;
  preserveStartedAt?: number;
}): Promise<SaveLockDoc> {
  const now = Date.now();
  const existing = await readPersistentSaveLock(params.userId, params.clientRecordId);
  let startedAt = params.preserveStartedAt ?? now;
  if (params.preserveStartedAt == null && existing && existing.startedAt >= startedAt) {
    startedAt = existing.startedAt + 1;
  }
  const lock: SaveLockDoc = {
    clientRecordId: params.clientRecordId,
    idempotencyKey: params.idempotencyKey,
    userId: params.userId,
    ueid: params.ueid,
    recordKind: params.recordKind,
    recordId: params.recordId ?? null,
    status: "in_flight",
    startedAt,
    updatedAt: now,
    expiresAt: startedAt + SAVE_LOCK_TTL_MS,
    completedAt: null,
    failedAt: null,
    failureCode: null,
  };
  await writePersistentSaveLock(lock);
  return lock;
}

function lockLeaseMatches(existing: SaveLockDoc | null, leaseStartedAt?: number): boolean {
  if (leaseStartedAt == null) return existing != null;
  return existing != null && existing.startedAt === leaseStartedAt;
}

export async function touchPersistentLock(
  userId: string,
  clientRecordId: string,
  leaseStartedAt?: number
): Promise<void> {
  const existing = await readPersistentSaveLock(userId, clientRecordId);
  if (!lockLeaseMatches(existing, leaseStartedAt)) return;
  await writePersistentSaveLock({
    ...existing!,
    updatedAt: Date.now(),
  });
}

/** Link a persisted base record id onto an in-flight lock (after create, before PDF). */
export async function attachRecordIdToPersistentLock(
  userId: string,
  clientRecordId: string,
  recordId: string,
  leaseStartedAt?: number
): Promise<void> {
  const existing = await readPersistentSaveLock(userId, clientRecordId);
  if (!lockLeaseMatches(existing, leaseStartedAt)) return;
  if (existing!.recordId === recordId) return;
  await writePersistentSaveLock({
    ...existing!,
    recordId,
    updatedAt: Date.now(),
  });
}

export async function markPersistentLockDone(
  userId: string,
  clientRecordId: string,
  recordId: string,
  leaseStartedAt?: number
): Promise<void> {
  const existing = await readPersistentSaveLock(userId, clientRecordId);
  if (leaseStartedAt != null && !lockLeaseMatches(existing, leaseStartedAt)) return;
  const now = Date.now();
  const lock: SaveLockDoc = existing ?? {
    clientRecordId,
    idempotencyKey: "",
    userId,
    recordKind: "business_entry",
    status: "in_flight",
    startedAt: now,
    updatedAt: now,
    expiresAt: now + SAVE_LOCK_TTL_MS,
  };
  await writePersistentSaveLock({
    ...lock,
    recordId,
    status: "done",
    completedAt: now,
    updatedAt: now,
    failedAt: null,
    failureCode: null,
  });
}

export async function markPersistentLockFailed(
  userId: string,
  clientRecordId: string,
  failureCode: string,
  leaseStartedAt?: number
): Promise<void> {
  const existing = await readPersistentSaveLock(userId, clientRecordId);
  if (!lockLeaseMatches(existing, leaseStartedAt)) return;
  const now = Date.now();
  await writePersistentSaveLock({
    ...existing!,
    status: "failed",
    failedAt: now,
    failureCode,
    updatedAt: now,
  });
}
