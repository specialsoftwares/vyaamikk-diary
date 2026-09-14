/**
 * Server-only Apple financial-review records (VYD-33).
 *
 * Used when Apple reports an unsupported financial correction
 * (REFUND_REVERSED, prorated refund, missing original sale, unknown
 * revocation) that must not invent a
 * `_billingReconciliationQueue.financialEventId`.
 *
 * Core identity is reason/platform/transaction ids/uid/canonicalSku.
 * `diagnosticUid` is forensic only and is not identity — so a future
 * BILLING_DIAG_UID_SECRET rotation cannot redefine the economic review.
 *
 * `financialEventId` may be null until a real ledger row exists. A later
 * verified id may enrich null → that id once. A non-null id is immutable.
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

export function iosFullRefundMissingSaleReviewId(transactionId: string): string {
  return `ios:full-refund-missing-sale:${transactionId.replace(/\//g, "_")}`;
}

export function iosUnsupportedRevocationReviewId(transactionId: string): string {
  return `ios:unsupported-revocation:${transactionId.replace(/\//g, "_")}`;
}

function nullishSku(value: string | null | undefined): string | null {
  return value == null ? null : value;
}

function assertReviewCoreIdentity(
  existing: AppStoreFinancialReviewDoc | undefined,
  input: {
    reason: string;
    transactionId: string;
    originalTransactionId: string;
    uid: string;
    canonicalSku: string | null;
  }
): asserts existing is AppStoreFinancialReviewDoc {
  if (
    !existing ||
    existing.reason !== input.reason ||
    existing.platform !== "ios" ||
    existing.transactionId !== input.transactionId ||
    existing.originalTransactionId !== input.originalTransactionId ||
    existing.uid !== input.uid ||
    nullishSku(existing.canonicalSku) !== nullishSku(input.canonicalSku)
  ) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "ios_financial_review_identity_mismatch",
    });
  }
}

function resolvedFinancialEventId(
  existingId: string | null,
  candidateId: string | null
): { next: string | null; enrich: boolean } {
  if (existingId == null || existingId === "") {
    if (candidateId == null || candidateId === "") {
      return { next: null, enrich: false };
    }
    return { next: candidateId, enrich: true };
  }
  if (candidateId == null || candidateId === "" || candidateId === existingId) {
    return { next: existingId, enrich: false };
  }
  throw new BillingError({
    clientCode: "internal_error",
    causeCode: "ios_financial_review_identity_mismatch",
  });
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
): Promise<{ created: boolean; enriched: boolean }> {
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
  const core = {
    reason: input.reason,
    transactionId: input.transactionId,
    originalTransactionId: input.originalTransactionId,
    uid: input.uid,
    canonicalSku: input.canonicalSku,
  };

  const applyExisting = async (
    existing: AppStoreFinancialReviewDoc,
    tx: { set: (path: string, data: Record<string, unknown>) => void }
  ): Promise<{ created: false; enriched: boolean }> => {
    assertReviewCoreIdentity(existing, core);
    const { next, enrich } = resolvedFinancialEventId(
      existing.financialEventId ?? null,
      input.financialEventId
    );
    if (!enrich) {
      return { created: false, enriched: false };
    }
    const updated: AppStoreFinancialReviewDoc = {
      ...existing,
      financialEventId: next,
      financialEventLinkedAt: existing.financialEventLinkedAt ?? input.nowMs,
      updatedAt: input.nowMs,
    };
    tx.set(path, updated as unknown as Record<string, unknown>);
    return { created: false, enriched: true };
  };

  try {
    return await store.runTransaction(async (tx) => {
      const snap = await tx.get(path);
      if (snap.exists) {
        return applyExisting(snap.data() as unknown as AppStoreFinancialReviewDoc, tx);
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
        financialEventLinkedAt: null,
      };
      tx.create(path, doc as unknown as Record<string, unknown>);
      return { created: true, enriched: false };
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
        return applyExisting(snap.data() as unknown as AppStoreFinancialReviewDoc, tx);
      });
    }
    throw err;
  }
}

export async function readAppStoreFinancialReview(
  store: BillingStore,
  id: string
): Promise<AppStoreFinancialReviewDoc | null> {
  const path = appStoreFinancialReviewPath(sanitizeDocId(id));
  return store.runTransaction(async (tx) => {
    const snap = await tx.get(path);
    if (!snap.exists) return null;
    return snap.data() as unknown as AppStoreFinancialReviewDoc;
  });
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
