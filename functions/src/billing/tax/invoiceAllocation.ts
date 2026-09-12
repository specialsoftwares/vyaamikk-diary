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
import { invoiceCounterPath, subscriptionInvoicePath } from "../paths";
import type { BillingStore } from "../store";
import type {
  InvoiceCounterDoc,
  SubscriptionInvoiceDoc,
  TaxDocumentType,
} from "../types";
import { INVOICE_IDENTITY_KEYS, INVOICE_STATUTORY_KEYS } from "../types";

import { getFinancialYearForDate, formatIstCalendarDate } from "./financialYearUtils";
import { mayAllocateStatutoryNumber, mayIssueDeveloperTaxInvoice } from "./platformTaxPolicy";
import { resolveTaxPeriod } from "./taxPeriod";

const INVOICE_ID_PREFIX = "inv_v1_";
export const STATUTORY_DOCUMENT_NUMBER_MAX_LEN = 16;

export function invoiceIdForFinancialEvent(financialEventId: string): string {
  if (!financialEventId) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "missing_financial_event_id",
    });
  }
  const digest = createHash("sha256")
    .update(`vyd-invoice-v1:${financialEventId}`, "utf8")
    .digest("hex")
    .slice(0, 40);
  return `${INVOICE_ID_PREFIX}${digest}`;
}

export function formatTaxInvoiceNumber(financialYear: string, serial: number): string {
  return assertStatutoryDocumentNumber(`SS/${financialYear}/${String(serial).padStart(4, "0")}`);
}

export function formatPlatformReceiptNumber(financialYear: string, serial: number): string {
  return assertStatutoryDocumentNumber(`PR/${financialYear}/${String(serial).padStart(4, "0")}`);
}

export function assertStatutoryDocumentNumber(number: string): string {
  if (number.length > STATUTORY_DOCUMENT_NUMBER_MAX_LEN) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "statutory_number_too_long",
    });
  }
  return number;
}

export function isIssuedInvoice(invoice: SubscriptionInvoiceDoc): boolean {
  return Boolean(invoice.documentNumber) && invoice.invoiceIssuedAt != null;
}

export function isUnissuedDraft(invoice: SubscriptionInvoiceDoc): boolean {
  return invoice.documentNumber == null && invoice.invoiceIssuedAt == null;
}

export function applyOperationalInvoicePatch(
  current: SubscriptionInvoiceDoc,
  patch: Partial<SubscriptionInvoiceDoc>
): SubscriptionInvoiceDoc {
  for (const key of Object.keys(patch) as Array<keyof SubscriptionInvoiceDoc>) {
    if ((INVOICE_IDENTITY_KEYS as ReadonlyArray<string>).includes(key)) {
      if (JSON.stringify(patch[key]) !== JSON.stringify(current[key])) {
        throw new BillingError({
          clientCode: "internal_error",
          causeCode: "invoice_identity_mutation",
        });
      }
    }
    if (
      isIssuedInvoice(current) &&
      (INVOICE_STATUTORY_KEYS as ReadonlyArray<string>).includes(key) &&
      JSON.stringify(patch[key]) !== JSON.stringify(current[key])
    ) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "invoice_immutable_field_mutation",
      });
    }
  }
  return { ...current, ...patch, updatedAt: patch.updatedAt ?? current.updatedAt };
}

export interface AllocateInvoiceInput {
  stub: SubscriptionInvoiceDoc;
  /** Ignored for statutory FY; issue timestamp owns FY. Kept for call-site compat. */
  financialYear?: string;
  nowMs: number;
  allocateNumber: boolean;
}

export interface AllocateInvoiceResult {
  invoice: SubscriptionInvoiceDoc;
  reused: boolean;
  newlyIssued: boolean;
}

/**
 * Create or refresh an unissued draft, or finalize it in the SAME transaction
 * that allocates the statutory number from the issue timestamp's FY.
 */
