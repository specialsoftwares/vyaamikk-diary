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

import { invoiceRetryQueuePath } from "../paths";
import type { BillingStore } from "../store";
import type { InvoiceRetryQueueDoc, InvoiceRetryStage } from "../types";

export const INVOICE_RETRY_MAX_ATTEMPTS = 3;
export const INVOICE_RETRY_BACKOFF_MS = 60_000;

export interface InvoiceRetryAlert {
  invoiceId: string;
  stage: InvoiceRetryStage;
  lastErrorCode: string;
}

export interface InvoiceRetryAlerter {
  notifyDeadLetter(alert: InvoiceRetryAlert): Promise<void>;
}

/** Contract only — VYD-40 does not send production admin email. */
export class NoopInvoiceRetryAlerter implements InvoiceRetryAlerter {
  readonly alerts: InvoiceRetryAlert[] = [];
  async notifyDeadLetter(alert: InvoiceRetryAlert): Promise<void> {
    this.alerts.push(alert);
  }
}

export async function persistInvoiceRetry(
  store: BillingStore,
  input: {
    invoiceId: string;
    financialEventId: string;
    stage: InvoiceRetryStage;
    errorCode: string;
    nowMs: number;
  }
): Promise<InvoiceRetryQueueDoc> {
  const path = invoiceRetryQueuePath(input.invoiceId);
  return store.runTransaction(async (tx) => {
    const snap = await tx.get(path);
    const prior = snap.exists ? (snap.data() as unknown as InvoiceRetryQueueDoc) : null;
    const attempts = (prior?.attempts ?? 0) + 1;
    const dead = attempts >= INVOICE_RETRY_MAX_ATTEMPTS;
    const next: InvoiceRetryQueueDoc = {
      invoiceId: input.invoiceId,
      financialEventId: input.financialEventId,
      stage: input.stage,
      attempts,
      maxAttempts: INVOICE_RETRY_MAX_ATTEMPTS,
      nextAttemptAt: dead ? input.nowMs : input.nowMs + INVOICE_RETRY_BACKOFF_MS,
      lastErrorCode: input.errorCode,
      deadLettered: dead,
      updatedAt: input.nowMs,
    };
    tx.set(path, next as unknown as Record<string, unknown>);
    return next;
  });
}

export async function enqueueInvoiceRetry(
  store: BillingStore,
  input: {
    invoiceId: string;
    financialEventId: string;
    stage: InvoiceRetryStage;
    errorCode: string;
    nowMs: number;
    alerter?: InvoiceRetryAlerter;
  }
): Promise<InvoiceRetryQueueDoc> {
  const doc = await persistInvoiceRetry(store, input);
  if (doc.deadLettered && input.alerter) {
    await input.alerter.notifyDeadLetter({
      invoiceId: input.invoiceId,
      stage: input.stage,
      lastErrorCode: input.errorCode,
    });
  }
  return doc;
}
