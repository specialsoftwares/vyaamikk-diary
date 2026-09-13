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
import {
  subscriptionCreditNotePath,
  subscriptionInvoicePath,
  subscriptionTaxCompliancePath,
} from "../paths";
import type { BillingStore } from "../store";
import type {
  AnnualReturnCutoffStatus,
  EcoReportingCategory,
  GstAdjustmentEligibility,
  GstEvidenceStatus,
  Gstr1ReviewStatus,
  SubscriptionCreditNoteDoc,
  SubscriptionInvoiceDoc,
  SubscriptionTaxComplianceDoc,
  TaxPeriodDecisionStatus,
} from "../types";

import { assertAdminAuthorized, type AdminAuthContext } from "./adminAuth";
import { getMonthKey } from "./financialYearUtils";
import {
  annualReturnCutoffIsResolvedForEligibility,
  assertGstAdjustmentMayBeEligible,
  effectiveSection34OutputTaxReductionLimitMs,
  invoiceGstAdjustmentDefaults,
} from "./gstAdjustment";
import { isValidGstinFormat } from "./gstin";
import { parseEcoReportingCategory } from "./platformTaxPolicy";
import { assertGstrMonth } from "./taxPeriod";

export function isInMonthlyComplianceScope(
  doc: Pick<
    SubscriptionTaxComplianceDoc,
    "supplyMonthKey" | "issueMonthKey" | "reportingTaxPeriodMonth"
  >,
  month: string
): boolean {
  return (
    doc.supplyMonthKey === month ||
    doc.issueMonthKey === month ||
    doc.reportingTaxPeriodMonth === month
  );
}

export function table14CategoryRequiresOperatorGstin(
  category: EcoReportingCategory
): boolean {
  return category === "section52_table14a" || category === "section9_5_table14b";
}

export function unresolvedReasonsForInvoice(input: {
  invoice: SubscriptionInvoiceDoc;
  ecoReportingCategory: EcoReportingCategory;
  operatorGstin: string | null;
  taxPeriodDecisionStatus: TaxPeriodDecisionStatus;
}): string[] {
  const reasons = new Set<string>();
  const inv = input.invoice;
  if (inv.issueHoldReason === "recipient_tax_classification_pending") {
    reasons.add("recipient_tax_classification_pending");
  }
  if (inv.issueHoldReason === "recipient_invoice_details_incomplete") {
    reasons.add("recipient_invoice_details_incomplete");
  }
  if (inv.taxResponsibilityMode === "unconfirmed") {
    reasons.add("tax_responsibility_unconfirmed");
  }
  if (inv.issueStatus !== "issued" || !inv.documentNumber || inv.invoiceIssuedAt == null) {
    reasons.add("document_unissued");
  }
  if (inv.seller == null) reasons.add("seller_identity_incomplete");
  if (!inv.sacCode || inv.gstRateBps == null) reasons.add("sac_rate_unconfirmed");
  if (inv.reverseChargeMode !== "yes" && inv.reverseChargeMode !== "no") {
    reasons.add("reverse_charge_unconfirmed");
  }
  if (inv.pdfStatus === "awaiting_financial_evidence") {
    reasons.add("financial_evidence_incomplete");
  }
  if (input.taxPeriodDecisionStatus === "unresolved_cross_period") {
    reasons.add("tax_period_unresolved_cross_period");
  }
  if (input.taxPeriodDecisionStatus === "pending_issue") {
    reasons.add("tax_period_pending_issue");
  }
  if (input.taxPeriodDecisionStatus === "requires_tax_review") {
    reasons.add("tax_period_requires_tax_review");
  }
  if (input.ecoReportingCategory === "requires_tax_review") {
    reasons.add("eco_reporting_requires_tax_review");
  }
  if (
    table14CategoryRequiresOperatorGstin(input.ecoReportingCategory) &&
    (!input.operatorGstin || !isValidGstinFormat(input.operatorGstin))
  ) {
    reasons.add("eco_operator_gstin_required");
  }
  return [...reasons].sort();
}

