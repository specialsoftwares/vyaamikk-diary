/**
 * Server-only durable reconciliation work items (VYD-32).
 *
 * Written when a verified financial event is recorded but live entitlement
 * cannot be authoritatively reconciled. A later phase may consume the queue.
 * No worker is deployed in VYD-32.
 *
 * Never stores raw purchase tokens, plaintext credentials, or uid.
 */

import { BillingError } from "./errors";
import { AlreadyExistsError, type BillingStore } from "./store";
import { billingReconciliationQueuePath, sanitizeDocId } from "./paths";
import type { BillingPlatform, BillingReconciliationQueueDoc } from "./types";

export function refundReconciliationQueueId(orderId: string): string {
  return `android:refund-reconcile:${orderId.replace(/\//g, "_")}`;
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
        const existing = snap.data() as BillingReconciliationQueueDoc | undefined;
        if (
          existing &&
          (existing.financialEventId !== input.financialEventId || existing.platform !== input.platform)
        ) {
          throw new BillingError({
            clientCode: "internal_error",
            causeCode: "reconciliation_queue_identity_mismatch",
          });
        }
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
      };
      tx.create(path, doc as unknown as Record<string, unknown>);
      return { created: true };
    });
  } catch (err) {
    if (err instanceof AlreadyExistsError) {
      return { created: false };
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
    if (existing.financialEventId !== input.financialEventId || existing.platform !== input.platform) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "reconciliation_queue_identity_mismatch",
      });
    }
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
