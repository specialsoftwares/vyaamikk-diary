/**
 * Production store revalidation for the reconciliation consumer.
 * Decrypts only in-process; never writes plaintext credentials to the queue
 * or logs. Callers inject Play/App Store adapters — this module does not
 * grant from notification type or queue reason.
 *
 * Queue credentialFingerprint is forensic only. Current company credentials
 * are authoritative; an obsolete queue fingerprint must not reject a live token.
 */

import { credentialFingerprint, type CredentialCipher } from "./crypto";
import { BillingError } from "./errors";
import { processAndroidPurchaseToken, type AndroidBillingDeps } from "./google/androidSubscriptionAdapter";
import { reconcileIosOriginalTransaction, type IosBillingDeps } from "./apple/appleSubscriptionAdapter";
import { companyBillingPath } from "./paths";
import type { BillingStore } from "./store";
import type { CompanyBillingDoc } from "./types";
import type {
  StoreRevalidateInput,
  StoreRevalidateOutcome,
  StoreRevalidator,
} from "./reconciliationConsumer";

async function readCompany(store: BillingStore, uid: string): Promise<CompanyBillingDoc | null> {
  return store.runTransaction(async (tx) => {
    const snap = await tx.get(companyBillingPath(uid));
    if (!snap.exists) return null;
    return snap.data() as unknown as CompanyBillingDoc;
  });
}

function mapAndroidResult(result: {
  skipped: string | null;
  uid: string;
  resultSummary: string;
  to: unknown;
  reconciliationRequired: boolean;
  alreadyProcessed: boolean;
}, expectedUid: string): StoreRevalidateOutcome {
  if (result.skipped === "pending" || result.skipped === "pending_purchase_canceled") {
    return { kind: "pending", resultSummary: result.skipped };
  }
  if (result.skipped) {
    return { kind: "pending", resultSummary: result.skipped };
  }
  if (result.uid && result.uid !== expectedUid) {
    return { kind: "stale", resultSummary: "ownership_mismatch" };
  }
  if (result.reconciliationRequired && !result.to) {
    return { kind: "pending", resultSummary: "reconciliation_required" };
  }
  return { kind: "verified", resultSummary: result.resultSummary };
}

export function createAndroidStoreRevalidator(
  deps: AndroidBillingDeps,
  cipher: CredentialCipher
): StoreRevalidator {
  return async (input: StoreRevalidateInput): Promise<StoreRevalidateOutcome> => {
    if (input.platform !== "android") {
      return {
        kind: "terminal",
        resultSummary: "reconciliation_platform_mismatch",
        causeCode: "reconciliation_platform_mismatch",
      };
    }
    const company = await readCompany(deps.store, input.uid);
    if (!company?.encryptedPurchaseCredential || !company.credentialFingerprint) {
      return {
        kind: "terminal",
        resultSummary: "missing_credentials",
        causeCode: "missing_credentials",
      };
    }
    const plaintext = await cipher.decryptCredential(company.encryptedPurchaseCredential);
    if (credentialFingerprint(plaintext) !== company.credentialFingerprint) {
      return {
        kind: "terminal",
        resultSummary: "credential_fingerprint_mismatch",
        causeCode: "credential_fingerprint_mismatch",
      };
    }
    try {
      const result = await processAndroidPurchaseToken(deps, {
        purchaseToken: plaintext,
        callerUid: input.uid,
        expectedUid: input.uid,
        source: "scheduler",
        eventSource: "scheduler",
      });
      return mapAndroidResult(result, input.uid);
    } catch (err) {
      if (err instanceof BillingError && err.retryable === true) {
        return {
          kind: "transient",
          resultSummary: err.causeCode,
          causeCode: err.causeCode,
        };
      }
      const code = err instanceof BillingError ? err.causeCode : "reconciliation_terminal";
      return { kind: "terminal", resultSummary: code, causeCode: code };
    }
  };
}

export function createIosStoreRevalidator(deps: IosBillingDeps): StoreRevalidator {
  return async (input: StoreRevalidateInput): Promise<StoreRevalidateOutcome> => {
    if (input.platform !== "ios") {
      return {
        kind: "terminal",
        resultSummary: "reconciliation_platform_mismatch",
        causeCode: "reconciliation_platform_mismatch",
      };
    }
    const company = await readCompany(deps.store, input.uid);
    if (!company?.originalTransactionId) {
      return {
        kind: "terminal",
        resultSummary: "missing_credentials",
        causeCode: "missing_credentials",
      };
    }
    try {
      const result = await reconcileIosOriginalTransaction(deps, {
        originalTransactionId: company.originalTransactionId,
        expectedUid: input.uid,
        source: "scheduler",
        eventSource: "scheduler",
        observationTime: deps.nowMs(),
      });
      if (result.skipped) {
        return { kind: "pending", resultSummary: result.skipped };
      }
      if (result.uid && result.uid !== input.uid) {
        return { kind: "stale", resultSummary: "ownership_mismatch" };
      }
      return { kind: "verified", resultSummary: result.resultSummary };
    } catch (err) {
      if (err instanceof BillingError && err.retryable === true) {
        return {
          kind: "transient",
          resultSummary: err.causeCode,
          causeCode: err.causeCode,
        };
      }
      const code = err instanceof BillingError ? err.causeCode : "reconciliation_terminal";
      return { kind: "terminal", resultSummary: code, causeCode: code };
    }
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
