/**
 * VYAAMIKK DIARY — INDIA GST TAX-DOCUMENT MODEL
 *
 * This module must not infer GST liability merely from the payment channel.
 *
 * IGST Act section 14 applies to specified OIDAR supplies made from a
 * non-taxable territory to a non-taxable online recipient. It is not a
 * blanket rule making Google Play or Apple the GST supplier for subscriptions
 * sold by an Indian LLP.
 *
 * For India-based Google Play developers, Google's current tax documentation
 * states that the developer remains responsible for determining applicable
 * GST on app / in-app sales; Google separately handles applicable marketplace
 * TDS / GST-TCS obligations.
 *
 * Apple tax treatment must follow the applicable Paid Apps Agreement /
 * Schedule 2, App Store tax settings and India-specific arrangement. Do not
 * assume Apple's tax responsibility until that channel has been formally
 * classified.
 *
 * Therefore tax-document generation is controlled by a verified
 * PlatformTaxPolicy, not merely by whether the buyer supplied a GSTIN.
 *
 * Direct-web/Razorpay sales, when introduced, are developer-direct supplies
 * and have their own explicitly configured GST treatment.
 *
 * Buyer GST registration determines B2B/B2C recipient classification; it
 * does NOT by itself determine whether Special Softwares or a platform is
 * responsible for charging/reporting tax.
 *
 * No tax invoice may be generated from an unconfirmed tax-responsibility
 * policy.
 */

import { HttpsError, onCall } from "firebase-functions/v2/https";

import { BillingError } from "../errors";
import { billingDetailsPath } from "../paths";
import type { BillingStore } from "../store";
import type { GstinVerificationStatus, SubscriptionBillingDetailsDoc } from "../types";
import { isKnownGstStateCode, isValidGstinFormat, normalizeGstin } from "../tax/gstin";

export interface UpdateBillingDetailsInput {
  gstin?: string | null;
  billingBusinessName?: string | null;
  billingAddressLine1?: string | null;
  billingAddressLine2?: string | null;
  billingCity?: string | null;
  billingPostalCode?: string | null;
  billingStateCode?: string | null;
  billingStateName?: string | null;
}

function cleanText(raw: unknown, max: number): string | null {
  if (raw == null) return null;
  if (typeof raw !== "string") {
    throw new BillingError({ clientCode: "invalid_purchase", causeCode: "billing_details_invalid" });
  }
  const t = raw.trim();
  if (!t) return null;
  if (t.length > max) {
    throw new BillingError({ clientCode: "invalid_purchase", causeCode: "billing_details_too_long" });
  }
  return t;
}

export async function applyUpdateBillingDetails(
  store: BillingStore,
  uid: string,
  input: UpdateBillingDetailsInput,
  nowMs: number
): Promise<SubscriptionBillingDetailsDoc> {
  if (!uid) {
    throw new BillingError({ clientCode: "not_entitled", causeCode: "unauthenticated" });
  }
  const path = billingDetailsPath(uid);
  return store.runTransaction(async (tx) => {
    const snap = await tx.get(path);
    const prior = snap.exists
      ? (snap.data() as unknown as SubscriptionBillingDetailsDoc)
      : null;

    let gstin: string | null = prior?.gstin ?? null;
    let gstinVerificationStatus: GstinVerificationStatus =
      prior?.gstinVerificationStatus ?? "not_provided";
    let verifiedLegalName = prior?.verifiedLegalName ?? null;
    let verifiedStateCode = prior?.verifiedStateCode ?? null;
    let verifiedAt = prior?.verifiedAt ?? null;
    let verifiedByDiagnosticUid = prior?.verifiedByDiagnosticUid ?? null;

    if ("gstin" in input) {
      const raw = input.gstin;
      if (raw == null || String(raw).trim() === "") {
        gstin = null;
        gstinVerificationStatus = "not_provided";
        verifiedLegalName = null;
        verifiedStateCode = null;
        verifiedAt = null;
        verifiedByDiagnosticUid = null;
      } else {
        if (!isValidGstinFormat(String(raw))) {
          throw new BillingError({
            clientCode: "invalid_purchase",
            causeCode: "gstin_format_invalid",
          });
        }
        const next = normalizeGstin(String(raw));
        if (next !== prior?.gstin) {
          gstin = next;
          gstinVerificationStatus = "pending_manual_verification";
          verifiedLegalName = null;
          verifiedStateCode = null;
          verifiedAt = null;
          verifiedByDiagnosticUid = null;
        }
      }
    }

    const billingStateCode = "billingStateCode" in input
      ? cleanText(input.billingStateCode, 2)
      : prior?.billingStateCode ?? null;
    if (billingStateCode && !isKnownGstStateCode(billingStateCode)) {
      throw new BillingError({
        clientCode: "invalid_purchase",
        causeCode: "billing_state_code_unknown",
      });
    }

    const next: SubscriptionBillingDetailsDoc = {
      gstin,
      billingBusinessName:
        "billingBusinessName" in input
          ? cleanText(input.billingBusinessName, 120)
          : prior?.billingBusinessName ?? null,
      billingAddressLine1:
        "billingAddressLine1" in input
          ? cleanText(input.billingAddressLine1, 200)
          : prior?.billingAddressLine1 ?? null,
      billingAddressLine2:
        "billingAddressLine2" in input
          ? cleanText(input.billingAddressLine2, 200)
          : prior?.billingAddressLine2 ?? null,
      billingCity:
        "billingCity" in input ? cleanText(input.billingCity, 80) : prior?.billingCity ?? null,
      billingPostalCode:
        "billingPostalCode" in input
          ? cleanText(input.billingPostalCode, 12)
          : prior?.billingPostalCode ?? null,
      billingStateCode,
      billingStateName:
        "billingStateName" in input
          ? cleanText(input.billingStateName, 80)
          : prior?.billingStateName ?? null,
      gstinVerificationStatus,
      verifiedLegalName,
      verifiedStateCode,
      verifiedAt,
      verifiedByDiagnosticUid,
      updatedAt: nowMs,
    };
    tx.set(path, next as unknown as Record<string, unknown>);
    return next;
  });
}

export const updateBillingDetails = onCall({ region: "asia-south1" }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  throw new HttpsError(
    "failed-precondition",
    "Billing details callable is not production-enabled in VYD-40."
  );
});
