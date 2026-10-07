/**
 * Findings are investigation prompts. They never grant or deny ITC.
 * Official GSTR-2B guidance requires reconciliation with books and
 * recognises eligibility conditions beyond the statement itself.
 *
 * No GST threshold is invented here. EWB statutory applicability is an
 * explicit recorded assertion, not a computed rupee limit. Supplier status
 * and GSTR-2B values are observations from a named source at a time; they
 * are not a live GST portal.
 */

import { cancellationEvidenceError } from "./ewb";

export type ExceptionResultKind =
  | "clear"
  | "exception"
  | "not_applicable"
  | "unknown_incomplete_source";

export type ItcDisposition = "not_determined";

export type ExceptionRuleId =
  | "ewb_without_invoice_or_book_entry"
  | "invoice_requires_ewb_none_linked"
  | "inward_ewb_without_grin"
  | "grin_without_invoice"
  | "cancelled_ewb_lacks_reason_or_replacement"
  | "amount_or_party_mismatch"
  | "gstr2b_purchase_without_grin"
  | "grin_or_invoice_missing_from_2b"
  | "supplier_later_suspended_or_cancelled"
  | "return_without_return_ewb_or_credit_note";

export type EvidenceSourceKind = "manual_assertion" | "imported_document" | "unknown_incomplete";

export type EwbApplicabilityAssertion = "required" | "not_applicable" | "unknown";

export type SupplierStatusObservation = "active" | "suspended" | "cancelled" | "unknown";

export type ImportCoverage = "full" | "partial" | "none";

export interface SourcedObservation {
  observedAtUtc: string;
  source: string;
  sourceKind: EvidenceSourceKind;
}

export interface ExceptionEvaluation {
  ruleId: ExceptionRuleId;
  ruleVersion: string;
  evaluatedAtUtc: string;
  kind: ExceptionResultKind;
  itcDisposition: ItcDisposition;
  comparedValues: Record<string, unknown>;
  sourceCoverage: string;
  explanation: string;
}

export const EXCEPTION_RULE_VERSION = "1";

export function evaluation(partial: Omit<ExceptionEvaluation, "itcDisposition" | "ruleVersion">): ExceptionEvaluation {
  return {
    ...partial,
    ruleVersion: EXCEPTION_RULE_VERSION,
    itcDisposition: "not_determined",
  };
}

function observationFields(observation?: SourcedObservation): Record<string, unknown> {
  if (!observation) return {};
  return {
    source: observation.source,
    sourceKind: observation.sourceKind,
    observedAtUtc: observation.observedAtUtc,
  };
}

function incompleteSource(
  ruleId: ExceptionRuleId,
  evaluatedAtUtc: string,
  observation: SourcedObservation | undefined,
  extra: Record<string, unknown>,
  explanation: string
): ExceptionEvaluation {
  return evaluation({
    ruleId,
    evaluatedAtUtc,
    kind: "unknown_incomplete_source",
    comparedValues: { ...observationFields(observation), ...extra },
    sourceCoverage: observation?.sourceKind ?? "unknown_incomplete",
    explanation,
  });
}

function hasUsableSource(observation?: SourcedObservation): boolean {
  if (!observation) return true;
  if (!observation.source.trim() || !observation.observedAtUtc.trim()) return false;
  return observation.sourceKind !== "unknown_incomplete";
}

