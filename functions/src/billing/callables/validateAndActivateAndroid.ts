/**
 * validateAndActivateAndroid — authenticated purchase validation (VYD-32).
 *
 * Client may send purchaseToken and an optional canonical SKU hint.
 * Never accepts uid/plan/price/expiry/entitlement/order amount as authority.
 *
 * Production export is fail-closed while PLAY_BILLING_ENABLED is not true.
 * Core handler is fully testable through injected deps.
 */

import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

import { createProductionCredentialCipher } from "../crypto";
import { diagnosticUidHmac } from "../diagnosticUid";
import { BillingError } from "../errors";
import { FirestoreBillingStore } from "../firestoreBillingStore";
import { throwHttpsFromBilling } from "../google/billingHttps";
import { GoogleCloudKmsKeyClient } from "../google/kmsAdcClient";
import {
  processAndroidPurchaseToken,
  type AndroidBillingDeps,
} from "../google/androidSubscriptionAdapter";
import {
  billingKmsKeyNameFromEnv,
  isPlayBillingEnabled,
  playPackageNameFromEnv,
} from "../google/playConstants";
import {
  getAndroidPublisherAccessTokenFromAdc,
  PlayApiClient,
} from "../google/playApiClient";
import { consumeBillingRateLimit } from "../rateLimit";

export async function handleValidateAndActivateAndroid(
  deps: AndroidBillingDeps,
  input: {
    uid: string;
    purchaseToken: unknown;
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
  return processAndroidPurchaseToken(deps, {
    purchaseToken: input.purchaseToken,
    callerUid: input.uid,
    source: "androidValidation",
    eventSource: "callable",
    expectedCanonicalSku: input.expectedCanonicalSku,
  });
}

function productionDeps(): AndroidBillingDeps {
  const store = new FirestoreBillingStore(getFirestore());
  const secret = process.env.BILLING_DIAG_UID_SECRET ?? "";
  return {
    store,
    play: new PlayApiClient({
      getAccessToken: getAndroidPublisherAccessTokenFromAdc,
      packageName: playPackageNameFromEnv(),
    }),
    cipher: createProductionCredentialCipher({
      kms: new GoogleCloudKmsKeyClient(),
      keyName: billingKmsKeyNameFromEnv(),
    }),
    diagnosticUidFor: (uid) => diagnosticUidHmac(secret, uid),
    nowMs: () => Date.now(),
  };
}

export const validateAndActivateAndroid = onCall(
  { region: "asia-south1" },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }
    if (!isPlayBillingEnabled()) {
      throw new HttpsError(
        "failed-precondition",
        "Play billing is not production-enabled."
      );
    }
    try {
      const data = (request.data ?? {}) as Record<string, unknown>;
      const result = await handleValidateAndActivateAndroid(productionDeps(), {
        uid: request.auth.uid,
        purchaseToken: data.purchaseToken,
        expectedCanonicalSku: data.expectedCanonicalSku,
      });
      return {
        alreadyProcessed: result.alreadyProcessed,
        acknowledged: result.acknowledged,
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