export function unresolvedReasonsForCreditNote(input: {
  creditNote: SubscriptionCreditNoteDoc;
  ecoReportingCategory: EcoReportingCategory;
  operatorGstin: string | null;
  gstAdjustmentEligibility?: GstAdjustmentEligibility;
  annualReturnCutoffStatus?: AnnualReturnCutoffStatus;
}): string[] {
  const reasons = new Set<string>();
  const note = input.creditNote;
  if (!note.documentNumber || note.issuedAt == null) reasons.add("document_unissued");
  if (note.taxPeriodStatus !== "resolved" || !note.taxPeriodMonth) {
    reasons.add("tax_period_pending_issue");
  }
  if (input.ecoReportingCategory === "requires_tax_review") {
    reasons.add("eco_reporting_requires_tax_review");
  }
  if (
    table14CategoryRequiresOperatorGstin(input.ecoReportingCategory) &&
    (!input.operatorGstin || !isValidGstinFormat(input.operatorGstin))
  ) {
    reasons.add("eco_operator_gstin_required");
  }
  const eligibility =
    input.gstAdjustmentEligibility ?? note.gstAdjustmentEligibility ?? "requires_review";
  if (eligibility === "requires_review") {
    reasons.add("gst_adjustment_requires_review");
  }
  const cutoff =
    input.annualReturnCutoffStatus ?? note.annualReturnCutoffStatus ?? "unconfirmed";
  if (eligibility === "eligible" && !annualReturnCutoffIsResolvedForEligibility(cutoff)) {
    reasons.add("gst_adjustment_annual_return_cutoff_unconfirmed");
  }
  return [...reasons].sort();
}

function reviewStatusFor(reasons: string[]): Gstr1ReviewStatus {
  return reasons.length === 0 ? "ready_to_file" : "requires_tax_review";
}

export function taxPeriodDecisionFromInvoice(
  invoice: SubscriptionInvoiceDoc
): TaxPeriodDecisionStatus {
  if (invoice.issueStatus !== "issued") return "pending_issue";
  if (invoice.taxPeriodStatus === "unresolved_cross_period") return "unresolved_cross_period";
  if (invoice.taxPeriodStatus === "resolved" && invoice.taxPeriodMonth) return "resolved";
  return "requires_tax_review";
}