export function gstr2bPurchaseWithoutGrin(input: {
  evaluatedAtUtc: string;
  isGoodsPurchase: boolean;
  isServiceOrIsd: boolean;
  hasDirectDeliveryEvidence: boolean;
  importCoverage: ImportCoverage;
  grinPresent: boolean;
  observation?: SourcedObservation;
}): ExceptionEvaluation {
  const compared = observationFields(input.observation);
  if (input.isServiceOrIsd) {
    return evaluation({
      ruleId: "gstr2b_purchase_without_grin",
      evaluatedAtUtc: input.evaluatedAtUtc,
      kind: "not_applicable",
      comparedValues: { ...compared, isServiceOrIsd: true },
      sourceCoverage: input.importCoverage,
      explanation: "Services/ISD do not require a warehouse GRIN.",
    });
  }
  if (!input.isGoodsPurchase) {
    return evaluation({
      ruleId: "gstr2b_purchase_without_grin",
      evaluatedAtUtc: input.evaluatedAtUtc,
      kind: "not_applicable",
      comparedValues: { ...compared, isGoodsPurchase: false },
      sourceCoverage: input.importCoverage,
      explanation: "Rule applies only to relevant goods purchases.",
    });
  }
  if (input.importCoverage !== "full") {
    return evaluation({
      ruleId: "gstr2b_purchase_without_grin",
      evaluatedAtUtc: input.evaluatedAtUtc,
      kind: "unknown_incomplete_source",
      comparedValues: { ...compared, grinPresent: input.grinPresent },
      sourceCoverage: input.importCoverage,
      explanation: "Absence from a partial import is not proof of absence.",
    });
  }
  if (!hasUsableSource(input.observation)) {
    return incompleteSource(
      "gstr2b_purchase_without_grin",
      input.evaluatedAtUtc,
      input.observation,
      { grinPresent: input.grinPresent },
      "2B coverage cannot be judged from an incomplete source."
    );
  }
  if (input.hasDirectDeliveryEvidence) {
    return evaluation({
      ruleId: "gstr2b_purchase_without_grin",
      evaluatedAtUtc: input.evaluatedAtUtc,
      kind: "not_applicable",
      comparedValues: { ...compared, hasDirectDeliveryEvidence: true },
      sourceCoverage: input.importCoverage,
      explanation: "Direct-delivery models need alternate receipt evidence, not a fictitious warehouse GRIN.",
    });
  }
  if (input.grinPresent) {
    return evaluation({
      ruleId: "gstr2b_purchase_without_grin",
      evaluatedAtUtc: input.evaluatedAtUtc,
      kind: "clear",
      comparedValues: { ...compared, grinPresent: true },
      sourceCoverage: input.importCoverage,
      explanation: "Goods purchase has a linked GRIN.",
    });
  }
  return evaluation({
    ruleId: "gstr2b_purchase_without_grin",
    evaluatedAtUtc: input.evaluatedAtUtc,
    kind: "exception",
    comparedValues: { ...compared, grinPresent: false },
    sourceCoverage: input.importCoverage,
    explanation: "2B goods purchase has no GRIN. Review; do not auto-reject ITC.",
  });
}

export function grinWithoutInvoice(input: {
  evaluatedAtUtc: string;
  invoiceLinked: boolean;
  challanLinked: boolean;
  observation?: SourcedObservation;
}): ExceptionEvaluation {
  const compared = observationFields(input.observation);
  if (input.invoiceLinked) {
    return evaluation({
      ruleId: "grin_without_invoice",
      evaluatedAtUtc: input.evaluatedAtUtc,
      kind: "clear",
      comparedValues: { ...compared, invoiceLinked: true },
      sourceCoverage: "grin",
      explanation: "Invoice is linked.",
    });
  }
  return evaluation({
    ruleId: "grin_without_invoice",
    evaluatedAtUtc: input.evaluatedAtUtc,
    kind: "exception",
    comparedValues: { ...compared, invoiceLinked: false, challanLinked: input.challanLinked },
    sourceCoverage: "grin",
    explanation: input.challanLinked
      ? "Challan delivery remains open until an invoice is supplied. Capture still succeeded. A challan is not an invoice."
      : "GRIN has no invoice. Missing-document workflow; capture still succeeded.",
  });
}

