/**
 * Operator recovery for durable reconciliation items. Fail-closed.
 * Not a public worker endpoint.
 */

import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

import { FirestoreBillingStore } from "../firestoreBillingStore";
import { throwHttpsFromBilling } from "../google/billingHttps";
import { operatorRequeueReconciliationWorkItem } from "../reconciliationQueue";
import { isBillingReconciliationOperatorEnabled } from "../reconciliationFlags";
import { assertAdminAuthorized, type AdminAuthContext } from "../tax/adminAuth";

export async function handleRetryReconciliationWorkItem(
  store: FirestoreBillingStore,
  input: { id: unknown; nowMs: number; admin: AdminAuthContext }
): Promise<{ existed: boolean; changed: boolean }> {
  assertAdminAuthorized(input.admin);
  if (typeof input.id !== "string" || !input.id.trim()) {
    throw new HttpsError("invalid-argument", "Queue item id is required.");
  }
  return operatorRequeueReconciliationWorkItem(store, {
    id: input.id.trim(),
    nowMs: input.nowMs,
  });
}

export const retryReconciliationWorkItem = onCall({ region: "asia-south1" }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  if (!isBillingReconciliationOperatorEnabled()) {
    throw new HttpsError(
      "failed-precondition",
      "Reconciliation operator recovery is not production-enabled."
    );
  }
  try {
    const token = request.auth.token as { admin?: unknown };
    const data = (request.data ?? {}) as { id?: unknown };
    const store = new FirestoreBillingStore(getFirestore());
    return await handleRetryReconciliationWorkItem(store, {
      id: data.id,
      nowMs: Date.now(),
      admin: {
        uid: request.auth.uid,
        tokenAdmin: token.admin === true,
        adminIdentityProvisioned: process.env.BILLING_ADMIN_IDENTITY_PROVISIONED === "true",
      },
    });
  } catch (err) {
    throwHttpsFromBilling(err);
  }
});
