/**
 * Server-only durable reconciliation work items (VYD-32/VYD-39).
 *
 * Written when a verified financial event is recorded but live entitlement
 * cannot be authoritatively reconciled. VYD-39 consumes the queue with
 * leases, backoff and injected store revalidation. Never stores raw purchase
 * tokens, plaintext credentials, or uid.
 */

import { BillingError } from "./errors";
import { AlreadyExistsError, type BillingStore } from "./store";
import { billingReconciliationQueuePath, sanitizeDocId } from "./paths";
import type { BillingPlatform, BillingReconciliationQueueDoc } from "./types";

export function refundReconciliationQueueId(orderId: string): string {
  return `android:refund-reconcile:${orderId.replace(/\//g, "_")}`;
}

/**
 * Incident discriminator for iOS status-reconciliation work.
 * Callable retries share one deterministic item. Each ASSN
 * `notificationUUID` is a separate immutable incident.
 */
export type IosStatusReconciliationIncident =
  | { readonly kind: "callable" }
  | { readonly kind: "assn"; readonly notificationUUID: string };

export const IOS_CALLABLE_RECONCILIATION_INCIDENT = {
  kind: "callable",
} as const satisfies IosStatusReconciliationIncident;

function sanitizeQueueSegment(value: string): string {
  return value.replace(/\//g, "_");
}

export function iosStatusReconciliationQueueId(
  originalTransactionId: string,
  financialEventId: string,
  incident: IosStatusReconciliationIncident
): string {
  const orig = sanitizeQueueSegment(originalTransactionId);
  const event = sanitizeQueueSegment(financialEventId);
  if (incident.kind === "callable") {
    return `ios:status-reconcile:${orig}:${event}:callable`;
  }
  return `ios:status-reconcile:${orig}:${event}:assn:${sanitizeQueueSegment(incident.notificationUUID)}`;
}

function assertReconciliationQueueIdentity(
  existing: BillingReconciliationQueueDoc | undefined,
  input: { platform: BillingPlatform; financialEventId: string }
): void {
  if (
    !existing ||
    existing.financialEventId !== input.financialEventId ||
    existing.platform !== input.platform
  ) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "reconciliation_queue_identity_mismatch",
    });
  }
}

async function readAndAssertQueueIdentity(
  store: BillingStore,
  path: string,
  input: { platform: BillingPlatform; financialEventId: string }
): Promise<{ created: false }> {
  return store.runTransaction(async (tx) => {
    const snap = await tx.get(path);
    if (!snap.exists) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "reconciliation_queue_identity_mismatch",
      });
    }
    assertReconciliationQueueIdentity(snap.data() as BillingReconciliationQueueDoc | undefined, input);
    return { created: false as const };
  });
}

export async function ensureReconciliationWorkItem(
  store: BillingStore,
  input: {
    id: string;
    reason: string;
    platform: BillingPlatform;
    financialEventId: string;
    credentialFingerprint?: string | null;
    nowMs: number;
  }
): Promise<{ created: boolean }> {
  const path = billingReconciliationQueuePath(sanitizeDocId(input.id));
  try {
    return await store.runTransaction(async (tx) => {
      const snap = await tx.get(path);
      if (snap.exists) {
        assertReconciliationQueueIdentity(
          snap.data() as BillingReconciliationQueueDoc | undefined,
          input
        );
        return { created: false };
      }
      const doc: BillingReconciliationQueueDoc = {
        reason: input.reason,
        platform: input.platform,
        financialEventId: input.financialEventId,
        credentialFingerprint: input.credentialFingerprint ?? null,
        createdAt: input.nowMs,
        updatedAt: input.nowMs,
        resolvedAt: null,
        status: "pending",
        attemptCount: 0,
        leaseOwner: null,
        leaseExpiresAt: null,
        nextAttemptAt: input.nowMs,
        lastErrorCode: null,
        terminalReason: null,
      };
      tx.create(path, doc as unknown as Record<string, unknown>);
      return { created: true };
    });
  } catch (err) {
    if (err instanceof AlreadyExistsError) {
      // Create lost a race: re-read the winner. Do not return success on
      // a mismatched identity merely because another writer committed first.
      return readAndAssertQueueIdentity(store, path, input);
    }
    throw err;
  }
}

/**
 * Mark a queue item resolved after authoritative live reconciliation.
 * Missing item is a no-op. Identity mismatch fails closed. Duplicate
 * success leaves forensic history (status stays resolved).
 */
export async function resolveReconciliationWorkItem(
  store: BillingStore,
  input: {
    id: string;
    platform: BillingPlatform;
    financialEventId: string;
    nowMs: number;
  }
): Promise<{ existed: boolean; changed: boolean }> {
  const path = billingReconciliationQueuePath(sanitizeDocId(input.id));
  return store.runTransaction(async (tx) => {
    const snap = await tx.get(path);
    if (!snap.exists) {
      return { existed: false, changed: false };
    }
    const existing = snap.data() as BillingReconciliationQueueDoc | undefined;
    if (!existing) {
      return { existed: false, changed: false };
    }
    assertReconciliationQueueIdentity(existing, input);
    if (existing.status === "resolved") {
      return { existed: true, changed: false };
    }
    const next: BillingReconciliationQueueDoc = {
      ...existing,
      status: "resolved",
      resolvedAt: existing.resolvedAt ?? input.nowMs,
      updatedAt: input.nowMs,
    };
    tx.set(path, next as unknown as Record<string, unknown>);
    return { existed: true, changed: true };
  });
}