export function buildInvoiceComplianceDoc(input: {
  invoice: SubscriptionInvoiceDoc;
  existing: SubscriptionTaxComplianceDoc | null;
  nowMs: number;
}): SubscriptionTaxComplianceDoc {
  const ecoReportingCategory = input.invoice.ecoReporting.ecoReportingCategory;
  const operatorGstin = input.invoice.ecoReporting.operatorGstin;
  const taxPeriodDecisionStatus =
    input.existing?.taxPeriodDecisionStatus === "resolved" &&
    input.existing.reportingTaxPeriodMonth &&
    input.invoice.issueStatus === "issued"
      ? input.existing.taxPeriodDecisionStatus
      : taxPeriodDecisionFromInvoice(input.invoice);
  const reportingTaxPeriodMonth =
    taxPeriodDecisionStatus === "resolved"
      ? (input.existing?.reportingTaxPeriodMonth ?? input.invoice.taxPeriodMonth)
      : input.existing?.reportingTaxPeriodMonth ?? null;
  const liveCategory = input.existing?.reviewedAt
    ? input.existing.ecoReportingCategory
    : ecoReportingCategory;
  const liveOperatorGstin = input.existing?.reviewedAt
    ? input.existing.operatorGstin
    : operatorGstin;
  const liveOperatorIdentifier = input.existing?.reviewedAt
    ? input.existing.operatorIdentifier
    : input.invoice.ecoReporting.operatorIdentifier;
  const reasons = unresolvedReasonsForInvoice({
    invoice: input.invoice,
    ecoReportingCategory: liveCategory,
    operatorGstin: liveOperatorGstin,
    taxPeriodDecisionStatus,
  });
  const adjustment = invoiceGstAdjustmentDefaults();
  return {
    invoiceId: input.invoice.invoiceId,
    documentKind: "invoice",
    financialEventId: input.invoice.financialEventId,
    originalInvoiceId: null,
    uid: input.invoice.uid,
    supplyMonthKey: getMonthKey(input.invoice.supplyOccurredAt ?? input.invoice.createdAt),
    issueMonthKey: input.invoice.invoiceIssuedAt ? getMonthKey(input.invoice.invoiceIssuedAt) : null,
    reportingTaxPeriodMonth,
    taxPeriodDecisionStatus,
    ecoReportingCategory: liveCategory,
    operatorIdentifier: liveOperatorIdentifier,
    operatorGstin: liveOperatorGstin,
    reviewStatus: reviewStatusFor(reasons),
    unresolvedReasons: reasons,
    cumulativeCreditReversedInPaise: input.existing?.cumulativeCreditReversedInPaise ?? 0,
    gstAdjustmentEligibility:
      input.existing?.gstAdjustmentEligibility ?? adjustment.gstAdjustmentEligibility,
    recipientItcReversalEvidenceStatus:
      input.existing?.recipientItcReversalEvidenceStatus ??
      adjustment.recipientItcReversalEvidenceStatus,
    taxIncidenceConditionStatus:
      input.existing?.taxIncidenceConditionStatus ?? adjustment.taxIncidenceConditionStatus,
    section34OuterLimitAt: input.existing?.section34OuterLimitAt ?? adjustment.section34OuterLimitAt,
    annualReturnCutoffStatus:
      input.existing?.annualReturnCutoffStatus ?? adjustment.annualReturnCutoffStatus,
    annualReturnFurnishedAt:
      input.existing?.annualReturnFurnishedAt ?? adjustment.annualReturnFurnishedAt,
    annualReturnCutoffReviewedAt:
      input.existing?.annualReturnCutoffReviewedAt ?? adjustment.annualReturnCutoffReviewedAt,
    annualReturnCutoffReviewBasis:
      input.existing?.annualReturnCutoffReviewBasis ?? adjustment.annualReturnCutoffReviewBasis,
    taxAdjustmentDisposition:
      input.existing?.taxAdjustmentDisposition ?? adjustment.taxAdjustmentDisposition,
    reviewedAt: input.existing?.reviewedAt ?? null,
    reviewedByDiagnosticUid: input.existing?.reviewedByDiagnosticUid ?? null,
    reviewBasis: input.existing?.reviewBasis ?? null,
    reviewVersion: input.existing?.reviewVersion ?? 0,
    previousEcoReportingCategory: input.existing?.previousEcoReportingCategory ?? null,
    previousReportingTaxPeriodMonth: input.existing?.previousReportingTaxPeriodMonth ?? null,
    createdAt: input.existing?.createdAt ?? input.nowMs,
    updatedAt: input.nowMs,
  };
}

