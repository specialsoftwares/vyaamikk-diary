/**
 * Findings are investigation prompts. They never grant or deny ITC.
 * Official GSTR-2B guidance requires reconciliation with books and
 * recognises eligibility conditions beyond the statement itself.
 */

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

export function gstr2bPurchaseWithoutGrin(input: {
  evaluatedAtUtc: string;
  isGoodsPurchase: boolean;
  isServiceOrIsd: boolean;
  hasDirectDeliveryEvidence: boolean;
  importCoverage: "full" | "partial" | "none";
  grinPresent: boolean;
}): ExceptionEvaluation {
  if (input.isServiceOrIsd) {
    return evaluation({
      ruleId: "gstr2b_purchase_without_grin",
      evaluatedAtUtc: input.evaluatedAtUtc,
      kind: "not_applicable",
      comparedValues: { isServiceOrIsd: true },
      sourceCoverage: input.importCoverage,
      explanation: "Services/ISD do not require a warehouse GRIN.",
    });
  }
  if (!input.isGoodsPurchase) {
    return evaluation({
      ruleId: "gstr2b_purchase_without_grin",
      evaluatedAtUtc: input.evaluatedAtUtc,
      kind: "not_applicable",
      comparedValues: { isGoodsPurchase: false },
      sourceCoverage: input.importCoverage,
      explanation: "Rule applies only to relevant goods purchases.",
    });
  }
  if (input.importCoverage !== "full") {
    return evaluation({
      ruleId: "gstr2b_purchase_without_grin",
      evaluatedAtUtc: input.evaluatedAtUtc,
      kind: "unknown_incomplete_source",
      comparedValues: { grinPresent: input.grinPresent },
      sourceCoverage: input.importCoverage,
      explanation: "Absence from a partial import is not proof of absence.",
    });
  }
  if (input.hasDirectDeliveryEvidence) {
    return evaluation({
      ruleId: "gstr2b_purchase_without_grin",
      evaluatedAtUtc: input.evaluatedAtUtc,
      kind: "not_applicable",
      comparedValues: { hasDirectDeliveryEvidence: true },
      sourceCoverage: input.importCoverage,
      explanation: "Direct-delivery models need alternate receipt evidence, not a fictitious warehouse GRIN.",
    });
  }
  if (input.grinPresent) {
    return evaluation({
      ruleId: "gstr2b_purchase_without_grin",
      evaluatedAtUtc: input.evaluatedAtUtc,
      kind: "clear",
      comparedValues: { grinPresent: true },
      sourceCoverage: input.importCoverage,
      explanation: "Goods purchase has a linked GRIN.",
    });
  }
  return evaluation({
    ruleId: "gstr2b_purchase_without_grin",
    evaluatedAtUtc: input.evaluatedAtUtc,
    kind: "exception",
    comparedValues: { grinPresent: false },
    sourceCoverage: input.importCoverage,
    explanation: "2B goods purchase has no GRIN. Review; do not auto-reject ITC.",
  });
}

export function grinWithoutInvoice(input: {
  evaluatedAtUtc: string;
  invoiceLinked: boolean;
  challanLinked: boolean;
}): ExceptionEvaluation {
  if (input.invoiceLinked) {
    return evaluation({
      ruleId: "grin_without_invoice",
      evaluatedAtUtc: input.evaluatedAtUtc,
      kind: "clear",
      comparedValues: { invoiceLinked: true },
      sourceCoverage: "grin",
      explanation: "Invoice is linked.",
    });
  }
  return evaluation({
    ruleId: "grin_without_invoice",
    evaluatedAtUtc: input.evaluatedAtUtc,
    kind: "exception",
    comparedValues: { invoiceLinked: false, challanLinked: input.challanLinked },
    sourceCoverage: "grin",
    explanation: input.challanLinked
      ? "Challan delivery remains open until an invoice is supplied. Capture still succeeded."
      : "GRIN has no invoice. Missing-document workflow; capture still succeeded.",
  });
}

export function isItcDetermined(evaluationResult: ExceptionEvaluation): boolean {
  return evaluationResult.itcDisposition !== "not_determined";
}
