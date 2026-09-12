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

export interface AdminAuthContext {
  uid: string;
  /** Firebase custom claim `admin === true` is the preferred eventual authority. */
  tokenAdmin: boolean;
  adminIdentityProvisioned: boolean;
}

/**
 * Production remains fail-closed until admin identity is explicitly provisioned.
 * ADMIN_EMAIL text is never sufficient on its own.
 */
export function assertAdminAuthorized(ctx: AdminAuthContext): void {
  if (!ctx.adminIdentityProvisioned) {
    throw new BillingError({
      clientCode: "not_entitled",
      causeCode: "admin_identity_unprovisioned",
    });
  }
  if (ctx.tokenAdmin !== true) {
    throw new BillingError({
      clientCode: "not_entitled",
      causeCode: "admin_claim_required",
    });
  }
  if (!ctx.uid) {
    throw new BillingError({
      clientCode: "not_entitled",
      causeCode: "admin_unauthenticated",
    });
  }
}
