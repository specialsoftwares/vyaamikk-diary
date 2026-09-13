/**
 * Server-only durable reconciliation work items (VYD-32).
 *
 * Written when a verified financial event is recorded but live entitlement
 * cannot be authoritatively reconciled. A later phase may consume the queue.
 * No worker is deployed in VYD-32.
 *
 * Never stores raw purchase tokens, plaintext credentials, or uid.
 */

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
        return { created: false };
      }
      const doc: BillingReconciliationQueueDoc = {
        reason: input.reason,
        platform: input.platform,
        financialEventId: input.financialEventId,
        credentialFingerprint: input.credentialFingerprint ?? null,
        createdAt: input.nowMs,
        updatedAt: input.nowMs,
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
