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
  AnnualReturnCutoffStatus,
  BuyerTaxSnapshot,
  FinancialEventType,
  GstAdjustmentEligibility,
  GstEvidenceStatus,
  Section34CreditNotePolicy,
  SellerTaxSnapshot,
  SubscriptionCreditNoteDoc,
  SubscriptionInvoiceDoc,
  TaxAdjustmentDisposition,
} from "../types";

import { section34OutputTaxReductionOuterLimitMs } from "./financialYearUtils";
import { STATUTORY_DOCUMENT_NUMBER_MAX_LEN } from "./invoiceAllocation";

export const CREDIT_NOTE_NATURE = "CREDIT NOTE" as const;

export function invoiceGstAdjustmentDefaults(): {
  gstAdjustmentEligibility: GstAdjustmentEligibility;
  recipientItcReversalEvidenceStatus: GstEvidenceStatus;
  taxIncidenceConditionStatus: GstEvidenceStatus;
  section34OuterLimitAt: number | null;
  taxAdjustmentDisposition: TaxAdjustmentDisposition;
  annualReturnCutoffStatus: AnnualReturnCutoffStatus;
  annualReturnFurnishedAt: number | null;
  annualReturnCutoffReviewedAt: number | null;
  annualReturnCutoffReviewBasis: string | null;
} {
  return {
    gstAdjustmentEligibility: "not_applicable",
    recipientItcReversalEvidenceStatus: "not_applicable",
    taxIncidenceConditionStatus: "not_applicable",
    section34OuterLimitAt: null,
    taxAdjustmentDisposition: "not_applicable",
    annualReturnCutoffStatus: "not_applicable",
    annualReturnFurnishedAt: null,
    annualReturnCutoffReviewedAt: null,
    annualReturnCutoffReviewBasis: null,
  };
}

export function creditNoteGstAdjustmentUnconfirmedDefaults(): {
  gstAdjustmentEligibility: GstAdjustmentEligibility;
  recipientItcReversalEvidenceStatus: GstEvidenceStatus;
  taxIncidenceConditionStatus: GstEvidenceStatus;
  section34OuterLimitAt: number | null;
  taxAdjustmentDisposition: TaxAdjustmentDisposition;
  annualReturnCutoffStatus: AnnualReturnCutoffStatus;
  annualReturnFurnishedAt: number | null;
  annualReturnCutoffReviewedAt: number | null;
  annualReturnCutoffReviewBasis: string | null;
} {
  return {
    gstAdjustmentEligibility: "requires_review",
    recipientItcReversalEvidenceStatus: "unconfirmed",
    taxIncidenceConditionStatus: "unconfirmed",
    section34OuterLimitAt: null,
    taxAdjustmentDisposition: "pending",
    annualReturnCutoffStatus: "unconfirmed",
    annualReturnFurnishedAt: null,
    annualReturnCutoffReviewedAt: null,
    annualReturnCutoffReviewBasis: null,
  };
}

export function annualReturnCutoffIsResolvedForEligibility(
  status: AnnualReturnCutoffStatus | null | undefined
): boolean {
  return status === "furnished" || status === "not_furnished_as_of_review";
}

/**
 * Earlier of 30 November following the original-supply FY and the furnished
 * annual-return timestamp. Never guesses an annual-return date.
 */
export function effectiveSection34OutputTaxReductionLimitMs(input: {
  originalSupplyOccurredAt: number;
  annualReturnCutoffStatus: AnnualReturnCutoffStatus;
  annualReturnFurnishedAt: number | null;
}): number {
  const statutory = section34OutputTaxReductionOuterLimitMs(input.originalSupplyOccurredAt);
  if (
    input.annualReturnCutoffStatus === "unconfirmed" ||
    input.annualReturnCutoffStatus === "not_applicable"
  ) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "gst_adjustment_annual_return_cutoff_unconfirmed",
    });
  }
  if (input.annualReturnCutoffStatus === "not_furnished_as_of_review") {
    return statutory;
  }
  if (input.annualReturnFurnishedAt == null || !Number.isFinite(input.annualReturnFurnishedAt)) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "gst_adjustment_annual_return_furnished_at_required",
    });
  }
  return Math.min(statutory, input.annualReturnFurnishedAt);
}

export function parseSection34CreditNotePolicy(
  raw: string | null | undefined
): Section34CreditNotePolicy {
  if (raw === "full_refund_developer_tax_invoice") return raw;
  return "unconfirmed";
}

export function assertRefundMayIssueStatutoryCreditNote(input: {
  eventType: FinancialEventType;
  section34CreditNotePolicy: Section34CreditNotePolicy;
}): void {
  if (input.eventType === "chargeback") {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "chargeback_credit_note_not_automatic",
    });
  }
  if (input.eventType !== "refund") {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "financial_event_not_refundable",
    });
  }
  if (input.section34CreditNotePolicy !== "full_refund_developer_tax_invoice") {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "gst_credit_note_policy_unconfirmed",
    });
  }
}

export function evidenceStatusForRecipient(buyer: BuyerTaxSnapshot): {
  recipientItcReversalEvidenceStatus: GstEvidenceStatus;
  taxIncidenceConditionStatus: GstEvidenceStatus;
} {
  if (buyer.classification === "b2b") {
    return {
      recipientItcReversalEvidenceStatus: "unconfirmed",
      taxIncidenceConditionStatus: "not_applicable",
    };
  }
  return {
    recipientItcReversalEvidenceStatus: "not_applicable",
    taxIncidenceConditionStatus: "unconfirmed",
  };
}

/**
 * A store refund is financial evidence only. Output-tax reduction is never
 * inferred automatically from eventType or from issuing a statutory CN.
 */
