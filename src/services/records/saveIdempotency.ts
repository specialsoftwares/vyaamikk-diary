/**
 * App-wide exactly-once save helpers.
 *
 * Generate stable client record IDs and idempotency keys before any write/PDF.
 * Repositories must use clientRecordId for setDoc paths so retries cannot
 * mint duplicate Firestore documents.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import { shortId } from "@/utils/id";

export type RecordSaveKind =
  | "business_entry"
  | "professional_pack"
  | "purchase_order"
  | "customer_credit"
  | "customer_credit_closure"
  | "customer_credit_payment"
  | "letterhead_doc"
  | "draft_convert";

export interface SaveIdempotencyContext {
  userId: string;
  recordKind: RecordSaveKind;
  /** Stable per-form-session id generated on screen mount. */
  clientRecordId: string;
  idempotencyKey: string;
  sourceDraftId?: string | null;
}

const STORAGE_PREFIX = "vyd_idempotency_v1_";
/** Align with persistent save lock TTL (30 min). */
const INFLIGHT_TTL_MS = 30 * 60 * 1000;

interface PersistedAttempt {
  clientRecordId: string;
  recordId: string | null;
  status: "inflight" | "completed";
  startedAt: number;
  completedAt: number | null;
}

const memoryAttempts = new Map<string, PersistedAttempt>();

function storageKey(userId: string, idempotencyKey: string): string {
  return `${STORAGE_PREFIX}${userId}_${idempotencyKey}`;
}

export function generateClientRecordId(prefix: string): string {
  return shortId(prefix);
}

export function buildIdempotencyKey(params: {
  userId: string;
  recordKind: RecordSaveKind;
  clientRecordId: string;
  sourceDraftId?: string | null;
  scopeKey?: string;
}): string {
  const draft = params.sourceDraftId?.trim() || "none";
  const scope = params.scopeKey?.trim() || "create";
  return `${params.userId}:${params.recordKind}:${params.clientRecordId}:${draft}:${scope}`;
}

export function createSaveIdempotencyContext(params: {
  userId: string;
  recordKind: RecordSaveKind;
  clientRecordId: string;
  sourceDraftId?: string | null;
  scopeKey?: string;
}): SaveIdempotencyContext {
  return {
    userId: params.userId,
    recordKind: params.recordKind,
    clientRecordId: params.clientRecordId,
    sourceDraftId: params.sourceDraftId ?? null,
    idempotencyKey: buildIdempotencyKey(params),
  };
}

async function readAttempt(
  userId: string,
  idempotencyKey: string
): Promise<PersistedAttempt | null> {
  const mem = memoryAttempts.get(idempotencyKey);
  if (mem) return mem;
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId, idempotencyKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedAttempt;
    if (
      parsed.status === "inflight" &&
      Date.now() - parsed.startedAt > INFLIGHT_TTL_MS
    ) {
      return null;
    }
    memoryAttempts.set(idempotencyKey, parsed);
    return parsed;
  } catch {
    return null;
  }
}

async function writeAttempt(
  userId: string,
  idempotencyKey: string,
  attempt: PersistedAttempt
): Promise<void> {
  memoryAttempts.set(idempotencyKey, attempt);
  try {
    await AsyncStorage.setItem(storageKey(userId, idempotencyKey), JSON.stringify(attempt));
  } catch {
    // non-fatal — memory guard still active for this session
  }
}

export type BeginSaveAttemptResult =
  | { action: "proceed"; clientRecordId: string; replay: false }
  | { action: "return_existing"; clientRecordId: string; recordId: string; replay: true };

let beginSaveAttemptGate: (() => Promise<void>) | null = null;
let completeSaveAttemptGate: (() => Promise<void>) | null = null;

/** Test-only barrier at the start of beginSaveAttempt. */
export function setBeginSaveAttemptGateForTests(gate: (() => Promise<void>) | null): void {
  beginSaveAttemptGate = gate;
}

/** Test-only barrier at the start of completeSaveAttempt. */
export function setCompleteSaveAttemptGateForTests(gate: (() => Promise<void>) | null): void {
  completeSaveAttemptGate = gate;
}

/**
 * Repository-layer guard. Call before create/write.
 * Returns existing record id when the same idempotency key already completed.
 */
export async function beginSaveAttempt(
  ctx: SaveIdempotencyContext
): Promise<BeginSaveAttemptResult> {
  await beginSaveAttemptGate?.();
  const existing = await readAttempt(ctx.userId, ctx.idempotencyKey);
  if (existing?.status === "completed" && existing.recordId) {
    return {
      action: "return_existing",
      clientRecordId: existing.clientRecordId,
      recordId: existing.recordId,
      replay: true,
    };
  }
  const clientRecordId = existing?.clientRecordId ?? ctx.clientRecordId;
  await writeAttempt(ctx.userId, ctx.idempotencyKey, {
    clientRecordId,
    recordId: existing?.recordId ?? null,
    status: "inflight",
    startedAt: existing?.startedAt ?? Date.now(),
    completedAt: null,
  });
  return { action: "proceed", clientRecordId, replay: false };
}

export async function completeSaveAttempt(
  ctx: SaveIdempotencyContext,
  recordId: string
): Promise<void> {
  await completeSaveAttemptGate?.();
  await writeAttempt(ctx.userId, ctx.idempotencyKey, {
    clientRecordId: ctx.clientRecordId,
    recordId,
    status: "completed",
    startedAt: Date.now(),
    completedAt: Date.now(),
  });
}

export async function failSaveAttempt(ctx: SaveIdempotencyContext): Promise<void> {
  memoryAttempts.delete(ctx.idempotencyKey);
  try {
    await AsyncStorage.removeItem(storageKey(ctx.userId, ctx.idempotencyKey));
  } catch {
    // ignore
  }
}

/** In-process mutex — survives re-renders, not hot reload. */
export type ProcessSaveLockOwner = symbol;

const processLocks = new Map<string, ProcessSaveLockOwner>();

export function acquireOwnedProcessSaveLock(lockKey: string): ProcessSaveLockOwner | null {
  if (!lockKey || processLocks.has(lockKey)) return null;
  const owner = Symbol(lockKey);
  processLocks.set(lockKey, owner);
  return owner;
}

export function acquireProcessSaveLock(lockKey: string): boolean {
  return acquireOwnedProcessSaveLock(lockKey) != null;
}

/**
 * Release a process reservation.
 * When `owner` is provided, only that owner may clear the key — a stale
 * cleanup must not drop a newer operation's reservation.
 */
export function releaseProcessSaveLock(lockKey: string, owner?: ProcessSaveLockOwner): void {
  if (!lockKey) return;
  if (owner !== undefined && processLocks.get(lockKey) !== owner) return;
  processLocks.delete(lockKey);
}

export function isProcessSaveLockHeld(lockKey: string): boolean {
  return processLocks.has(lockKey);
}