export function ewbWithoutInvoiceOrBookEntry(input: {
  evaluatedAtUtc: string;
  ewbPresent: boolean;
  invoiceLinked: boolean;
  bookEntryPresent: boolean;
  observation?: SourcedObservation;
}): ExceptionEvaluation {
  const compared = {
    ...observationFields(input.observation),
    ewbPresent: input.ewbPresent,
    invoiceLinked: input.invoiceLinked,
    bookEntryPresent: input.bookEntryPresent,
  };
  if (!input.ewbPresent) {
    return evaluation({
      ruleId: "ewb_without_invoice_or_book_entry",
      evaluatedAtUtc: input.evaluatedAtUtc,
      kind: "not_applicable",
      comparedValues: compared,
      sourceCoverage: input.observation?.sourceKind ?? "grin",
      explanation: "No EWB is recorded, so this pairing check does not apply.",
    });
  }
  if (!hasUsableSource(input.observation)) {
    return incompleteSource(
      "ewb_without_invoice_or_book_entry",
      input.evaluatedAtUtc,
      input.observation,
      compared,
      "Invoice or book-entry coverage cannot be judged from an incomplete source."
    );
  }
  if (input.invoiceLinked || input.bookEntryPresent) {
    return evaluation({
      ruleId: "ewb_without_invoice_or_book_entry",
      evaluatedAtUtc: input.evaluatedAtUtc,
      kind: "clear",
      comparedValues: compared,
      sourceCoverage: input.observation?.sourceKind ?? "grin",
      explanation: "EWB is accompanied by an invoice or a book entry.",
    });
  }
  return evaluation({
    ruleId: "ewb_without_invoice_or_book_entry",
    evaluatedAtUtc: input.evaluatedAtUtc,
    kind: "exception",
    comparedValues: compared,
    sourceCoverage: input.observation?.sourceKind ?? "grin",
    explanation: "EWB is recorded without an invoice or book entry. Review; ITC stays not determined.",
  });
}

/**
 * Whether an invoice "requires" an EWB is a recorded assertion.
 * This rule does not apply a rupee threshold or live portal lookup.
 */
export function invoiceRequiresEwbNoneLinked(input: {
  evaluatedAtUtc: string;
  invoiceLinked: boolean;
  ewbLinked: boolean;
  ewbApplicability: EwbApplicabilityAssertion;
  observation?: SourcedObservation;
}): ExceptionEvaluation {
  const compared = {
    ...observationFields(input.observation),
    invoiceLinked: input.invoiceLinked,
    ewbLinked: input.ewbLinked,
    ewbApplicability: input.ewbApplicability,
  };
  if (!input.invoiceLinked) {
    return evaluation({
      ruleId: "invoice_requires_ewb_none_linked",
      evaluatedAtUtc: input.evaluatedAtUtc,
      kind: "not_applicable",
      comparedValues: compared,
      sourceCoverage: input.observation?.sourceKind ?? "grin",
      explanation: "No invoice is linked, so EWB pairing for an invoice does not apply.",
    });
  }
  if (input.ewbApplicability === "unknown" || !hasUsableSource(input.observation)) {
    return incompleteSource(
      "invoice_requires_ewb_none_linked",
      input.evaluatedAtUtc,
      input.observation,
      compared,
      "EWB applicability was not asserted. This programme does not invent a GST threshold."
    );
  }
  if (input.ewbApplicability === "not_applicable") {
    return evaluation({
      ruleId: "invoice_requires_ewb_none_linked",
      evaluatedAtUtc: input.evaluatedAtUtc,
      kind: "not_applicable",
      comparedValues: compared,
      sourceCoverage: input.observation?.sourceKind ?? "grin",
      explanation: "Recorded assertion: EWB is not applicable for this invoice.",
    });
  }
  if (input.ewbLinked) {
    return evaluation({
      ruleId: "invoice_requires_ewb_none_linked",
      evaluatedAtUtc: input.evaluatedAtUtc,
      kind: "clear",
      comparedValues: compared,
      sourceCoverage: input.observation?.sourceKind ?? "grin",
      explanation: "Invoice has a linked EWB as asserted required.",
    });
  }
  return evaluation({
    ruleId: "invoice_requires_ewb_none_linked",
    evaluatedAtUtc: input.evaluatedAtUtc,
    kind: "exception",
    comparedValues: compared,
    sourceCoverage: input.observation?.sourceKind ?? "grin",
    explanation: "Invoice was asserted to require an EWB, and none is linked. Review; ITC stays not determined.",
  });
}

