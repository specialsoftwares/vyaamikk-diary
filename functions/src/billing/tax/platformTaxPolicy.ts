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
  BillingPlatform,
  EcoClassificationStatus,
  PlatformTaxChannel,
  TaxDocumentType,
  TaxResponsibilityMode,
} from "../types";

export interface PlatformTaxPolicy {
  channel: PlatformTaxChannel;
  mode: TaxResponsibilityMode;
  /** Working-policy notes; never a substitute for mode. */
  rationale: string;
  section52TcsStatus: EcoClassificationStatus;
  table14ClassificationStatus: EcoClassificationStatus;
}

const POLICIES: Record<PlatformTaxChannel, PlatformTaxPolicy> = {
  google_play_india: {
    channel: "google_play_india",
    mode: "developer",
    rationale:
      "Google India developer guidance currently treats the developer as responsible for determining applicable GST on app / in-app sales; marketplace TDS/GST-TCS is separate. ECO/Table-14 classification still requires tax review.",
    section52TcsStatus: "requires_tax_review",
    table14ClassificationStatus: "requires_tax_review",
  },
  apple_app_store_india: {
    channel: "apple_app_store_india",
    mode: "unconfirmed",
    rationale:
      "Apple India tax responsibility is unconfirmed until the Paid Apps Agreement / Schedule 2 and tax settings are reviewed. No Special Softwares TAX INVOICE while unconfirmed.",
    section52TcsStatus: "requires_tax_review",
    table14ClassificationStatus: "requires_tax_review",
  },
  direct_web_india: {
    channel: "direct_web_india",
    mode: "developer",
    rationale:
      "Direct-web/Razorpay sales, when introduced, are developer-direct supplies with explicitly configured GST treatment.",
    section52TcsStatus: "not_applicable",
    table14ClassificationStatus: "not_applicable",
  },
};

export function platformTaxPolicy(channel: PlatformTaxChannel): PlatformTaxPolicy {
  return POLICIES[channel];
}

export function channelForStorePlatform(platform: BillingPlatform | "web"): PlatformTaxChannel {
  if (platform === "android") return "google_play_india";
  if (platform === "ios") return "apple_app_store_india";
  return "direct_web_india";
}

export function resolvePlatformTaxPolicy(
  platform: BillingPlatform | "web"
): PlatformTaxPolicy {
  return platformTaxPolicy(channelForStorePlatform(platform));
}

/**
 * Document type is decided by tax responsibility FIRST, then B2B/B2C.
 * GSTIN presence alone never selects a TAX INVOICE.
 */
export function classifyTaxDocument(opts: {
  policy: PlatformTaxPolicy;
  buyerIsVerifiedB2b: boolean;
}): TaxDocumentType {
  if (opts.policy.mode === "unconfirmed") return "compliance_review_required";
  if (opts.policy.mode === "platform") return "platform_subscription_receipt";
  if (opts.policy.mode !== "developer") {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "unknown_tax_responsibility_mode",
    });
  }
  return opts.buyerIsVerifiedB2b ? "tax_invoice_b2b" : "tax_invoice_b2c";
}

export function mayAllocateStatutoryNumber(documentType: TaxDocumentType): boolean {
  return (
    documentType === "tax_invoice_b2b" ||
    documentType === "tax_invoice_b2c" ||
    documentType === "platform_subscription_receipt"
  );
}

export function mayIssueDeveloperTaxInvoice(documentType: TaxDocumentType): boolean {
  return documentType === "tax_invoice_b2b" || documentType === "tax_invoice_b2c";
}