export function buildCreditNoteComplianceDoc(input: {
  creditNote: SubscriptionCreditNoteDoc;
  original: SubscriptionInvoiceDoc;
  originalCompliance: SubscriptionTaxComplianceDoc | null;
  existing: SubscriptionTaxComplianceDoc | null;
  nowMs: number;
}): SubscriptionTaxComplianceDoc {
  const ecoReportingCategory =
    input.originalCompliance?.ecoReportingCategory ??
    input.original.ecoReporting.ecoReportingCategory;
  const operatorGstin =
    input.originalCompliance?.operatorGstin ?? input.original.ecoReporting.operatorGstin;
  const gstAdjustmentEligibility =
    input.existing?.reviewedAt && input.existing.gstAdjustmentEligibility
      ? input.existing.gstAdjustmentEligibility
      : input.creditNote.gstAdjustmentEligibility;
  const annualReturnCutoffStatus =
    input.existing?.annualReturnCutoffStatus ??
    input.creditNote.annualReturnCutoffStatus ??
    "unconfirmed";
  const reasons = unresolvedReasonsForCreditNote({
    creditNote: input.creditNote,
    ecoReportingCategory,
    operatorGstin,
    gstAdjustmentEligibility,
    annualReturnCutoffStatus,
  });
  return {
    invoiceId: input.creditNote.creditNoteId,
    documentKind: "credit_note",
    financialEventId: input.creditNote.refundFinancialEventId,
    originalInvoiceId: input.original.invoiceId,
    uid: input.creditNote.uid,
    supplyMonthKey: getMonthKey(input.original.supplyOccurredAt ?? input.original.createdAt),
    issueMonthKey: input.creditNote.issuedAt ? getMonthKey(input.creditNote.issuedAt) : null,
    reportingTaxPeriodMonth: input.creditNote.taxPeriodMonth,
    taxPeriodDecisionStatus: input.creditNote.taxPeriodStatus === "resolved" ? "resolved" : "pending_issue",
    ecoReportingCategory,
    operatorIdentifier:
      input.originalCompliance?.operatorIdentifier ??
      input.original.ecoReporting.operatorIdentifier,
    operatorGstin,
    reviewStatus: reviewStatusFor(reasons),
    unresolvedReasons: reasons,
    cumulativeCreditReversedInPaise: 0,
    gstAdjustmentEligibility,
    recipientItcReversalEvidenceStatus:
      input.existing?.recipientItcReversalEvidenceStatus ??
      input.creditNote.recipientItcReversalEvidenceStatus,
    taxIncidenceConditionStatus:
      input.existing?.taxIncidenceConditionStatus ?? input.creditNote.taxIncidenceConditionStatus,
    section34OuterLimitAt:
      input.existing?.section34OuterLimitAt ?? input.creditNote.section34OuterLimitAt,
    annualReturnCutoffStatus,
    annualReturnFurnishedAt:
      input.existing?.annualReturnFurnishedAt ?? input.creditNote.annualReturnFurnishedAt,
    annualReturnCutoffReviewedAt:
      input.existing?.annualReturnCutoffReviewedAt ??
      input.creditNote.annualReturnCutoffReviewedAt,
    annualReturnCutoffReviewBasis:
      input.existing?.annualReturnCutoffReviewBasis ??
      input.creditNote.annualReturnCutoffReviewBasis,
    taxAdjustmentDisposition:
      input.existing?.taxAdjustmentDisposition ?? input.creditNote.taxAdjustmentDisposition,
    reviewedAt: input.existing?.reviewedAt ?? null,
    reviewedByDiagnosticUid: input.existing?.reviewedByDiagnosticUid ?? null,
    reviewBasis: input.existing?.reviewBasis ?? null,
    reviewVersion: input.existing?.reviewVersion ?? 0,
    previousEcoReportingCategory: input.existing?.previousEcoReportingCategory ?? null,
    previousReportingTaxPeriodMonth: input.existing?.previousReportingTaxPeriodMonth ?? null,
    createdAt: input.existing?.createdAt ?? input.nowMs,
    updatedAt: input.nowMs,
  };
}

export interface ReviewTaxComplianceInput {
  invoiceId: string;
  admin: AdminAuthContext;
  reviewedByDiagnosticUid: string;
  reviewBasis: string;
  nowMs: number;
  ecoReportingCategory?: EcoReportingCategory;
  operatorGstin?: string | null;
  operatorIdentifier?: string | null;
  reportingTaxPeriodMonth?: string | null;
  gstAdjustmentEligibility?: GstAdjustmentEligibility;
  recipientItcReversalEvidenceStatus?: GstEvidenceStatus;
  taxIncidenceConditionStatus?: GstEvidenceStatus;
  annualReturnCutoffStatus?: AnnualReturnCutoffStatus;
  annualReturnFurnishedAt?: number | null;
}

/**
 * Dedicated admin review of mutable GST-return classification.
 * Does not mutate the invoice legal snapshot.
 */