export function inwardEwbWithoutGrin(input: {
  evaluatedAtUtc: string;
  inwardEwbPresent: boolean;
  grinPresent: boolean;
  observation?: SourcedObservation;
}): ExceptionEvaluation {
  const compared = {
    ...observationFields(input.observation),
    inwardEwbPresent: input.inwardEwbPresent,
    grinPresent: input.grinPresent,
  };
  if (!input.inwardEwbPresent) {
    return evaluation({
      ruleId: "inward_ewb_without_grin",
      evaluatedAtUtc: input.evaluatedAtUtc,
      kind: "not_applicable",
      comparedValues: compared,
      sourceCoverage: input.observation?.sourceKind ?? "ewb",
      explanation: "No inward EWB is recorded.",
    });
  }
  if (!hasUsableSource(input.observation)) {
    return incompleteSource(
      "inward_ewb_without_grin",
      input.evaluatedAtUtc,
      input.observation,
      compared,
      "Inward EWB versus GRIN cannot be judged from an incomplete source."
    );
  }
  if (input.grinPresent) {
    return evaluation({
      ruleId: "inward_ewb_without_grin",
      evaluatedAtUtc: input.evaluatedAtUtc,
      kind: "clear",
      comparedValues: compared,
      sourceCoverage: input.observation?.sourceKind ?? "ewb",
      explanation: "Inward EWB has a linked GRIN.",
    });
  }
  return evaluation({
    ruleId: "inward_ewb_without_grin",
    evaluatedAtUtc: input.evaluatedAtUtc,
    kind: "exception",
    comparedValues: compared,
    sourceCoverage: input.observation?.sourceKind ?? "ewb",
    explanation: "Inward EWB has no GRIN. Review missing receipt capture; ITC stays not determined.",
  });
}

export function cancelledEwbLacksReasonOrReplacement(input: {
  evaluatedAtUtc: string;
  ewbCancelled: boolean;
  cancellationEvidence: unknown;
  observation?: SourcedObservation;
}): ExceptionEvaluation {
  const evidenceErr = input.ewbCancelled ? cancellationEvidenceError(input.cancellationEvidence) : null;
  const compared = {
    ...observationFields(input.observation),
    ewbCancelled: input.ewbCancelled,
    cancellationEvidenceError: evidenceErr,
  };
  if (!input.ewbCancelled) {
    return evaluation({
      ruleId: "cancelled_ewb_lacks_reason_or_replacement",
      evaluatedAtUtc: input.evaluatedAtUtc,
      kind: "not_applicable",
      comparedValues: compared,
      sourceCoverage: input.observation?.sourceKind ?? "ewb",
      explanation: "No cancelled EWB observation is recorded.",
    });
  }
  if (!hasUsableSource(input.observation)) {
    return incompleteSource(
      "cancelled_ewb_lacks_reason_or_replacement",
      input.evaluatedAtUtc,
      input.observation,
      compared,
      "Cancelled-EWB details cannot be judged from an incomplete source."
    );
  }
  if (evidenceErr) {
    return evaluation({
      ruleId: "cancelled_ewb_lacks_reason_or_replacement",
      evaluatedAtUtc: input.evaluatedAtUtc,
      kind: "exception",
      comparedValues: compared,
      sourceCoverage: input.observation?.sourceKind ?? "ewb",
      explanation:
        "Cancelled EWB is missing required details (reason, goods-moved, linked document, party, amount, or replacement). Unknown goods-moved must stay unknown with a reason.",
    });
  }
  return evaluation({
    ruleId: "cancelled_ewb_lacks_reason_or_replacement",
    evaluatedAtUtc: input.evaluatedAtUtc,
    kind: "clear",
    comparedValues: compared,
    sourceCoverage: input.observation?.sourceKind ?? "ewb",
    explanation: "Cancelled EWB observation includes reason, goods-moved, linked document, party, amount, and replacement status.",
  });
}

