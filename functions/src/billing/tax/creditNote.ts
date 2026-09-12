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

import { createHash } from "node:crypto";

import { BillingError } from "../errors";
import { creditNoteCounterPath, subscriptionCreditNotePath } from "../paths";
import type { BillingStore } from "../store";
import type { CreditNoteCounterDoc, SubscriptionCreditNoteDoc, SubscriptionInvoiceDoc } from "../types";

import { getFinancialYearForDate, formatIstCalendarDate } from "./financialYearUtils";
import { assertStatutoryDocumentNumber } from "./invoiceAllocation";
import { resolveTaxPeriod } from "./taxPeriod";

export function creditNoteIdForRefundEvent(refundFinancialEventId: string): string {
  if (!refundFinancialEventId) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "missing_financial_event_id",
    });
  }
  const digest = createHash("sha256")
    .update(`vyd-credit-note-v1:${refundFinancialEventId}`, "utf8")
    .digest("hex")
    .slice(0, 40);
  return `cn_v1_${digest}`;
}

export function formatCreditNoteNumber(financialYear: string, serial: number): string {
  return assertStatutoryDocumentNumber(`CN/${financialYear}/${String(serial).padStart(4, "0")}`);
}

/**
 * A refund entitlement event is NOT GST-complete. Developer-issued tax
 * invoices require a linked credit note. Platform receipts follow platform
 * policy and do not mint a Special Softwares credit note here.
 */
export function developerCreditNoteRequired(invoice: SubscriptionInvoiceDoc): boolean {
  return (
    invoice.documentType === "tax_invoice_b2b" || invoice.documentType === "tax_invoice_b2c"
  );
}

export async function allocateCreditNoteStub(
  store: BillingStore,
  input: {
    stub: SubscriptionCreditNoteDoc;
    financialYear?: string;
    nowMs: number;
    original: SubscriptionInvoiceDoc;
  }
): Promise<{ creditNote: SubscriptionCreditNoteDoc; reused: boolean }> {
  void input.financialYear;
  if (!developerCreditNoteRequired(input.original)) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "credit_note_not_applicable",
    });
  }
  const path = subscriptionCreditNotePath(input.stub.creditNoteId);
  const fyForIssue = getFinancialYearForDate(input.nowMs);
  const counterPath = creditNoteCounterPath(fyForIssue);

  return store.runTransaction(async (tx) => {
    const existingSnap = await tx.get(path);
    const counterSnap = await tx.get(counterPath);
    if (existingSnap.exists) {
      const existing = existingSnap.data() as unknown as SubscriptionCreditNoteDoc;
      if (existing.refundFinancialEventId !== input.stub.refundFinancialEventId) {
        throw new BillingError({
          clientCode: "internal_error",
          causeCode: "credit_note_id_collision",
        });
      }
      return { creditNote: existing, reused: true };
    }
    const prior = (counterSnap.data() as CreditNoteCounterDoc | undefined) ?? {
      currentCount: 0,
      financialYear: fyForIssue,
      updatedAt: input.nowMs,
    };
    const serial = prior.currentCount + 1;
    const taxPeriod = resolveTaxPeriod({
      supplyOccurredAt: input.original.supplyOccurredAt,
      invoiceIssuedAt: input.nowMs,
    });
    const created: SubscriptionCreditNoteDoc = {
      ...input.stub,
      documentNumber: formatCreditNoteNumber(fyForIssue, serial),
      financialYear: fyForIssue,
      taxPeriodMonth: taxPeriod.taxPeriodMonth,
      taxPeriodStatus: taxPeriod.taxPeriodStatus,
      issuedAt: input.nowMs,
      issuedOnIst: formatIstCalendarDate(input.nowMs),
      buyerGstin: input.original.buyer.gstin,
      buyerClassification: input.original.buyer.classification,
      originalInvoiceIssuedOnIst: input.original.invoiceIssuedOnIst,
      placeOfSupplyStateCode: input.original.placeOfSupplyStateCode,
      gstRateBps: input.original.gstRateBps,
      taxType: input.original.taxType,
      gstrReportable: taxPeriod.taxPeriodStatus === "resolved",
      createdAt: input.nowMs,
      updatedAt: input.nowMs,
    };
    tx.create(path, created as unknown as Record<string, unknown>);
    tx.set(counterPath, {
      currentCount: serial,
      financialYear: fyForIssue,
      updatedAt: input.nowMs,
    } satisfies CreditNoteCounterDoc);
    return { creditNote: created, reused: false };
  });
}
