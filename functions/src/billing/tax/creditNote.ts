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
import {
  creditNoteCounterPath,
  financialLedgerPath,
  subscriptionCreditNotePath,
  subscriptionInvoicePath,
  subscriptionTaxCompliancePath,
} from "../paths";
import type { BillingStore } from "../store";
import type {
  BillingEventLedgerDoc,
  CreditNoteCounterDoc,
  Section34CreditNotePolicy,
  SubscriptionCreditNoteDoc,
  SubscriptionInvoiceDoc,
  SubscriptionTaxComplianceDoc,
} from "../types";

import { formatIstCalendarDate, getFinancialYearForDate, getMonthKey, section34OutputTaxReductionOuterLimitMs } from "./financialYearUtils";
import {
  assertCreditNoteStatutoryParticulars,
  assertRefundMayIssueStatutoryCreditNote,
  CREDIT_NOTE_NATURE,
  evidenceStatusForRecipient,
  gstAdjustmentEligibilityAtIssuance,
  invoiceGstAdjustmentDefaults,
  snapshotCreditNoteParties,
} from "./gstAdjustment";
import { assertStatutoryDocumentNumber, invoiceIdForFinancialEvent, isIssuedInvoice } from "./invoiceAllocation";
import { buildCreditNoteComplianceDoc } from "./taxCompliance";

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

function assertOriginalTaxIntegrity(original: SubscriptionInvoiceDoc): void {
  if (
    original.totalInPaise == null ||
    original.taxableAmountInPaise == null ||
    original.totalTaxInPaise == null ||
    original.gstRateBps == null ||
    original.taxType == null
  ) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "credit_note_tax_inconsistent",
    });
  }
  const split =
    (original.cgstInPaise ?? 0) + (original.sgstInPaise ?? 0) + (original.igstInPaise ?? 0);
  if (split !== original.totalTaxInPaise) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "credit_note_tax_inconsistent",
    });
  }
  if (original.taxableAmountInPaise + original.totalTaxInPaise !== original.totalInPaise) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "credit_note_tax_inconsistent",
    });
  }
  if (original.taxType === "cgst_sgst" && (original.igstInPaise ?? 0) !== 0) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "credit_note_tax_inconsistent",
    });
  }
  if (original.taxType === "igst" && ((original.cgstInPaise ?? 0) !== 0 || (original.sgstInPaise ?? 0) !== 0)) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "credit_note_tax_inconsistent",
    });
  }
}

/**
 * Partial refunds are not yet a supported statutory feature. Fail closed
 * unless the verified refund amount exactly equals the original invoice total.
 */