export function amountOrPartyMismatch(input: {
  evaluatedAtUtc: string;
  partyMatch: boolean | "unknown";
  amountMatch: boolean | "unknown";
  grinParty?: string | null;
  otherParty?: string | null;
  grinAmountMinor?: number | null;
  otherAmountMinor?: number | null;
  observation?: SourcedObservation;
}): ExceptionEvaluation {
  const compared = {
    ...observationFields(input.observation),
    partyMatch: input.partyMatch,
    amountMatch: input.amountMatch,
    grinParty: input.grinParty ?? null,
    otherParty: input.otherParty ?? null,
    grinAmountMinor: input.grinAmountMinor ?? null,
    otherAmountMinor: input.otherAmountMinor ?? null,
  };
  if (input.partyMatch === "unknown" || input.amountMatch === "unknown" || !hasUsableSource(input.observation)) {
    return incompleteSource(
      "amount_or_party_mismatch",
      input.evaluatedAtUtc,
      input.observation,
      compared,
      "Party or amount comparison is incomplete. Unknown stays unknown; ITC stays not determined."
    );
  }
  if (input.partyMatch && input.amountMatch) {
    return evaluation({
      ruleId: "amount_or_party_mismatch",
      evaluatedAtUtc: input.evaluatedAtUtc,
      kind: "clear",
      comparedValues: compared,
      sourceCoverage: input.observation?.sourceKind ?? "manual_assertion",
      explanation: "Recorded party and amount observations match.",
    });
  }
  return evaluation({
    ruleId: "amount_or_party_mismatch",
    evaluatedAtUtc: input.evaluatedAtUtc,
    kind: "exception",
    comparedValues: compared,
    sourceCoverage: input.observation?.sourceKind ?? "manual_assertion",
    explanation: "Recorded party or amount observations differ. Review; this is not an ITC determination.",
  });
}

export function grinOrInvoiceMissingFrom2b(input: {
  evaluatedAtUtc: string;
  isGstReportedGoodsPurchase: boolean;
  grinOrInvoicePresent: boolean;
  appearsIn2b: boolean | "unknown";
  importCoverage: ImportCoverage;
  observation?: SourcedObservation;
}): ExceptionEvaluation {
  const compared = {
    ...observationFields(input.observation),
    isGstReportedGoodsPurchase: input.isGstReportedGoodsPurchase,
    grinOrInvoicePresent: input.grinOrInvoicePresent,
    appearsIn2b: input.appearsIn2b,
    importCoverage: input.importCoverage,
  };
  if (!input.isGstReportedGoodsPurchase) {
    return evaluation({
      ruleId: "grin_or_invoice_missing_from_2b",
      evaluatedAtUtc: input.evaluatedAtUtc,
      kind: "not_applicable",
      comparedValues: compared,
      sourceCoverage: input.importCoverage,
      explanation: "Rule applies only to GST-reported goods purchases.",
    });
  }
  if (!input.grinOrInvoicePresent) {
    return evaluation({
      ruleId: "grin_or_invoice_missing_from_2b",
      evaluatedAtUtc: input.evaluatedAtUtc,
      kind: "not_applicable",
      comparedValues: compared,
      sourceCoverage: input.importCoverage,
      explanation: "No GRIN or invoice is on file to compare with 2B.",
    });
  }
  if (input.importCoverage !== "full" || input.appearsIn2b === "unknown" || !hasUsableSource(input.observation)) {
    return incompleteSource(
      "grin_or_invoice_missing_from_2b",
      input.evaluatedAtUtc,
      input.observation,
      compared,
      "2B presence cannot be judged from a partial import or unknown observation. This is not a live GSTR-2B feed."
    );
  }
  if (input.appearsIn2b) {
    return evaluation({
      ruleId: "grin_or_invoice_missing_from_2b",
      evaluatedAtUtc: input.evaluatedAtUtc,
      kind: "clear",
      comparedValues: compared,
      sourceCoverage: input.importCoverage,
      explanation: "Recorded 2B observation includes this GRIN or invoice.",
    });
  }
  return evaluation({
    ruleId: "grin_or_invoice_missing_from_2b",
    evaluatedAtUtc: input.evaluatedAtUtc,
    kind: "exception",
    comparedValues: compared,
    sourceCoverage: input.importCoverage,
    explanation: "GRIN or invoice is absent from the recorded 2B observation. Review; do not auto-reject ITC.",
  });
}

