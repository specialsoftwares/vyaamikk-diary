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

import { BillingError } from "../errors";
import type { GstrFilingFrequency, SellerTaxSnapshot } from "../types";

import { gstStateCodeFromGstin, gstStateName, isValidGstinFormat, normalizeGstin } from "./gstin";

export interface SellerIdentityConfig {
  companyGstin: string | null;
  companyLegalName: string | null;
  companyTradeName: string | null;
  companyGstRegisteredAddress: string | null;
  /** If set, must equal COMPANY_GSTIN.slice(0, 2). */
  configuredStateCode: string | null;
  serviceSacCode: string | null;
  serviceSacDescription: string | null;
  gstRateBps: number | null;
  priceIncludesGst: boolean;
  billingEmailFromAddress: string | null;
  invoiceRendererUrl: string | null;
  adminIdentityProvisioned: boolean;
  gstrFilingFrequency: GstrFilingFrequency;
}

export function loadTaxRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env
): SellerIdentityConfig {
  const gstinRaw = env.COMPANY_GSTIN?.trim() || null;
  const rateRaw = env.GST_RATE_BPS?.trim() || "";
  const gstRateBps = rateRaw === "" ? null : Number(rateRaw);
  const freq = env.GSTR_FILING_FREQUENCY?.trim();
  return {
    companyGstin: gstinRaw,
    companyLegalName: emptyToNull(env.COMPANY_LEGAL_NAME),
    companyTradeName: emptyToNull(env.COMPANY_TRADE_NAME),
    companyGstRegisteredAddress: emptyToNull(env.COMPANY_GST_REGISTERED_ADDRESS),
    configuredStateCode: emptyToNull(env.COMPANY_GST_STATE_CODE),
    serviceSacCode: emptyToNull(env.SERVICE_SAC_CODE),
    serviceSacDescription: emptyToNull(env.SERVICE_SAC_DESCRIPTION),
    gstRateBps:
      gstRateBps != null && Number.isInteger(gstRateBps) && gstRateBps > 0 ? gstRateBps : null,
    priceIncludesGst: env.PRICE_INCLUDES_GST !== "false",
    billingEmailFromAddress: emptyToNull(env.BILLING_EMAIL_FROM_ADDRESS),
    invoiceRendererUrl: emptyToNull(env.INVOICE_RENDERER_URL),
    adminIdentityProvisioned: env.ADMIN_IDENTITY_PROVISIONED === "true",
    gstrFilingFrequency: freq === "quarterly" ? "quarterly" : "monthly",
  };
}

function emptyToNull(raw: string | undefined): string | null {
  const t = raw?.trim() ?? "";
  return t.length === 0 ? null : t;
}

export function isSellerIdentityComplete(config: SellerIdentityConfig): boolean {
  try {
    loadSellerTaxIdentity(config);
    return true;
  } catch {
    return false;
  }
}

export function isSacAndRateApproved(config: SellerIdentityConfig): boolean {
  return (
    typeof config.serviceSacCode === "string" &&
    config.serviceSacCode.length > 0 &&
    typeof config.serviceSacDescription === "string" &&
    config.serviceSacDescription.length > 0 &&
    typeof config.gstRateBps === "number" &&
    Number.isInteger(config.gstRateBps) &&
    config.gstRateBps > 0
  );
}

/**
 * Fail-closed seller snapshot. Never infers address from user/profile data
 * or hard-coded locality. Certificate fields must be supplied via config.
 */
export function loadSellerTaxIdentity(config: SellerIdentityConfig): SellerTaxSnapshot {
  if (!config.companyGstin || !isValidGstinFormat(config.companyGstin)) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "seller_identity_incomplete",
    });
  }
  const gstin = normalizeGstin(config.companyGstin);
  const derivedState = gstStateCodeFromGstin(gstin);
  if (config.configuredStateCode && config.configuredStateCode !== derivedState) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "seller_state_code_mismatch",
    });
  }
  const legalName = config.companyLegalName?.trim() ?? "";
  const address = config.companyGstRegisteredAddress?.trim() ?? "";
  if (!legalName || !address) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "seller_identity_incomplete",
    });
  }
  const stateName = gstStateName(derivedState);
  if (!stateName) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "seller_identity_incomplete",
    });
  }
  return {
    legalName,
    tradeName: config.companyTradeName?.trim() || null,
    gstin,
    registeredAddress: address,
    stateCode: derivedState,
    stateName,
  };
}
