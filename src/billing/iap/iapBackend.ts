/**
 * Authenticated billing callables (asia-south1).
 *
 * Store credentials are sent to Vyaamikk backend only. Never log tokens/JWS.
 * Production Functions remain fail-closed (PLAY_BILLING_ENABLED /
 * APPSTORE_BILLING_ENABLED unchanged).
 */

import { getFunctions, httpsCallable } from "firebase/functions";

import { getFirebaseApp } from "@/config/firebase";
import { env } from "@/config/env";
import { canonicalFunctionsRegion } from "@/services/auth/authFlowErrorPresentation";
import { AppError } from "@/domain/errors";

import { isUuidAppAccountToken } from "./iapAccountBinding";
import type {
  AndroidValidationResult,
  CanonicalSku,
  IapBackend,
  IosValidationResult,
} from "./iapTypes";

export { assertServerObfuscatedAccountId, isUuidAppAccountToken } from "./iapAccountBinding";

function functionsRegion(): string {
  return canonicalFunctionsRegion(env.firebase.functionsRegion);
}

function callables() {
  const app = getFirebaseApp();
  return getFunctions(app, functionsRegion() || undefined);
}

async function callBilling<TReq, TRes>(name: string, data: TReq): Promise<TRes> {
  try {
    const callable = httpsCallable<TReq, TRes>(callables(), name);
    const result = await callable(data);
    return result.data;
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : "";
    if (code.includes("unauthenticated")) {
      throw new AppError("session_expired", "Sign in required.");
    }
    throw new AppError("unknown", "Couldn't complete billing. Please try again.");
  }
}

export async function prepareAndroidBillingAccountClient(): Promise<{
  obfuscatedAccountId: string;
}> {
  const data = await callBilling<Record<string, never>, { obfuscatedAccountId?: unknown }>(
    "prepareAndroidBillingAccount",
    {}
  );
  if (typeof data.obfuscatedAccountId !== "string" || !data.obfuscatedAccountId) {
    throw new AppError("unknown", "Couldn't complete billing. Please try again.");
  }
  return { obfuscatedAccountId: data.obfuscatedAccountId };
}

export async function validateAndActivateAndroidClient(input: {
  purchaseToken: string;
  expectedCanonicalSku?: CanonicalSku;
}): Promise<AndroidValidationResult> {
  const payload: {
    purchaseToken: string;
    expectedCanonicalSku?: CanonicalSku;
  } = { purchaseToken: input.purchaseToken };
  if (input.expectedCanonicalSku) {
    payload.expectedCanonicalSku = input.expectedCanonicalSku;
  }
  const data = await callBilling<typeof payload, AndroidValidationResult>(
    "validateAndActivateAndroid",
    payload
  );
  return {
    alreadyProcessed: data.alreadyProcessed === true,
    acknowledged: data.acknowledged === true,
    resultSummary: data.resultSummary,
    canonicalSku: data.canonicalSku ?? null,
    billingStatus: data.billingStatus ?? null,
    entitlementActive: data.entitlementActive === true,
  };
}

export async function prepareIOSBillingAccountClient(): Promise<{
  appAccountToken: string;
}> {
  const data = await callBilling<Record<string, never>, { appAccountToken?: unknown }>(
    "prepareIOSBillingAccount",
    {}
  );
  if (typeof data.appAccountToken !== "string" || !isUuidAppAccountToken(data.appAccountToken)) {
    throw new AppError("unknown", "Couldn't complete billing. Please try again.");
  }
  return { appAccountToken: data.appAccountToken };
}

export async function validateAndActivateIOSClient(input: {
  signedTransactionInfo: string;
  expectedCanonicalSku?: CanonicalSku;
}): Promise<IosValidationResult> {
  const payload: {
    signedTransactionInfo: string;
    expectedCanonicalSku?: CanonicalSku;
  } = { signedTransactionInfo: input.signedTransactionInfo };
  if (input.expectedCanonicalSku) {
    payload.expectedCanonicalSku = input.expectedCanonicalSku;
  }
  const data = await callBilling<typeof payload, IosValidationResult>(
    "validateAndActivateIOS",
    payload
  );
  return {
    alreadyProcessed: data.alreadyProcessed === true,
    resultSummary: data.resultSummary,
    canonicalSku: data.canonicalSku ?? null,
    billingStatus: data.billingStatus ?? null,
    entitlementActive: data.entitlementActive === true,
  };
}

export function createFirebaseIapBackend(): IapBackend {
  return {
    prepareAndroidBillingAccount: prepareAndroidBillingAccountClient,
    validateAndActivateAndroid: validateAndActivateAndroidClient,
    prepareIOSBillingAccount: prepareIOSBillingAccountClient,
    validateAndActivateIOS: validateAndActivateIOSClient,
  };
}