export function supplierLaterSuspendedOrCancelled(input: {
  evaluatedAtUtc: string;
  status: SupplierStatusObservation;
  observation?: SourcedObservation;
}): ExceptionEvaluation {
  const compared = {
    ...observationFields(input.observation),
    status: input.status,
  };
  if (input.status === "unknown" || !hasUsableSource(input.observation)) {
    return incompleteSource(
      "supplier_later_suspended_or_cancelled",
      input.evaluatedAtUtc,
      input.observation,
      compared,
      "Supplier GST status is unknown. This is a recorded observation, not a live GST portal lookup."
    );
  }
  if (input.status === "active") {
    return evaluation({
      ruleId: "supplier_later_suspended_or_cancelled",
      evaluatedAtUtc: input.evaluatedAtUtc,
      kind: "clear",
      comparedValues: compared,
      sourceCoverage: input.observation?.sourceKind ?? "manual_assertion",
      explanation: "Recorded supplier-status observation is active at the observation time.",
    });
  }
  return evaluation({
    ruleId: "supplier_later_suspended_or_cancelled",
    evaluatedAtUtc: input.evaluatedAtUtc,
    kind: "exception",
    comparedValues: compared,
    sourceCoverage: input.observation?.sourceKind ?? "manual_assertion",
    explanation:
      "Recorded observation: supplier was later suspended or cancelled. Capture the source and time; do not treat this as a live GST determination of ITC.",
  });
}

export function returnWithoutReturnEwbOrCreditNote(input: {
  evaluatedAtUtc: string;
  returnRecorded: boolean;
  returnEwbPresent: boolean;
  creditNotePresent: boolean;
  returnDocumentCoverage: ImportCoverage;
  observation?: SourcedObservation;
}): ExceptionEvaluation {
  const compared = {
    ...observationFields(input.observation),
    returnRecorded: input.returnRecorded,
    returnEwbPresent: input.returnEwbPresent,
    creditNotePresent: input.creditNotePresent,
    returnDocumentCoverage: input.returnDocumentCoverage,
  };
  if (!input.returnRecorded) {
    return evaluation({
      ruleId: "return_without_return_ewb_or_credit_note",
      evaluatedAtUtc: input.evaluatedAtUtc,
      kind: "not_applicable",
      comparedValues: compared,
      sourceCoverage: input.returnDocumentCoverage,
      explanation: "No return is recorded.",
    });
  }
  if (input.returnDocumentCoverage !== "full" || !hasUsableSource(input.observation)) {
    return incompleteSource(
      "return_without_return_ewb_or_credit_note",
      input.evaluatedAtUtc,
      input.observation,
      compared,
      "Return-document coverage is incomplete. Missing return EWB or credit note cannot be proven from a partial source."
    );
  }
  if (input.returnEwbPresent || input.creditNotePresent) {
    return evaluation({
      ruleId: "return_without_return_ewb_or_credit_note",
      evaluatedAtUtc: input.evaluatedAtUtc,
      kind: "clear",
      comparedValues: compared,
      sourceCoverage: input.returnDocumentCoverage,
      explanation: "Return has a recorded return EWB or credit note.",
    });
  }
  return evaluation({
    ruleId: "return_without_return_ewb_or_credit_note",
    evaluatedAtUtc: input.evaluatedAtUtc,
    kind: "exception",
    comparedValues: compared,
    sourceCoverage: input.returnDocumentCoverage,
    explanation: "Return is recorded without a return EWB or credit note. Review the document gap; ITC stays not determined.",
  });
}

