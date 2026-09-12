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
import { canonicalizeEmailFromAddress } from "../../email/provider";
import type { InvoiceEmailStatus, SubscriptionInvoiceDoc } from "../types";

export const EMAIL_INVOICE_DOWNLOAD_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

/**
 * Local invoice state is the primary duplicate-send guard.
 * Provider idempotency keys are defense-in-depth only.
 */
export function shouldAttemptInvoiceEmail(
  emailStatus: InvoiceEmailStatus,
  hasVerifiedEmail: boolean
): boolean {
  if (emailStatus === "accepted" || emailStatus === "delivered") return false;
  if (emailStatus === "bounced") return false;
  if (emailStatus === "skipped_no_verified_email") return hasVerifiedEmail;
  return emailStatus === "pending" || emailStatus === "failed";
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
  downloadUrl?: string | null;
}): Promise<SendInvoiceEmailResult> {
  const to = authoritativeVerifiedEmail(opts.recipient);
  if (!to) {
    return {
      emailStatus: "skipped_no_verified_email",
      emailProviderMessageId: null,
      invoiceEmailAcceptedAt: null,
    };
  }
  const number = opts.invoice.documentNumber ?? opts.invoice.invoiceId;
  const downloadLine = opts.downloadUrl
    ? `Download your document (link expires in 7 days):\n${opts.downloadUrl}\n\n`
    : "";
  const textBody =
    `Your Vyaamikk Diary billing document ${number} is ready.\n\n` +
    downloadLine +
    "The PDF is also available in the app under Subscription & Billing after you sign in. " +
    "This message does not attach the PDF.";
  const htmlBody = opts.downloadUrl
    ? `<p>Your Vyaamikk Diary billing document ${escapeHtml(number)} is ready.</p>` +
      `<p><a href="${escapeHtml(opts.downloadUrl)}">Download invoice PDF</a> (link expires in 7 days).</p>` +
      `<p>The PDF is also available in the app under Subscription &amp; Billing after you sign in. This message does not attach the PDF.</p>`
    : undefined;
  const from = opts.fromAddress ? canonicalizeEmailFromAddress(opts.fromAddress) : null;
  const result = await opts.provider.send({
    to,
    subject: `Vyaamikk Diary billing document ${number}`,
    textBody,
    htmlBody,
    fromAddress: from ?? undefined,
    idempotencyKey: `invoice-email:${opts.invoice.invoiceId}`,
  });
  if (result.errorCode || result.provider === "none") {
    return {
      emailStatus: "failed",
      emailProviderMessageId: result.providerMessageId ?? null,
      invoiceEmailAcceptedAt: null,
    };
  }
  return {
    emailStatus: "accepted",
    emailProviderMessageId: result.providerMessageId ?? null,
    invoiceEmailAcceptedAt: opts.nowMs,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