export function gstAdjustmentEligibilityAtIssuance(input: {
  eventType: FinancialEventType;
  issuedAt: number;
  originalSupplyOccurredAt: number;
}): GstAdjustmentEligibility {
  if (input.eventType === "chargeback") return "requires_review";
  const limit = section34OutputTaxReductionOuterLimitMs(input.originalSupplyOccurredAt);
  if (input.issuedAt > limit) return "ineligible_for_output_tax_reduction";
  return "requires_review";
}

export function assertGstAdjustmentMayBeEligible(input: {
  eligibility: GstAdjustmentEligibility;
  buyer: BuyerTaxSnapshot;
  recipientItcReversalEvidenceStatus: GstEvidenceStatus;
  taxIncidenceConditionStatus: GstEvidenceStatus;
  issuedAt: number;
  originalSupplyOccurredAt: number;
  annualReturnCutoffStatus: AnnualReturnCutoffStatus;
  annualReturnFurnishedAt: number | null;
}): void {
  if (input.eligibility !== "eligible") return;
  const limit = effectiveSection34OutputTaxReductionLimitMs({
    originalSupplyOccurredAt: input.originalSupplyOccurredAt,
    annualReturnCutoffStatus: input.annualReturnCutoffStatus,
    annualReturnFurnishedAt: input.annualReturnFurnishedAt,
  });
  if (input.issuedAt > limit) {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "gst_adjustment_section34_deadline_passed",
    });
  }
  if (input.buyer.classification === "b2b") {
    if (input.recipientItcReversalEvidenceStatus !== "confirmed") {
      throw new BillingError({
        clientCode: "invalid_purchase",
        causeCode: "gst_adjustment_itc_reversal_unconfirmed",
      });
    }
  } else if (input.taxIncidenceConditionStatus !== "confirmed") {
    throw new BillingError({
      clientCode: "invalid_purchase",
      causeCode: "gst_adjustment_tax_incidence_unconfirmed",
    });
  }
}

export function outputTaxReductionIncluded(eligibility: string | null | undefined): boolean {
  return eligibility === "eligible";
}

export function outputTaxReductionMayBeApplied(input: {
  eligibility: string | null | undefined;
  annualReturnCutoffStatus: AnnualReturnCutoffStatus | null | undefined;
}): boolean {
  return (
    outputTaxReductionIncluded(input.eligibility) &&
    annualReturnCutoffIsResolvedForEligibility(input.annualReturnCutoffStatus)
  );
}

export function assertCreditNoteStatutoryParticulars(input: {
  creditNote: Pick<
    SubscriptionCreditNoteDoc,
    | "documentNumber"
    | "issuedAt"
    | "issuedOnIst"
    | "nature"
    | "seller"
    | "buyer"
    | "originalDocumentNumber"
    | "originalInvoiceIssuedOnIst"
    | "gstRateBps"
    | "taxType"
    | "taxableAmountReversedInPaise"
    | "cgstReversedInPaise"
    | "sgstReversedInPaise"
    | "igstReversedInPaise"
    | "totalTaxReversedInPaise"
    | "totalReversedInPaise"
  >;
  original: SubscriptionInvoiceDoc;
}): void {
  const note = input.creditNote;
  const seller = note.seller;
  const buyer = note.buyer;
  if (note.nature !== CREDIT_NOTE_NATURE) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "credit_note_statutory_particulars_incomplete",
    });
  }
  if (!note.documentNumber || note.documentNumber.length > STATUTORY_DOCUMENT_NUMBER_MAX_LEN) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "credit_note_statutory_particulars_incomplete",
    });
  }
  if (note.issuedAt == null || !note.issuedOnIst) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "credit_note_statutory_particulars_incomplete",
    });
  }
  if (!sellerComplete(seller) || !buyerComplete(buyer)) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "credit_note_statutory_particulars_incomplete",
    });
  }
  if (!note.originalDocumentNumber || !note.originalInvoiceIssuedOnIst) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "credit_note_statutory_particulars_incomplete",
    });
  }
  if (
    note.gstRateBps == null ||
    note.taxType == null ||
    note.taxableAmountReversedInPaise == null ||
    note.totalTaxReversedInPaise == null ||
    note.totalReversedInPaise == null ||
    note.cgstReversedInPaise == null ||
    note.sgstReversedInPaise == null ||
    note.igstReversedInPaise == null
  ) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "credit_note_statutory_particulars_incomplete",
    });
  }
  if (input.original.seller == null || input.original.buyer.legalName == null) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "credit_note_statutory_particulars_incomplete",
    });
  }
}

function sellerComplete(seller: SellerTaxSnapshot | null): seller is SellerTaxSnapshot {
  return Boolean(
    seller &&
      seller.legalName.trim() &&
      seller.gstin.trim() &&
      seller.registeredAddress.trim() &&
      seller.stateCode.trim() &&
      seller.stateName.trim()
  );
}

function buyerComplete(buyer: BuyerTaxSnapshot | null): buyer is BuyerTaxSnapshot {
  if (!buyer || !buyer.legalName?.trim() || !buyer.billingAddress?.trim()) return false;
  if (!buyer.stateCode?.trim() || !buyer.stateName?.trim()) return false;
  if (buyer.classification === "b2b") {
    return Boolean(buyer.gstin?.trim() && buyer.gstinVerificationStatus === "verified");
  }
  return true;
}

export function snapshotCreditNoteParties(original: SubscriptionInvoiceDoc): {
  seller: SellerTaxSnapshot;
  buyer: BuyerTaxSnapshot;
} {
  if (!original.seller || !buyerComplete(original.buyer)) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "credit_note_statutory_particulars_incomplete",
    });
  }
  return {
    seller: { ...original.seller },
    buyer: { ...original.buyer },
  };
}
