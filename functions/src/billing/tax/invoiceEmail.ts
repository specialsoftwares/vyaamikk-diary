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

import type { EmailProvider } from "../../email/provider";
import type { InvoiceEmailStatus, SubscriptionInvoiceDoc } from "../types";

export interface VerifiedEmailLookup {
  emailStatus: string | null | undefined;
  normalizedEmail?: string | null;
  businessEmail?: string | null;
}

export function authoritativeVerifiedEmail(user: VerifiedEmailLookup): string | null {
  if (user.emailStatus !== "verified") return null;
  const email = (user.normalizedEmail ?? user.businessEmail ?? "").trim().toLowerCase();
  return email.includes("@") ? email : null;
}

export interface SendInvoiceEmailResult {
  emailStatus: InvoiceEmailStatus;
  emailProviderMessageId: string | null;
  invoiceEmailAcceptedAt: number | null;
}

/**
 * Resend HTTP 2xx is modelled as `accepted`, never `delivered`.
 * The existing provider's `delivered` flag is ignored for GST documents.
 */
export async function sendInvoiceEmail(opts: {
  provider: EmailProvider;
  invoice: SubscriptionInvoiceDoc;
  recipient: VerifiedEmailLookup;
  nowMs: number;
  fromAddress?: string | null;
}): Promise<SendInvoiceEmailResult> {
  void opts.fromAddress;
  const to = authoritativeVerifiedEmail(opts.recipient);
  if (!to) {
    return {
      emailStatus: "skipped_no_verified_email",
      emailProviderMessageId: null,
      invoiceEmailAcceptedAt: null,
    };
  }
  const number = opts.invoice.documentNumber ?? opts.invoice.invoiceId;
  const result = await opts.provider.send({
    to,
    subject: `Vyaamikk Diary billing document ${number}`,
    textBody:
      "Your Vyaamikk Diary billing document is available in the app under Subscription & Billing. " +
      "Download is available after you sign in. This message does not attach the PDF.",
    idempotencyKey: `invoice-email:${opts.invoice.invoiceId}`,
  });
  if (result.errorCode || result.provider === "none") {
    return {
      emailStatus: "failed",
      emailProviderMessageId: result.providerMessageId ?? null,
      invoiceEmailAcceptedAt: null,
    };
  }
  // Provider `delivered: true` on 2xx is acceptance, not inbox delivery.
  return {
    emailStatus: "accepted",
    emailProviderMessageId: result.providerMessageId ?? null,
    invoiceEmailAcceptedAt: opts.nowMs,
  };
}