export const RECONCILIATION_LEASE_MS = 60_000;
export const RECONCILIATION_MAX_ATTEMPTS = 12;

export function reconciliationBackoffMs(attemptCount: number): number {
  const exp = Math.min(Math.max(attemptCount, 0), 8);
  return Math.min(30_000 * 2 ** exp, 15 * 60_000);
}

function isDue(doc: BillingReconciliationQueueDoc, nowMs: number): boolean {
  const next = doc.nextAttemptAt ?? 0;
  return next <= nowMs;
}

function leaseHeldByOther(
  doc: BillingReconciliationQueueDoc,
  nowMs: number,
  workerId: string
): boolean {
  if (doc.status !== "leased") return false;
  const expires = doc.leaseExpiresAt ?? 0;
  if (expires <= nowMs) return false;
  return (doc.leaseOwner ?? "") !== workerId;
}

export async function claimReconciliationWorkItem(
  store: BillingStore,
  input: {
    id: string;
    workerId: string;
    nowMs: number;
    leaseMs?: number;
    maxAttempts?: number;
  }
): Promise<{ claimed: boolean; doc: BillingReconciliationQueueDoc | null }> {
  const path = billingReconciliationQueuePath(sanitizeDocId(input.id));
  const leaseMs = input.leaseMs ?? RECONCILIATION_LEASE_MS;
  const maxAttempts = input.maxAttempts ?? RECONCILIATION_MAX_ATTEMPTS;
  return store.runTransaction(async (tx) => {
    const snap = await tx.get(path);
    if (!snap.exists) return { claimed: false, doc: null };
    const existing = snap.data() as BillingReconciliationQueueDoc | undefined;
    if (!existing) return { claimed: false, doc: null };
    if (existing.status === "resolved" || existing.status === "terminal") {
      return { claimed: false, doc: existing };
    }
    if (leaseHeldByOther(existing, input.nowMs, input.workerId)) {
      return { claimed: false, doc: existing };
    }
    if (!isDue(existing, input.nowMs)) {
      return { claimed: false, doc: existing };
    }
    if (existing.attemptCount >= maxAttempts) {
      const terminal: BillingReconciliationQueueDoc = {
        ...existing,
        status: "terminal",
        terminalReason: "retry_exhausted",
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: input.nowMs,
      };
      tx.set(path, terminal as unknown as Record<string, unknown>);
      return { claimed: false, doc: terminal };
    }
    const next: BillingReconciliationQueueDoc = {
      ...existing,
      status: "leased",
      leaseOwner: input.workerId,
      leaseExpiresAt: input.nowMs + leaseMs,
      attemptCount: existing.attemptCount + 1,
      updatedAt: input.nowMs,
    };
    tx.set(path, next as unknown as Record<string, unknown>);
    return { claimed: true, doc: next };
  });
}

export async function markReconciliationRetryable(
  store: BillingStore,
  input: {
    id: string;
    workerId: string;
    nowMs: number;
    errorCode: string;
  }
): Promise<void> {
  const path = billingReconciliationQueuePath(sanitizeDocId(input.id));
  await store.runTransaction(async (tx) => {
    const snap = await tx.get(path);
    if (!snap.exists) return;
    const existing = snap.data() as BillingReconciliationQueueDoc | undefined;
    if (!existing || existing.status !== "leased") return;
    if ((existing.leaseOwner ?? "") !== input.workerId) return;
    const next: BillingReconciliationQueueDoc = {
      ...existing,
      status: "failed_retryable",
      leaseOwner: null,
      leaseExpiresAt: null,
      lastErrorCode: input.errorCode,
      nextAttemptAt: input.nowMs + reconciliationBackoffMs(existing.attemptCount),
      updatedAt: input.nowMs,
    };
    tx.set(path, next as unknown as Record<string, unknown>);
  });
}

export async function markReconciliationTerminal(
  store: BillingStore,
  input: {
    id: string;
    workerId: string;
    nowMs: number;
    reason: string;
  }
): Promise<void> {
  const path = billingReconciliationQueuePath(sanitizeDocId(input.id));
  await store.runTransaction(async (tx) => {
    const snap = await tx.get(path);
    if (!snap.exists) return;
    const existing = snap.data() as BillingReconciliationQueueDoc | undefined;
    if (!existing || existing.status !== "leased") return;
    if ((existing.leaseOwner ?? "") !== input.workerId) return;
    const next: BillingReconciliationQueueDoc = {
      ...existing,
      status: "terminal",
      terminalReason: input.reason,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastErrorCode: input.reason,
      updatedAt: input.nowMs,
    };
    tx.set(path, next as unknown as Record<string, unknown>);
  });
}

export async function operatorRequeueReconciliationWorkItem(
  store: BillingStore,
  input: { id: string; nowMs: number }
): Promise<{ existed: boolean; changed: boolean }> {
  const path = billingReconciliationQueuePath(sanitizeDocId(input.id));
  return store.runTransaction(async (tx) => {
    const snap = await tx.get(path);
    if (!snap.exists) return { existed: false, changed: false };
    const existing = snap.data() as BillingReconciliationQueueDoc | undefined;
    if (!existing) return { existed: false, changed: false };
    if (existing.status === "resolved") {
      return { existed: true, changed: false };
    }
    const next: BillingReconciliationQueueDoc = {
      ...existing,
      status: "pending",
      leaseOwner: null,
      leaseExpiresAt: null,
      nextAttemptAt: input.nowMs,
      terminalReason: null,
      updatedAt: input.nowMs,
    };
    tx.set(path, next as unknown as Record<string, unknown>);
    return { existed: true, changed: true };
  });
}