export async function applyReviewTaxCompliance(
  store: BillingStore,
  input: ReviewTaxComplianceInput
): Promise<SubscriptionTaxComplianceDoc> {
  assertAdminAuthorized(input.admin);
  const basis = input.reviewBasis.trim();
  if (!basis) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "compliance_review_basis_required",
    });
  }
  if (input.reportingTaxPeriodMonth) assertGstrMonth(input.reportingTaxPeriodMonth);
  const invoicePath = subscriptionInvoicePath(input.invoiceId);
  const creditNotePath = subscriptionCreditNotePath(input.invoiceId);
  const compliancePath = subscriptionTaxCompliancePath(input.invoiceId);
  return store.runTransaction(async (tx) => {
    const invoiceSnap = await tx.get(invoicePath);
    const creditNoteSnap = await tx.get(creditNotePath);
    const complianceSnap = await tx.get(compliancePath);
    if (!complianceSnap.exists) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "compliance_record_missing",
      });
    }
    const prior = complianceSnap.data() as unknown as SubscriptionTaxComplianceDoc;
    if (prior.documentKind === "credit_note") {
      if (!creditNoteSnap.exists) {
        throw new BillingError({
          clientCode: "not_entitled",
          causeCode: "credit_note_missing",
        });
      }
      const creditNote = creditNoteSnap.data() as unknown as SubscriptionCreditNoteDoc;
      const originalSnap = await tx.get(subscriptionInvoicePath(creditNote.originalInvoiceId));
      if (!originalSnap.exists) {
        throw new BillingError({
          clientCode: "internal_error",
          causeCode: "credit_note_original_missing",
        });
      }
      const original = originalSnap.data() as unknown as SubscriptionInvoiceDoc;
      const gstAdjustmentEligibility =
        input.gstAdjustmentEligibility ?? prior.gstAdjustmentEligibility;
      const recipientItcReversalEvidenceStatus =
        input.recipientItcReversalEvidenceStatus ?? prior.recipientItcReversalEvidenceStatus;
      const taxIncidenceConditionStatus =
        input.taxIncidenceConditionStatus ?? prior.taxIncidenceConditionStatus;
      const annualReturnCutoffStatus =
        input.annualReturnCutoffStatus ?? prior.annualReturnCutoffStatus ?? "unconfirmed";
      const annualReturnFurnishedAt =
        input.annualReturnFurnishedAt !== undefined
          ? input.annualReturnFurnishedAt
          : (prior.annualReturnFurnishedAt ?? null);
      if (!creditNote.buyer) {
        throw new BillingError({
          clientCode: "internal_error",
          causeCode: "credit_note_statutory_particulars_incomplete",
        });
      }
      assertGstAdjustmentMayBeEligible({
        eligibility: gstAdjustmentEligibility,
        buyer: creditNote.buyer,
        recipientItcReversalEvidenceStatus,
        taxIncidenceConditionStatus,
        issuedAt: creditNote.issuedAt ?? input.nowMs,
        originalSupplyOccurredAt: original.supplyOccurredAt ?? original.createdAt,
        annualReturnCutoffStatus,
        annualReturnFurnishedAt,
      });
      const section34OuterLimitAt =
        gstAdjustmentEligibility === "eligible"
          ? effectiveSection34OutputTaxReductionLimitMs({
              originalSupplyOccurredAt: original.supplyOccurredAt ?? original.createdAt,
              annualReturnCutoffStatus,
              annualReturnFurnishedAt,
            })
          : (prior.section34OuterLimitAt ?? creditNote.section34OuterLimitAt);
      const annualReturnCutoffReviewedAt = input.annualReturnCutoffStatus
        ? input.nowMs
        : (prior.annualReturnCutoffReviewedAt ?? null);
      const annualReturnCutoffReviewBasis = input.annualReturnCutoffStatus
        ? basis
        : (prior.annualReturnCutoffReviewBasis ?? null);
      const ecoReportingCategory =
        input.ecoReportingCategory !== undefined
          ? parseEcoReportingCategory(input.ecoReportingCategory)
          : prior.ecoReportingCategory;
      const operatorGstin =
        input.operatorGstin !== undefined ? input.operatorGstin : prior.operatorGstin;
      const operatorIdentifier =
        input.operatorIdentifier !== undefined
          ? input.operatorIdentifier
          : prior.operatorIdentifier;
      const reasons = unresolvedReasonsForCreditNote({
        creditNote,
        ecoReportingCategory,
        operatorGstin,
        gstAdjustmentEligibility,
        annualReturnCutoffStatus,
      });
      const next: SubscriptionTaxComplianceDoc = {
        ...prior,
        ecoReportingCategory,
        operatorGstin,
        operatorIdentifier,
        gstAdjustmentEligibility,
        recipientItcReversalEvidenceStatus,
        taxIncidenceConditionStatus,
        section34OuterLimitAt,
        annualReturnCutoffStatus,
        annualReturnFurnishedAt,
        annualReturnCutoffReviewedAt,
        annualReturnCutoffReviewBasis,
        taxAdjustmentDisposition: "credit_note_issued",
        unresolvedReasons: reasons,
        reviewStatus: reviewStatusFor(reasons),
        previousEcoReportingCategory: prior.ecoReportingCategory,
        previousReportingTaxPeriodMonth: prior.reportingTaxPeriodMonth,
        reviewedAt: input.nowMs,
        reviewedByDiagnosticUid: input.reviewedByDiagnosticUid,
        reviewBasis: basis,
        reviewVersion: prior.reviewVersion + 1,
        updatedAt: input.nowMs,
      };
      tx.set(compliancePath, next as unknown as Record<string, unknown>);
      return next;
    }
    if (!invoiceSnap.exists) {
      throw new BillingError({
        clientCode: "not_entitled",
        causeCode: "invoice_missing",
      });
    }
    const invoice = invoiceSnap.data() as unknown as SubscriptionInvoiceDoc;
    const ecoReportingCategory =
      input.ecoReportingCategory !== undefined
        ? parseEcoReportingCategory(input.ecoReportingCategory)
        : prior.ecoReportingCategory;
    const operatorGstin =
      input.operatorGstin !== undefined ? input.operatorGstin : prior.operatorGstin;
    const operatorIdentifier =
      input.operatorIdentifier !== undefined
        ? input.operatorIdentifier
        : prior.operatorIdentifier;
    const reportingTaxPeriodMonth =
      input.reportingTaxPeriodMonth !== undefined
        ? input.reportingTaxPeriodMonth
        : prior.reportingTaxPeriodMonth;
    const taxPeriodDecisionStatus: TaxPeriodDecisionStatus =
      reportingTaxPeriodMonth && invoice.issueStatus === "issued"
        ? "resolved"
        : taxPeriodDecisionFromInvoice(invoice);
    const reasons = unresolvedReasonsForInvoice({
      invoice,
      ecoReportingCategory,
      operatorGstin,
      taxPeriodDecisionStatus,
    });
    const next: SubscriptionTaxComplianceDoc = {
      ...prior,
      ecoReportingCategory,
      operatorGstin,
      operatorIdentifier,
      reportingTaxPeriodMonth,
      taxPeriodDecisionStatus,
      unresolvedReasons: reasons,
      reviewStatus: reviewStatusFor(reasons),
      previousEcoReportingCategory: prior.ecoReportingCategory,
      previousReportingTaxPeriodMonth: prior.reportingTaxPeriodMonth,
      reviewedAt: input.nowMs,
      reviewedByDiagnosticUid: input.reviewedByDiagnosticUid,
      reviewBasis: basis,
      reviewVersion: prior.reviewVersion + 1,
      updatedAt: input.nowMs,
    };
    tx.set(compliancePath, next as unknown as Record<string, unknown>);
    return next;
  });
}

