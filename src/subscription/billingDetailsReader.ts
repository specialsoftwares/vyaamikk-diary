/**
 * Owner-read of users/{uid}/subscription/billingDetails. Clients never write
 * this document; save goes through updateBillingDetails.
 */

import { doc, getDoc } from "firebase/firestore";

import { getFirebaseDb } from "@/config/firebase";
import { isFirebaseConfigured } from "@/config/env";

export interface ClientBillingDetails {
  gstin: string | null;
  billingRecipientName: string | null;
  billingBusinessName: string | null;
  billingAddressLine1: string | null;
  billingAddressLine2: string | null;
  billingCity: string | null;
  billingPostalCode: string | null;
  billingStateCode: string | null;
  billingStateName: string | null;
  gstinVerificationStatus: string | null;
  updatedAt: number | null;
}

export type BillingDetailsRead =
  | { kind: "ok"; details: ClientBillingDetails }
  | { kind: "missing" }
  | { kind: "unavailable"; code: string };

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function emptyBillingDetails(): ClientBillingDetails {
  return {
    gstin: null,
    billingRecipientName: null,
    billingBusinessName: null,
    billingAddressLine1: null,
    billingAddressLine2: null,
    billingCity: null,
    billingPostalCode: null,
    billingStateCode: null,
    billingStateName: null,
    gstinVerificationStatus: null,
    updatedAt: null,
  };
}

export async function readOwnerBillingDetails(uid: string): Promise<BillingDetailsRead> {
  if (!uid || !isFirebaseConfigured()) {
    return { kind: "unavailable", code: "not_configured" };
  }
  try {
    const snap = await getDoc(doc(getFirebaseDb(), "users", uid, "subscription", "billingDetails"));
    if (!snap.exists()) return { kind: "missing" };
    const data = snap.data() as Record<string, unknown>;
    return {
      kind: "ok",
      details: {
        gstin: text(data.gstin),
        billingRecipientName: text(data.billingRecipientName),
        billingBusinessName: text(data.billingBusinessName),
        billingAddressLine1: text(data.billingAddressLine1),
        billingAddressLine2: text(data.billingAddressLine2),
        billingCity: text(data.billingCity),
        billingPostalCode: text(data.billingPostalCode),
        billingStateCode: text(data.billingStateCode),
        billingStateName: text(data.billingStateName),
        gstinVerificationStatus: text(data.gstinVerificationStatus),
        updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : null,
      },
    };
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "unknown";
    return { kind: "unavailable", code };
  }
}
