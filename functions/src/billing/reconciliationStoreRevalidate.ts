/**
 * Production store revalidation for the reconciliation consumer.
 * Decrypts only in-process; never writes plaintext credentials to the queue
 * or logs. Callers inject Play/App Store adapters — this module does not
 * grant from notification type or queue reason.
 */

import { credentialFingerprint, type CredentialCipher } from "./crypto";
import { BillingError } from "./errors";
import { processAndroidPurchaseToken, type AndroidBillingDeps } from "./google/androidSubscriptionAdapter";
import { reconcileIosOriginalTransaction, type IosBillingDeps } from "./apple/appleSubscriptionAdapter";
import { companyBillingPath } from "./paths";
import type { BillingStore } from "./store";
import type { CompanyBillingDoc } from "./types";
import type { StoreRevalidateInput, StoreRevalidator } from "./reconciliationConsumer";

async function readCompany(store: BillingStore, uid: string): Promise<CompanyBillingDoc | null> {
  return store.runTransaction(async (tx) => {
    const snap = await tx.get(companyBillingPath(uid));
    if (!snap.exists) return null;
    return snap.data() as unknown as CompanyBillingDoc;
  });
}

export function createAndroidStoreRevalidator(
  deps: AndroidBillingDeps,
  cipher: CredentialCipher
): StoreRevalidator {
  return async (input: StoreRevalidateInput) => {
    if (input.platform !== "android") {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "reconciliation_platform_mismatch",
      });
    }
    const company = await readCompany(deps.store, input.uid);
    if (!company?.encryptedPurchaseCredential || !company.credentialFingerprint) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "missing_credentials",
      });
    }
    const plaintext = await cipher.decryptCredential(company.encryptedPurchaseCredential);
    if (credentialFingerprint(plaintext) !== company.credentialFingerprint) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "credential_fingerprint_mismatch",
      });
    }
    const result = await processAndroidPurchaseToken(deps, {
      purchaseToken: plaintext,
      callerUid: input.uid,
      expectedUid: input.uid,
      source: "scheduler",
      eventSource: "scheduler",
    });
    return { resultSummary: result.resultSummary };
  };
}

export function createIosStoreRevalidator(deps: IosBillingDeps): StoreRevalidator {
  return async (input: StoreRevalidateInput) => {
    if (input.platform !== "ios") {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "reconciliation_platform_mismatch",
      });
    }
    const company = await readCompany(deps.store, input.uid);
    if (!company?.originalTransactionId) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "missing_credentials",
      });
    }
    const result = await reconcileIosOriginalTransaction(deps, {
      originalTransactionId: company.originalTransactionId,
      expectedUid: input.uid,
      source: "scheduler",
      eventSource: "scheduler",
      observationTime: deps.nowMs(),
    });
    return { resultSummary: result.resultSummary };
  };
}

export function createPlatformStoreRevalidator(input: {
  android: StoreRevalidator;
  ios: StoreRevalidator;
}): StoreRevalidator {
  return async (req) => {
    if (req.platform === "android") return input.android(req);
    return input.ios(req);
  };
}
