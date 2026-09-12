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
import type { SubscriptionBillingDetailsDoc } from "../types";
import { assertAdminAuthorized, type AdminAuthContext } from "../tax/adminAuth";
import { gstStateCodeFromGstin, isValidGstinFormat, normalizeGstin } from "../tax/gstin";

export async function applyVerifyGstinManual(
  store: BillingStore,
  input: {
    targetUid: string;
    decision: "verified" | "rejected";
    verifiedLegalName?: string;
    /** If supplied, must equal the GSTIN's first two digits. */
    verifiedStateCode?: string;
    nowMs: number;
    admin: AdminAuthContext;
    adminDiagnosticUid: string;
  }
): Promise<SubscriptionBillingDetailsDoc> {
  assertAdminAuthorized(input.admin);
  const path = billingDetailsPath(input.targetUid);
  return store.runTransaction(async (tx) => {
    const snap = await tx.get(path);
    if (!snap.exists) {
      throw new BillingError({
        clientCode: "not_entitled",
        causeCode: "billing_details_missing",
      });
    }
    const current = snap.data() as unknown as SubscriptionBillingDetailsDoc;
    if (!current.gstin || !isValidGstinFormat(current.gstin)) {
      throw new BillingError({
        clientCode: "invalid_purchase",
        causeCode: "gstin_format_invalid",
      });
    }
    const gstin = normalizeGstin(current.gstin);
    const gstinState = gstStateCodeFromGstin(gstin);
    if (input.decision === "verified") {
      const legal = input.verifiedLegalName?.trim() ?? "";
      if (!legal) {
        throw new BillingError({
          clientCode: "invalid_purchase",
          causeCode: "verified_legal_name_required",
        });
      }
      if (input.verifiedStateCode && input.verifiedStateCode !== gstinState) {
        throw new BillingError({
          clientCode: "invalid_purchase",
          causeCode: "verified_state_code_mismatch",
        });
      }
      const next: SubscriptionBillingDetailsDoc = {
        ...current,
        gstin,
        gstinVerificationStatus: "verified",
        verifiedLegalName: legal,
        verifiedStateCode: gstinState,
        verifiedAt: input.nowMs,
        verifiedByDiagnosticUid: input.adminDiagnosticUid,
        billingStateCode: gstinState,
        updatedAt: input.nowMs,
      };
      tx.set(path, next as unknown as Record<string, unknown>);
      return next;
    }
    const rejected: SubscriptionBillingDetailsDoc = {
      ...current,
      gstinVerificationStatus: "rejected",
      verifiedLegalName: null,
      verifiedStateCode: null,
      verifiedAt: input.nowMs,
      verifiedByDiagnosticUid: input.adminDiagnosticUid,
      updatedAt: input.nowMs,
    };
    tx.set(path, rejected as unknown as Record<string, unknown>);
    return rejected;
  });
}

export const verifyGstinManual = onCall({ region: "asia-south1" }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  throw new HttpsError(
    "failed-precondition",
    "Admin GSTIN verification is not production-enabled in VYD-40."
  );
});
