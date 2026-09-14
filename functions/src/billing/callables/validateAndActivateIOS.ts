/**
 * validateAndActivateIOS — authenticated App Store purchase validation (VYD-33).
 *
 * Client may send signedTransactionInfo and an optional canonical SKU hint.
 * Never accepts uid/plan/price/expiry/entitlement/transaction ids as authority.
 *
 * Production export is fail-closed while APPSTORE_BILLING_ENABLED is not true.
 */

import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

import { createAppStoreServerApiClient } from "../apple/appleApiClient";
import { loadAppStoreRuntimeConfig } from "../apple/appleConfig";
import { isAppStoreBillingEnabled, assertAppStoreLiveBillingAllowed } from "../apple/appleConstants";
import {
  processIosSignedTransaction,
  type IosBillingDeps,
} from "../apple/appleSubscriptionAdapter";
import { createAppleSignedDataVerifier } from "../apple/appleVerifier";
import { diagnosticUidHmac } from "../diagnosticUid";
import { BillingError } from "../errors";
import { FirestoreBillingStore } from "../firestoreBillingStore";
import { throwHttpsFromBilling } from "../google/billingHttps";
import { consumeBillingRateLimit } from "../rateLimit";

export async function handleValidateAndActivateIOS(
  deps: IosBillingDeps,
  input: {
    uid: string;
    signedTransactionInfo: unknown;
    expectedCanonicalSku?: unknown;
  }
) {
  if (!input.uid) {
    throw new BillingError({ clientCode: "not_entitled", causeCode: "unauthenticated" });
  }
  await consumeBillingRateLimit(deps.store, {
    op: "purchaseValidation",
    diagnosticUid: deps.diagnosticUidFor(input.uid),
    nowMs: deps.nowMs(),
  });
  return processIosSignedTransaction(deps, {
    signedTransactionInfo: input.signedTransactionInfo,
    callerUid: input.uid,
    source: "iosValidation",
    eventSource: "callable",
    expectedCanonicalSku: input.expectedCanonicalSku,
  });
}

function productionDeps(): IosBillingDeps {
  assertAppStoreLiveBillingAllowed();
  const cfg = loadAppStoreRuntimeConfig();
  const store = new FirestoreBillingStore(getFirestore());
  const secret = process.env.BILLING_DIAG_UID_SECRET ?? "";
  return {
    store,
    verifier: createAppleSignedDataVerifier({
      rootCaDerCerts: cfg.rootCaDerCerts,
      environment: cfg.environment,
      bundleId: cfg.bundleId,
      appAppleId: cfg.appAppleId,
      enableOnlineChecks: cfg.enableOnlineChecks === true,
    }),
    api: createAppStoreServerApiClient(cfg),
    diagnosticUidFor: (uid) => diagnosticUidHmac(secret, uid),
    nowMs: () => Date.now(),
  };
}

export const validateAndActivateIOS = onCall(
  { region: "asia-south1" },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }
    if (!isAppStoreBillingEnabled()) {
      throw new HttpsError(
        "failed-precondition",
        "App Store billing is not production-enabled."
      );
    }
    try {
      const data = (request.data ?? {}) as Record<string, unknown>;
      const result = await handleValidateAndActivateIOS(productionDeps(), {
        uid: request.auth.uid,
        signedTransactionInfo: data.signedTransactionInfo,
        expectedCanonicalSku: data.expectedCanonicalSku,
      });
      return {
        alreadyProcessed: result.alreadyProcessed,
        resultSummary: result.resultSummary,
        canonicalSku: result.canonicalSku,
        billingStatus: result.to?.billingStatus ?? null,
        entitlementActive: result.to?.entitlementActive ?? false,
      };
    } catch (err) {
      throwHttpsFromBilling(err);
    }
  }
);