export async function finalizeSubscriptionCreditNote(
  store: BillingStore,
  input: {
    refundFinancialEventId: string;
    diagnosticUidFor: (uid: string) => string;
    nowMs: number;
    section34CreditNotePolicy: Section34CreditNotePolicy;
  }
): Promise<{ creditNote: SubscriptionCreditNoteDoc; reused: boolean }> {
  const refundPath = financialLedgerPath(input.refundFinancialEventId);
  const creditNoteId = creditNoteIdForRefundEvent(input.refundFinancialEventId);
  const cnPath = subscriptionCreditNotePath(creditNoteId);
  const fyForIssue = getFinancialYearForDate(input.nowMs);
  const counterPath = creditNoteCounterPath(fyForIssue);
  const cnCompliancePath = subscriptionTaxCompliancePath(creditNoteId);

  return store.runTransaction(async (tx) => {
    const refundSnap = await tx.get(refundPath);
    if (!refundSnap.exists) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "financial_event_missing",
      });
    }
    const refund = refundSnap.data() as unknown as BillingEventLedgerDoc;
    if (refund.financialEventId !== input.refundFinancialEventId) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "financial_event_missing",
      });
    }
    if (refund.eventType !== "refund" && refund.eventType !== "chargeback") {
      throw new BillingError({
        clientCode: "invalid_purchase",
        causeCode: "financial_event_not_refundable",
      });
    }
    assertRefundMayIssueStatutoryCreditNote({
      eventType: refund.eventType,
      section34CreditNotePolicy: input.section34CreditNotePolicy,
    });
    const relatedId = refund.relatedFinancialEventId;
    if (!relatedId) {
      throw new BillingError({
        clientCode: "invalid_purchase",
        causeCode: "missing_related_financial_event",
      });
    }

    const originalLedgerSnap = await tx.get(financialLedgerPath(relatedId));
    if (!originalLedgerSnap.exists) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "related_financial_event_missing",
      });
    }
    const originalLedger = originalLedgerSnap.data() as unknown as BillingEventLedgerDoc;
    if (
      originalLedger.eventType !== "purchase" &&
      originalLedger.eventType !== "renewal"
    ) {
      throw new BillingError({
        clientCode: "invalid_purchase",
        causeCode: "related_financial_event_not_invoiceable",
      });
    }
    if (originalLedger.uid !== refund.uid || originalLedger.platform !== refund.platform) {
      throw new BillingError({
        clientCode: "invalid_purchase",
        causeCode: "related_financial_event_mismatch",
      });
    }

    const originalInvoiceId = invoiceIdForFinancialEvent(originalLedger.financialEventId);
    const originalInvoicePath = subscriptionInvoicePath(originalInvoiceId);
    const originalInvoiceSnap = await tx.get(originalInvoicePath);
    const existingCnSnap = await tx.get(cnPath);
    const counterSnap = await tx.get(counterPath);
    const originalCompliancePath = subscriptionTaxCompliancePath(originalInvoiceId);
    const originalComplianceSnap = await tx.get(originalCompliancePath);
    const cnComplianceSnap = await tx.get(cnCompliancePath);

    if (!originalInvoiceSnap.exists) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "credit_note_original_missing",
      });
    }
    const original = originalInvoiceSnap.data() as unknown as SubscriptionInvoiceDoc;
    if (original.invoiceId !== originalInvoiceId || original.financialEventId !== originalLedger.financialEventId) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "credit_note_original_mismatch",
      });
    }
    if (original.uid !== refund.uid || original.platform !== refund.platform) {
      throw new BillingError({
        clientCode: "invalid_purchase",
        causeCode: "related_financial_event_mismatch",
      });
    }
    if (!isIssuedInvoice(original) || !developerCreditNoteRequired(original)) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "credit_note_not_applicable",
      });
    }
    assertOriginalTaxIntegrity(original);

    if (existingCnSnap.exists) {
      const existing = existingCnSnap.data() as unknown as SubscriptionCreditNoteDoc;
      if (existing.refundFinancialEventId !== input.refundFinancialEventId) {
        throw new BillingError({
          clientCode: "internal_error",
          causeCode: "credit_note_id_collision",
        });
      }
      return { creditNote: existing, reused: true };
    }

    const originalTotal = original.totalInPaise as number;
    if (refund.grossAmountInPaise > originalTotal) {
      throw new BillingError({
        clientCode: "invalid_purchase",
        causeCode: "credit_exceeds_original",
      });
    }
    if (refund.grossAmountInPaise !== originalTotal) {
      throw new BillingError({
        clientCode: "invalid_purchase",
        causeCode: "partial_refund_not_supported",
      });
    }

    const originalCompliance = originalComplianceSnap.exists
      ? (originalComplianceSnap.data() as unknown as SubscriptionTaxComplianceDoc)
      : null;
    const priorCumulative = originalCompliance?.cumulativeCreditReversedInPaise ?? 0;
    if (priorCumulative + originalTotal > originalTotal) {
      throw new BillingError({
        clientCode: "invalid_purchase",
        causeCode: "credit_exceeds_original",
      });
    }

    const prior = (counterSnap.data() as CreditNoteCounterDoc | undefined) ?? {
      currentCount: 0,
      financialYear: fyForIssue,
      updatedAt: input.nowMs,
    };
    const serial = prior.currentCount + 1;
    const parties = snapshotCreditNoteParties(original);
    const evidence = evidenceStatusForRecipient(parties.buyer);
    const section34OuterLimitAt = section34OutputTaxReductionOuterLimitMs(
      original.supplyOccurredAt ?? original.createdAt
    );
    const gstAdjustmentEligibility = gstAdjustmentEligibilityAtIssuance({
      eventType: refund.eventType,
      issuedAt: input.nowMs,
      originalSupplyOccurredAt: original.supplyOccurredAt ?? original.createdAt,
    });
    const created: SubscriptionCreditNoteDoc = {
      creditNoteId,
      originalInvoiceId: original.invoiceId,
      originalDocumentNumber: original.documentNumber,
      refundFinancialEventId: input.refundFinancialEventId,
      uid: original.uid,
      diagnosticUid: input.diagnosticUidFor(original.uid),
      documentNumber: formatCreditNoteNumber(fyForIssue, serial),
      financialYear: fyForIssue,
      taxPeriodMonth: getMonthKey(input.nowMs),
      taxPeriodStatus: "resolved",
      issuedAt: input.nowMs,
      issuedOnIst: formatIstCalendarDate(input.nowMs),
      nature: CREDIT_NOTE_NATURE,
      seller: parties.seller,
      buyer: parties.buyer,
      buyerGstin: parties.buyer.gstin,
      buyerClassification: parties.buyer.classification,
      originalInvoiceIssuedAt: original.invoiceIssuedAt,
      originalInvoiceIssuedOnIst: original.invoiceIssuedOnIst,
      placeOfSupplyStateCode: original.placeOfSupplyStateCode,
      placeOfSupplyStateName: original.placeOfSupplyStateName,
      gstRateBps: original.gstRateBps,
      taxType: original.taxType,
      taxResponsibilityMode: original.taxResponsibilityMode,
      taxableAmountReversedInPaise: original.taxableAmountInPaise,
      cgstReversedInPaise: original.cgstInPaise,
      sgstReversedInPaise: original.sgstInPaise,
      igstReversedInPaise: original.igstInPaise,
      totalTaxReversedInPaise: original.totalTaxInPaise,
      totalReversedInPaise: original.totalInPaise,
      gstAdjustmentEligibility,
      recipientItcReversalEvidenceStatus: evidence.recipientItcReversalEvidenceStatus,
      taxIncidenceConditionStatus: evidence.taxIncidenceConditionStatus,
      section34OuterLimitAt,
      annualReturnCutoffStatus: "unconfirmed",
      annualReturnFurnishedAt: null,
      annualReturnCutoffReviewedAt: null,
      annualReturnCutoffReviewBasis: null,
      taxAdjustmentDisposition: "credit_note_issued",
      gstrReportable: true,
      gstrReportedMonth: null,
      gstrFilingBatchId: null,
      createdAt: input.nowMs,
      updatedAt: input.nowMs,
    };
    assertCreditNoteStatutoryParticulars({ creditNote: created, original });
    const invoiceDefaults = invoiceGstAdjustmentDefaults();
    const nextOriginalCompliance: SubscriptionTaxComplianceDoc = originalCompliance
      ? {
          ...originalCompliance,
          cumulativeCreditReversedInPaise: priorCumulative + originalTotal,
          updatedAt: input.nowMs,
        }
      : {
          invoiceId: original.invoiceId,
          documentKind: "invoice",
          financialEventId: original.financialEventId,
          originalInvoiceId: null,
          uid: original.uid,
          supplyMonthKey: getMonthKey(original.supplyOccurredAt ?? original.createdAt),
          issueMonthKey: original.invoiceIssuedAt ? getMonthKey(original.invoiceIssuedAt) : null,
          reportingTaxPeriodMonth: original.taxPeriodMonth,
          taxPeriodDecisionStatus: "requires_tax_review",
          ecoReportingCategory: original.ecoReporting.ecoReportingCategory,
          operatorIdentifier: original.ecoReporting.operatorIdentifier,
          operatorGstin: original.ecoReporting.operatorGstin,
          reviewStatus: "requires_tax_review",
          unresolvedReasons: ["compliance_record_missing"],
          cumulativeCreditReversedInPaise: originalTotal,
          ...invoiceDefaults,
          reviewedAt: null,
          reviewedByDiagnosticUid: null,
          reviewBasis: null,
          reviewVersion: 0,
          previousEcoReportingCategory: null,
          previousReportingTaxPeriodMonth: null,
          createdAt: input.nowMs,
          updatedAt: input.nowMs,
        };
    const cnCompliance = buildCreditNoteComplianceDoc({
      creditNote: created,
      original,
      originalCompliance: nextOriginalCompliance,
      existing: cnComplianceSnap.exists
        ? (cnComplianceSnap.data() as unknown as SubscriptionTaxComplianceDoc)
        : null,
      nowMs: input.nowMs,
    });

    tx.create(cnPath, created as unknown as Record<string, unknown>);
    tx.set(counterPath, {
      currentCount: serial,
      financialYear: fyForIssue,
      updatedAt: input.nowMs,
    } satisfies CreditNoteCounterDoc);
    if (originalComplianceSnap.exists) {
      tx.set(originalCompliancePath, nextOriginalCompliance as unknown as Record<string, unknown>);
    } else {
      tx.create(originalCompliancePath, nextOriginalCompliance as unknown as Record<string, unknown>);
    }
    if (cnComplianceSnap.exists) {
      tx.set(cnCompliancePath, cnCompliance as unknown as Record<string, unknown>);
    } else {
      tx.create(cnCompliancePath, cnCompliance as unknown as Record<string, unknown>);
    }
    return { creditNote: created, reused: false };
  });
}
