/**
 * Declared counting rules. A type without a row must not be treated as cash.
 */

import type { CoverageDisposition } from "@/services/partyLedger/contracts";

export interface CoverageRule {
  recordType: string;
  disposition: CoverageDisposition;
  explanationKey: string;
  note: string;
}

export const PARTY_LEDGER_COVERAGE: CoverageRule[] = [
  {
    recordType: "business_cash_given",
    disposition: "cash",
    explanationKey: "partyLedger.rules.cashPaid",
    note: "Money out to the named recipient. It does not create a payable or an expense category.",
  },
  {
    recordType: "customer_credit_charge",
    disposition: "obligation",
    explanationKey: "partyLedger.rules.creditCharge",
    note: "Shop receivable from the existing credit summary. Down payment is not also cash received.",
  },
  {
    recordType: "customer_credit_payment",
    disposition: "obligation",
    explanationKey: "partyLedger.rules.creditPayment",
    note: "Reduces the same receivable. A closure payment is not a second collection.",
  },
  {
    recordType: "outward_freight_details",
    disposition: "cash",
    explanationKey: "partyLedger.rules.freightPaid",
    note: "Cash only when freight type is paid and the amount is readable. To Pay is not paid cash.",
  },
  {
    recordType: "payment_request",
    disposition: "activity",
    explanationKey: "partyLedger.rules.paymentRequest",
    note: "A request is not money received and does not add a second debt.",
  },
  {
    recordType: "purchase_order",
    disposition: "activity",
    explanationKey: "partyLedger.rules.purchaseOrder",
    note: "A commitment. Not cash movement.",
  },
  {
    recordType: "goods_receipt",
    disposition: "activity",
    explanationKey: "partyLedger.rules.goodsReceipt",
    note: "Quantity and invoice context. Documentary value is separate from a payable.",
  },
  {
    recordType: "material_dispatched",
    disposition: "activity",
    explanationKey: "partyLedger.rules.materialSent",
    note: "Quantity movement. Not cash.",
  },
  {
    recordType: "material_received",
    disposition: "activity",
    explanationKey: "partyLedger.rules.materialReceived",
    note: "Quantity movement. Not a payable by itself.",
  },
  {
    recordType: "material_return",
    disposition: "activity",
    explanationKey: "partyLedger.rules.materialReturn",
    note: "Quantity movement. Not an automatic refund.",
  },
  {
    recordType: "work_update_issue",
    disposition: "activity",
    explanationKey: "partyLedger.rules.work",
    note: "Work note. Not money.",
  },
  {
    recordType: "staff_matter",
    disposition: "activity",
    explanationKey: "partyLedger.rules.staff",
    note: "Staff note. Not money.",
  },
  {
    recordType: "letterhead_matter",
    disposition: "activity",
    explanationKey: "partyLedger.rules.letter",
    note: "Saved letter activity. Not money.",
  },
  {
    recordType: "letterhead_document",
    disposition: "activity",
    explanationKey: "partyLedger.rules.letter",
    note: "Saved letter document. Not money.",
  },
  {
    recordType: "professional_pack",
    disposition: "activity",
    explanationKey: "partyLedger.rules.brief",
    note: "Stated brief amounts stay documentary. They are not cash paid.",
  },
  {
    recordType: "reminder_purchase",
    disposition: "activity",
    explanationKey: "partyLedger.rules.reminder",
    note: "Reminder. Estimates are not money.",
  },
  {
    recordType: "reminder_email",
    disposition: "activity",
    explanationKey: "partyLedger.rules.reminder",
    note: "Reminder. Not money.",
  },
  {
    recordType: "reminder_gst_return",
    disposition: "activity",
    explanationKey: "partyLedger.rules.gstReminder",
    note: "Statutory reminder. Not a tax liability.",
  },
  {
    recordType: "legacy",
    disposition: "activity",
    explanationKey: "partyLedger.rules.legacy",
    note: "Older note. Not money unless a later explicit mapper says so.",
  },
  {
    recordType: "draft",
    disposition: "excluded",
    explanationKey: "partyLedger.rules.draft",
    note: "Drafts are not confirmed money.",
  },
  {
    recordType: "voided",
    disposition: "excluded",
    explanationKey: "partyLedger.rules.voided",
    note: "Voided or rejected records contribute zero.",
  },
];

const BY_TYPE = new Map(PARTY_LEDGER_COVERAGE.map((rule) => [rule.recordType, rule]));

export function coverageFor(recordType: string): CoverageRule {
  return (
    BY_TYPE.get(recordType) ?? {
      recordType,
      disposition: "excluded",
      explanationKey: "partyLedger.rules.unknown",
      note: "This record type has no ledger rule, so it is left out rather than counted as zero cash.",
    }
  );
}