export function complianceStatutoryBind(doc: SubscriptionTaxComplianceDoc) {
  return {
    invoiceId: doc.invoiceId,
    documentKind: doc.documentKind,
    reportingTaxPeriodMonth: doc.reportingTaxPeriodMonth,
    taxPeriodDecisionStatus: doc.taxPeriodDecisionStatus,
    ecoReportingCategory: doc.ecoReportingCategory,
    operatorGstin: doc.operatorGstin,
    operatorIdentifier: doc.operatorIdentifier,
    reviewStatus: doc.reviewStatus,
    reviewVersion: doc.reviewVersion,
    reviewBasis: doc.reviewBasis,
    unresolvedReasons: doc.unresolvedReasons,
    gstAdjustmentEligibility: doc.gstAdjustmentEligibility,
    recipientItcReversalEvidenceStatus: doc.recipientItcReversalEvidenceStatus,
    taxIncidenceConditionStatus: doc.taxIncidenceConditionStatus,
    taxAdjustmentDisposition: doc.taxAdjustmentDisposition,
    section34OuterLimitAt: doc.section34OuterLimitAt,
    annualReturnCutoffStatus: doc.annualReturnCutoffStatus,
    annualReturnFurnishedAt: doc.annualReturnFurnishedAt,
    annualReturnCutoffReviewedAt: doc.annualReturnCutoffReviewedAt,
    annualReturnCutoffReviewBasis: doc.annualReturnCutoffReviewBasis,
  };
}