export async function persistTaxDocument(
  store: BillingStore,
  input: AllocateInvoiceInput
): Promise<AllocateInvoiceResult> {
  const invoicePath = subscriptionInvoicePath(input.stub.invoiceId);
  const issueAt = input.nowMs;
  const fyForIssue = getFinancialYearForDate(issueAt);
  const counterPath = invoiceCounterPath(fyForIssue);
  const wantsNumber =
    input.allocateNumber && mayAllocateStatutoryNumber(input.stub.documentType);

  return store.runTransaction(async (tx) => {
    const existingSnap = await tx.get(invoicePath);
    const counterSnap = wantsNumber ? await tx.get(counterPath) : null;

    if (existingSnap.exists) {
      const existing = existingSnap.data() as unknown as SubscriptionInvoiceDoc;
      if (existing.financialEventId !== input.stub.financialEventId) {
        throw new BillingError({
          clientCode: "internal_error",
          causeCode: "invoice_id_collision",
        });
      }
      if (isIssuedInvoice(existing)) {
        return { invoice: existing, reused: true, newlyIssued: false };
      }
      if (!isUnissuedDraft(existing)) {
        throw new BillingError({
          clientCode: "internal_error",
          causeCode: "invoice_issue_state_corrupt",
        });
      }
    }

    let documentNumber: string | null = null;
    let invoiceIssuedAt: number | null = null;
    let nextCounter: InvoiceCounterDoc | null = null;
    if (wantsNumber) {
      const prior = (counterSnap?.data() as InvoiceCounterDoc | undefined) ?? {
        currentTaxInvoiceCount: 0,
        currentReceiptCount: 0,
        financialYear: fyForIssue,
        updatedAt: issueAt,
      };
      if (input.stub.documentType === "platform_subscription_receipt") {
        const serial = prior.currentReceiptCount + 1;
        documentNumber = formatPlatformReceiptNumber(fyForIssue, serial);
        nextCounter = { ...prior, currentReceiptCount: serial, updatedAt: issueAt };
      } else {
        const serial = prior.currentTaxInvoiceCount + 1;
        documentNumber = formatTaxInvoiceNumber(fyForIssue, serial);
        nextCounter = { ...prior, currentTaxInvoiceCount: serial, updatedAt: issueAt };
      }
      invoiceIssuedAt = issueAt;
    }

    const taxPeriod = resolveTaxPeriod({
      supplyOccurredAt: input.stub.supplyOccurredAt,
      invoiceIssuedAt,
    });
    const issued = documentNumber != null && invoiceIssuedAt != null;
    const created: SubscriptionInvoiceDoc = {
      ...input.stub,
      documentNumber,
      invoiceIssuedAt,
      invoiceIssuedOnIst: invoiceIssuedAt ? formatIstCalendarDate(invoiceIssuedAt) : null,
      financialYear: issued ? fyForIssue : null,
      taxPeriodMonth: taxPeriod.taxPeriodMonth,
      taxPeriodStatus: taxPeriod.taxPeriodStatus,
      issueStatus: issued ? "issued" : "unissued_draft",
      gstrReportable:
        issued &&
        taxPeriod.taxPeriodStatus === "resolved" &&
        mayIssueDeveloperTaxInvoice(input.stub.documentType),
      createdAt: existingSnap.exists
        ? (existingSnap.data() as unknown as SubscriptionInvoiceDoc).createdAt
        : issueAt,
      updatedAt: issueAt,
    };
    if (existingSnap.exists) {
      tx.set(invoicePath, created as unknown as Record<string, unknown>);
    } else {
      tx.create(invoicePath, created as unknown as Record<string, unknown>);
    }
    if (nextCounter) {
      tx.set(counterPath, nextCounter as unknown as Record<string, unknown>);
    }
    return { invoice: created, reused: false, newlyIssued: issued };
  });
}

/** @deprecated Prefer persistTaxDocument; wrapper retains prior call shape. */
export async function allocateInvoiceStub(
  store: BillingStore,
  input: AllocateInvoiceInput
): Promise<AllocateInvoiceResult> {
  return persistTaxDocument(store, input);
}

export const finalizeUnissuedInvoice = persistTaxDocument;

export function assertDocumentTypeAllowsNumber(documentType: TaxDocumentType): void {
  if (!mayAllocateStatutoryNumber(documentType)) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "statutory_number_blocked_unconfirmed_policy",
    });
  }
}
