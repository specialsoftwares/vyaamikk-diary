/**
 * updateBillingDetails callable client. Never writes billingDetails in Firestore.
 */

import { getFunctions, httpsCallable } from "firebase/functions";

import { getFirebaseApp } from "@/config/firebase";
import { env } from "@/config/env";
import { canonicalFunctionsRegion } from "@/services/auth/authFlowErrorPresentation";
import { AppError } from "@/domain/errors";

export type UpdateBillingDetailsPayload = {
  gstin?: string | null;
  billingRecipientName?: string | null;
  billingBusinessName?: string | null;
  billingAddressLine1?: string | null;
  billingAddressLine2?: string | null;
  billingCity?: string | null;
  billingPostalCode?: string | null;
  billingStateCode?: string | null;
  billingStateName?: string | null;
};

export type BillingDetailsSaveResult =
  | { kind: "saved" }
  | { kind: "gstin_format_invalid" }
  | { kind: "unavailable"; message: string }
  | { kind: "failed"; message: string; recoverable: boolean };

function functionsRegion(): string {
  return canonicalFunctionsRegion(env.firebase.functionsRegion);
}

export async function saveBillingDetailsClient(
  payload: UpdateBillingDetailsPayload
): Promise<BillingDetailsSaveResult> {
  try {
    const callable = httpsCallable<UpdateBillingDetailsPayload, unknown>(
      getFunctions(getFirebaseApp(), functionsRegion() || undefined),
      "updateBillingDetails"
    );
    await callable(payload);
    return { kind: "saved" };
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : "";
    const message =
      e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "";
    if (code.includes("unauthenticated")) {
      throw new AppError("session_expired", "Sign in required.");
    }
    if (code.includes("invalid-argument") && /invalid gst number format/i.test(message)) {
      return { kind: "gstin_format_invalid" };
    }
    if (code.includes("failed-precondition") || code.includes("unimplemented")) {
      return {
        kind: "unavailable",
        message: "Billing details cannot be saved in this configuration yet.",
      };
    }
    return {
      kind: "failed",
      message: "Couldn't save billing details. Please try again.",
      recoverable: true,
    };
  }
}
