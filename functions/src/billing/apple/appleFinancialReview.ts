/**
 * Server-only Apple financial-review records (VYD-33 Round 1).
 *
 * Used when Apple reports an unsupported financial correction
 * (REFUND_REVERSED, prorated refund) that must not invent a
 * `_billingReconciliationQueue.financialEventId`.
 *
 * `financialEventId` is set only when a real `_billingEventLedger` row exists.
 * Never stores raw JWS or private keys.
 */

import { BillingError } from "../errors";
import { AlreadyExistsError, type BillingStore } from "../store";
import { appStoreFinancialReviewPath, sanitizeDocId } from "../paths";
import type { AppStoreFinancialReviewDoc } from "../types";

export function iosRefundReversedReviewId(transactionId: string): string {
  return `ios:refund-reversed:${transactionId.replace(/\//g, "_")}`;
}

export function iosProratedRefundReviewId(transactionId: string): string {
  return `ios:prorated-refund:${transactionId.replace(/\//g, "_")}`;
}

function assertReviewIdentity(
  existing: AppStoreFinancialReviewDoc | undefined,
  input: {
    reason: string;
    transactionId: string;
    originalTransactionId: string;
    financialEventId: string | null;
  }
): void {
  if (
    !existing ||
    existing.reason !== input.reason ||
    existing.platform !== "ios" ||
    existing.transactionId !== input.transactionId ||
    existing.originalTransactionId !== input.originalTransactionId ||
    (existing.financialEventId ?? null) !== (input.financialEventId ?? null)
  ) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "ios_financial_review_identity_mismatch",
    });
  }
}

export async function ensureAppStoreFinancialReview(
  store: BillingStore,
  input: {
    id: string;
    reason: string;
    transactionId: string;
    originalTransactionId: string;
    canonicalSku: string | null;
    financialEventId: string | null;
    uid: string;
    diagnosticUid: string;
    nowMs: number;
  }
): Promise<{ created: boolean }> {
  if (input.transactionId.length === 0 || input.transactionId === "unknown") {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "missing_ios_transaction_id",
    });
  }
  if (input.originalTransactionId.length === 0 || input.originalTransactionId === "unknown") {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "missing_ios_original_transaction_id",
    });
  }
  const path = appStoreFinancialReviewPath(sanitizeDocId(input.id));
  const identity = {
    reason: input.reason,
    transactionId: input.transactionId,
    originalTransactionId: input.originalTransactionId,
    financialEventId: input.financialEventId,
  };
  try {
    return await store.runTransaction(async (tx) => {
      const snap = await tx.get(path);
      if (snap.exists) {
        assertReviewIdentity(snap.data() as AppStoreFinancialReviewDoc | undefined, identity);
        return { created: false };
      }
      const doc: AppStoreFinancialReviewDoc = {
        reason: input.reason,
        platform: "ios",
        transactionId: input.transactionId,
        originalTransactionId: input.originalTransactionId,
        canonicalSku: input.canonicalSku,
        financialEventId: input.financialEventId,
        uid: input.uid,
        diagnosticUid: input.diagnosticUid,
        createdAt: input.nowMs,
        updatedAt: input.nowMs,
        status: "pending",
      };
      tx.create(path, doc as unknown as Record<string, unknown>);
      return { created: true };
    });
  } catch (err) {
    if (err instanceof AlreadyExistsError) {
      return store.runTransaction(async (tx) => {
        const snap = await tx.get(path);
        if (!snap.exists) {
          throw new BillingError({
            clientCode: "internal_error",
            causeCode: "ios_financial_review_identity_mismatch",
          });
        }
        assertReviewIdentity(snap.data() as AppStoreFinancialReviewDoc | undefined, identity);
        return { created: false as const };
      });
    }
    throw err;
  }
}
