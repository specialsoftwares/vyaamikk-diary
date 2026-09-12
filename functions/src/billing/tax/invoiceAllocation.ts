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
import { INVOICE_IMMUTABLE_KEYS } from "../types";

import { mayAllocateStatutoryNumber } from "./platformTaxPolicy";

const INVOICE_ID_PREFIX = "inv_v1_";

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
  return `SS/${financialYear}/${String(serial).padStart(4, "0")}`;
}

export function formatPlatformReceiptNumber(financialYear: string, serial: number): string {
  return `PR/${financialYear}/${String(serial).padStart(4, "0")}`;
}

export function applyOperationalInvoicePatch(
  current: SubscriptionInvoiceDoc,
  patch: Partial<SubscriptionInvoiceDoc>
): SubscriptionInvoiceDoc {
  for (const key of Object.keys(patch) as Array<keyof SubscriptionInvoiceDoc>) {
    if (!(INVOICE_IMMUTABLE_KEYS as ReadonlyArray<string>).includes(key)) continue;
    if (JSON.stringify(patch[key]) !== JSON.stringify(current[key])) {
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
  financialYear: string;
  nowMs: number;
  /** False when policy/identity/evidence is insufficient for a statutory serial. */
  allocateNumber: boolean;
}

export interface AllocateInvoiceResult {
  invoice: SubscriptionInvoiceDoc;
  reused: boolean;
}

/**
 * ONE transaction: reuse existing stub (same financial event) or
 * increment the FY counter and create the stub. Never allocates a
 * statutory number for compliance_review_required.
 */
export async function allocateInvoiceStub(
  store: BillingStore,
  input: AllocateInvoiceInput
): Promise<AllocateInvoiceResult> {
  const invoicePath = subscriptionInvoicePath(input.stub.invoiceId);
  const counterPath = invoiceCounterPath(input.financialYear);
  const wantsNumber =
    input.allocateNumber && mayAllocateStatutoryNumber(input.stub.documentType);

  return store.runTransaction(async (tx) => {
    const existingSnap = await tx.get(invoicePath);
    const counterSnap = await tx.get(counterPath);

    if (existingSnap.exists) {
      const existing = existingSnap.data() as unknown as SubscriptionInvoiceDoc;
      if (existing.financialEventId !== input.stub.financialEventId) {
        throw new BillingError({
          clientCode: "internal_error",
          causeCode: "invoice_id_collision",
        });
      }
      return { invoice: existing, reused: true };
    }

    let documentNumber: string | null = null;
    let nextCounter: InvoiceCounterDoc | null = null;
    if (wantsNumber) {
      const prior = (counterSnap.data() as InvoiceCounterDoc | undefined) ?? {
        currentTaxInvoiceCount: 0,
        currentReceiptCount: 0,
        financialYear: input.financialYear,
        updatedAt: input.nowMs,
      };
      if (input.stub.documentType === "platform_subscription_receipt") {
        const serial = prior.currentReceiptCount + 1;
        documentNumber = formatPlatformReceiptNumber(input.financialYear, serial);
        nextCounter = {
          ...prior,
          currentReceiptCount: serial,
          updatedAt: input.nowMs,
        };
      } else {
        const serial = prior.currentTaxInvoiceCount + 1;
        documentNumber = formatTaxInvoiceNumber(input.financialYear, serial);
        nextCounter = {
          ...prior,
          currentTaxInvoiceCount: serial,
          updatedAt: input.nowMs,
        };
      }
    }

    const created: SubscriptionInvoiceDoc = {
      ...input.stub,
      documentNumber,
      financialYear: wantsNumber || input.stub.documentType === "compliance_review_required"
        ? input.financialYear
        : input.stub.financialYear,
      invoiceIssuedAt: documentNumber ? input.nowMs : null,
      createdAt: input.nowMs,
      updatedAt: input.nowMs,
    };
    tx.create(invoicePath, created as unknown as Record<string, unknown>);
    if (nextCounter) {
      tx.set(counterPath, nextCounter as unknown as Record<string, unknown>);
    }
    return { invoice: created, reused: false };
  });
}

export function assertDocumentTypeAllowsNumber(documentType: TaxDocumentType): void {
  if (!mayAllocateStatutoryNumber(documentType)) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "statutory_number_blocked_unconfirmed_policy",
    });
  }
}
