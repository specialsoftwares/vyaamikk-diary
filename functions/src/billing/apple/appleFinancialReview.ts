/**
 * Server-only Apple financial-review records (VYD-33).
 *
 * Used when Apple reports an unsupported financial correction
 * (REFUND_REVERSED, prorated refund) that must not invent a
 * `_billingReconciliationQueue.financialEventId`.
 *
 * `financialEventId` is set only when a real `_billingEventLedger` row exists
 * and has been integrity-checked. Never stores raw JWS or private keys.
 *
 * Review `status` stays `pending`. Current entitlement is still applied from
 * Get All Subscription Statuses; `entitlementReconciledAt` is a one-time
 * forensic marker, not an access grant.
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

function nullishSku(value: string | null | undefined): string | null {
  return value == null ? null : value;
}

function assertReviewIdentity(
  existing: AppStoreFinancialReviewDoc | undefined,
  input: {
    reason: string;
    transactionId: string;
    originalTransactionId: string;
    financialEventId: string | null;
    uid: string;
    canonicalSku: string | null;
    diagnosticUid: string;
  }
): void {
  if (
    !existing ||
    existing.reason !== input.reason ||
    existing.platform !== "ios" ||
    existing.transactionId !== input.transactionId ||
    existing.originalTransactionId !== input.originalTransactionId ||
    (existing.financialEventId ?? null) !== (input.financialEventId ?? null) ||
    existing.uid !== input.uid ||
    nullishSku(existing.canonicalSku) !== nullishSku(input.canonicalSku) ||
    existing.diagnosticUid !== input.diagnosticUid
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
    uid: input.uid,
    canonicalSku: input.canonicalSku,
    diagnosticUid: input.diagnosticUid,
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
        entitlementReconciledAt: null,
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

export async function markAppStoreFinancialReviewEntitlementReconciled(
  store: BillingStore,
  input: { id: string; uid: string; nowMs: number }
): Promise<void> {
  const path = appStoreFinancialReviewPath(sanitizeDocId(input.id));
  await store.runTransaction(async (tx) => {
    const snap = await tx.get(path);
    if (!snap.exists) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "missing_ios_financial_review",
      });
    }
    const existing = snap.data() as unknown as AppStoreFinancialReviewDoc;
    if (existing.uid !== input.uid || existing.platform !== "ios") {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "ios_financial_review_identity_mismatch",
      });
    }
    if (existing.entitlementReconciledAt != null) {
      return;
    }
    const next: AppStoreFinancialReviewDoc = {
      ...existing,
      entitlementReconciledAt: input.nowMs,
      updatedAt: input.nowMs,
    };
    tx.set(path, next as unknown as Record<string, unknown>);
  });
}