export interface GrinExceptionBundle {
  evaluatedAtUtc: string;
  observation?: SourcedObservation;
  ewbPresent: boolean;
  invoiceLinked: boolean;
  bookEntryPresent: boolean;
  ewbApplicability: EwbApplicabilityAssertion;
  ewbLinked: boolean;
  inwardEwbPresent: boolean;
  grinPresent: boolean;
  challanLinked: boolean;
  ewbCancelled: boolean;
  cancellationEvidence: unknown;
  partyMatch: boolean | "unknown";
  amountMatch: boolean | "unknown";
  grinParty?: string | null;
  otherParty?: string | null;
  grinAmountMinor?: number | null;
  otherAmountMinor?: number | null;
  isGoodsPurchase: boolean;
  isServiceOrIsd: boolean;
  hasDirectDeliveryEvidence: boolean;
  importCoverage: ImportCoverage;
  appearsIn2b: boolean | "unknown";
  isGstReportedGoodsPurchase: boolean;
  grinOrInvoicePresent: boolean;
  supplierStatus: SupplierStatusObservation;
  returnRecorded: boolean;
  returnEwbPresent: boolean;
  creditNotePresent: boolean;
  returnDocumentCoverage: ImportCoverage;
}

/** Runs every published exception rule. ITC disposition remains not_determined. */
export function evaluateAllExceptionRules(bundle: GrinExceptionBundle): ExceptionEvaluation[] {
  const observation = bundle.observation;
  const at = bundle.evaluatedAtUtc;
  return [
    ewbWithoutInvoiceOrBookEntry({
      evaluatedAtUtc: at,
      ewbPresent: bundle.ewbPresent,
      invoiceLinked: bundle.invoiceLinked,
      bookEntryPresent: bundle.bookEntryPresent,
      observation,
    }),
    invoiceRequiresEwbNoneLinked({
      evaluatedAtUtc: at,
      invoiceLinked: bundle.invoiceLinked,
      ewbLinked: bundle.ewbLinked,
      ewbApplicability: bundle.ewbApplicability,
      observation,
    }),
    inwardEwbWithoutGrin({
      evaluatedAtUtc: at,
      inwardEwbPresent: bundle.inwardEwbPresent,
      grinPresent: bundle.grinPresent,
      observation,
    }),
    grinWithoutInvoice({
      evaluatedAtUtc: at,
      invoiceLinked: bundle.invoiceLinked,
      challanLinked: bundle.challanLinked,
      observation,
    }),
    cancelledEwbLacksReasonOrReplacement({
      evaluatedAtUtc: at,
      ewbCancelled: bundle.ewbCancelled,
      cancellationEvidence: bundle.cancellationEvidence,
      observation,
    }),
    amountOrPartyMismatch({
      evaluatedAtUtc: at,
      partyMatch: bundle.partyMatch,
      amountMatch: bundle.amountMatch,
      grinParty: bundle.grinParty,
      otherParty: bundle.otherParty,
      grinAmountMinor: bundle.grinAmountMinor,
      otherAmountMinor: bundle.otherAmountMinor,
      observation,
    }),
    gstr2bPurchaseWithoutGrin({
      evaluatedAtUtc: at,
      isGoodsPurchase: bundle.isGoodsPurchase,
      isServiceOrIsd: bundle.isServiceOrIsd,
      hasDirectDeliveryEvidence: bundle.hasDirectDeliveryEvidence,
      importCoverage: bundle.importCoverage,
      grinPresent: bundle.grinPresent,
      observation,
    }),
    grinOrInvoiceMissingFrom2b({
      evaluatedAtUtc: at,
      isGstReportedGoodsPurchase: bundle.isGstReportedGoodsPurchase,
      grinOrInvoicePresent: bundle.grinOrInvoicePresent,
      appearsIn2b: bundle.appearsIn2b,
      importCoverage: bundle.importCoverage,
      observation,
    }),
    supplierLaterSuspendedOrCancelled({
      evaluatedAtUtc: at,
      status: bundle.supplierStatus,
      observation,
    }),
    returnWithoutReturnEwbOrCreditNote({
      evaluatedAtUtc: at,
      returnRecorded: bundle.returnRecorded,
      returnEwbPresent: bundle.returnEwbPresent,
      creditNotePresent: bundle.creditNotePresent,
      returnDocumentCoverage: bundle.returnDocumentCoverage,
      observation,
    }),
  ];
}

export function isItcDetermined(evaluationResult: ExceptionEvaluation): boolean {
  return evaluationResult.itcDisposition !== "not_determined";
}
