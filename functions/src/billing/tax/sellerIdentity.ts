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
import type {
  EcoReportingCategory,
  GstrFilingFrequency,
  ReverseChargeMode,
  SellerTaxSnapshot,
  TaxResponsibilityMode,
} from "../types";

import type { PlatformTaxPolicyOverrides } from "./platformTaxPolicy";
import { parseEcoReportingCategory } from "./platformTaxPolicy";

import { gstStateCodeFromGstin, gstStateName, isValidGstinFormat, normalizeGstin } from "./gstin";

export interface ChannelEcoConfig {
  ecoReportingCategory: EcoReportingCategory;
  operatorIdentifier: string | null;
  operatorGstin: string | null;
}

export function unreviewedChannelEco(operatorIdentifier: string | null): ChannelEcoConfig {
  return {
    ecoReportingCategory: "requires_tax_review",
    operatorIdentifier,
    operatorGstin: null,
  };
}

export function notApplicableChannelEco(operatorIdentifier: string | null = null): ChannelEcoConfig {
  return {
    ecoReportingCategory: "not_applicable",
    operatorIdentifier,
    operatorGstin: null,
  };
}

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
  /** Exact config only. Missing/invalid → null; GST is not calculated until known. */
  priceIncludesGst: boolean | null;
  reverseChargeMode: ReverseChargeMode;
  appleTaxResponsibilityMode: TaxResponsibilityMode;
  googleTaxResponsibilityMode: TaxResponsibilityMode;
  directWebTaxResponsibilityMode: TaxResponsibilityMode;
  googleEco: ChannelEcoConfig;
  appleEco: ChannelEcoConfig;
  directWebEco: ChannelEcoConfig;
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
    priceIncludesGst: parsePriceIncludesGst(env.PRICE_INCLUDES_GST),
    reverseChargeMode: parseReverseChargeMode(env.REVERSE_CHARGE_MODE),
    appleTaxResponsibilityMode: parseTaxResponsibilityMode(
      env.APPLE_TAX_RESPONSIBILITY_MODE,
      "unconfirmed"
    ),
    googleTaxResponsibilityMode: parseTaxResponsibilityMode(
      env.GOOGLE_TAX_RESPONSIBILITY_MODE,
      "developer"
    ),
    directWebTaxResponsibilityMode: parseTaxResponsibilityMode(
      env.DIRECT_WEB_TAX_RESPONSIBILITY_MODE,
      "developer"
    ),
    googleEco: loadChannelEco(env, "GOOGLE", "google_play"),
    appleEco: loadChannelEco(env, "APPLE", "apple_app_store"),
    directWebEco: loadChannelEco(env, "DIRECT_WEB", null, "not_applicable"),
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

function loadChannelEco(
  env: NodeJS.ProcessEnv,
  prefix: "GOOGLE" | "APPLE" | "DIRECT_WEB",
  defaultOperator: string | null,
  defaultCategory: EcoReportingCategory = "requires_tax_review"
): ChannelEcoConfig {
  const categoryRaw = env[`${prefix}_ECO_REPORTING_CATEGORY`];
  const legacyTable = env[`${prefix}_TABLE14_CLASSIFICATION_STATUS`];
  const legacySection = env[`${prefix}_SECTION52_TCS_STATUS`];
  const chosen =
    categoryRaw !== undefined && categoryRaw.trim() !== ""
      ? categoryRaw
      : legacyTable !== undefined && legacyTable.trim() !== ""
        ? legacyTable
        : legacySection;
  return {
    ecoReportingCategory:
      chosen === undefined || String(chosen).trim() === ""
        ? defaultCategory
        : parseEcoReportingCategory(String(chosen)),
    operatorIdentifier: emptyToNull(env[`${prefix}_OPERATOR_IDENTIFIER`]) ?? defaultOperator,
    operatorGstin: emptyToNull(env[`${prefix}_OPERATOR_GSTIN`]),
  };
}

export function policyOverridesFromConfig(
  config: SellerIdentityConfig
): Partial<Record<"google_play_india" | "apple_app_store_india" | "direct_web_india", PlatformTaxPolicyOverrides>> {
  return {
    google_play_india: {
      mode: config.googleTaxResponsibilityMode,
      ecoReportingCategory: config.googleEco.ecoReportingCategory,
      operatorIdentifier: config.googleEco.operatorIdentifier,
      operatorGstin: config.googleEco.operatorGstin,
    },
    apple_app_store_india: {
      mode: config.appleTaxResponsibilityMode,
      ecoReportingCategory: config.appleEco.ecoReportingCategory,
      operatorIdentifier: config.appleEco.operatorIdentifier,
      operatorGstin: config.appleEco.operatorGstin,
    },
    direct_web_india: {
      mode: config.directWebTaxResponsibilityMode,
      ecoReportingCategory: config.directWebEco.ecoReportingCategory,
      operatorIdentifier: config.directWebEco.operatorIdentifier,
      operatorGstin: config.directWebEco.operatorGstin,
    },
  };
}

export function parsePriceIncludesGst(raw: string | undefined): boolean | null {
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
}

export function parseReverseChargeMode(raw: string | undefined): ReverseChargeMode {
  const t = raw?.trim() ?? "";
  if (t === "yes" || t === "no" || t === "unconfirmed") return t;
  return "unconfirmed";
}

export function parseTaxResponsibilityMode(
  raw: string | undefined,
  fallback: TaxResponsibilityMode
): TaxResponsibilityMode {
  const t = raw?.trim() ?? "";
  if (t === "developer" || t === "platform" || t === "unconfirmed") return t;
  if (t === "") return fallback;
  return "unconfirmed";
}

export function isReverseChargeApproved(mode: ReverseChargeMode): boolean {
  return mode === "yes" || mode === "no";
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
