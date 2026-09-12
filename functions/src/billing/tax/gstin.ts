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

/**
 * Official GST State codes (numeric strings). Postal abbreviations such as
 * MH / UP / DL are never legal GST State codes.
 */
export const GST_STATE_NAMES: Readonly<Record<string, string>> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
};

/** GSTIN format only. Success never means government verification. */
export const GSTIN_FORMAT = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function gstStateName(stateCode: string): string | null {
  return GST_STATE_NAMES[stateCode] ?? null;
}

export function isKnownGstStateCode(stateCode: string): boolean {
  return Object.prototype.hasOwnProperty.call(GST_STATE_NAMES, stateCode);
}

/**
 * Normalization policy: trim + uppercase, then format-validate.
 * Lowercase input is accepted only after this transform.
 */
export function normalizeGstin(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidGstinFormat(raw: string): boolean {
  const normalized = normalizeGstin(raw);
  if (!GSTIN_FORMAT.test(normalized)) return false;
  return isKnownGstStateCode(normalized.slice(0, 2));
}

export function gstStateCodeFromGstin(raw: string): string {
  const normalized = normalizeGstin(raw);
  if (!isValidGstinFormat(normalized)) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "gstin_format_invalid",
    });
  }
  return normalized.slice(0, 2);
}

export function parseGstinOrThrow(raw: string): { gstin: string; stateCode: string; stateName: string } {
  const gstin = normalizeGstin(raw);
  if (!isValidGstinFormat(gstin)) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "gstin_format_invalid",
    });
  }
  const stateCode = gstin.slice(0, 2);
  const stateName = GST_STATE_NAMES[stateCode];
  if (!stateName) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "gstin_state_code_unknown",
    });
  }
  return { gstin, stateCode, stateName };
}
