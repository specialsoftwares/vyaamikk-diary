/**
 * Versioned evidence-support policy for pack coverage.
 * Hash integrity is separate from whether nominated sources actually support an item.
 * Snapshot fields are recorded assertions, not independently verified external facts.
 * Labelled original support is simulation metadata, not OCR or live GST lookup.
 */

import type { EvidenceCategory, OriginalEvidence } from "./evidence";
import type { OptionalText } from "./types";
import type { ImmutableGrin } from "./types";

export const EVIDENCE_SUPPORT_POLICY_VERSION = 1 as const;

export const REQUIRED_EVIDENCE_ITEMS = [
  { itemId: "supplier_identity", section: "supplier" },
  { itemId: "commercial_document", section: "commercialDocuments" },
  { itemId: "movement_evidence", section: "movementEvidence" },
  { itemId: "receipt_evidence", section: "receiptEvidence" },
  { itemId: "accounting_payment_evidence", section: "accountingPaymentEvidence" },
  { itemId: "gst_evidence", section: "gstEvidence" },
] as const;

export type EvidenceInventoryItemId = (typeof REQUIRED_EVIDENCE_ITEMS)[number]["itemId"];

/** Policy codes that may mark an item not applicable. Absence of a source is not inapplicability. */
export const NOT_APPLICABLE_POLICY_CODES: Record<EvidenceInventoryItemId, readonly string[]> = {
  supplier_identity: [],
  commercial_document: [],
  movement_evidence: ["receipt_does_not_record_goods_movement"],
  receipt_evidence: [],
  accounting_payment_evidence: ["no_stock_or_payment_event_recorded_for_this_case"],
  gst_evidence: ["not_a_gst_reported_goods_purchase"],
};

export const SNAPSHOT_ELIGIBLE_ITEMS: readonly EvidenceInventoryItemId[] = [
  "supplier_identity",
  "commercial_document",
  "receipt_evidence",
];

const PERMITTED_ORIGINAL_CATEGORIES: Record<EvidenceInventoryItemId, readonly EvidenceCategory[]> = {
  supplier_identity: ["invoice"],
  commercial_document: ["invoice"],
  movement_evidence: ["ewb", "lr_bilty", "vehicle"],
  receipt_evidence: ["unloading", "acknowledgement", "weighment", "qc"],
  accounting_payment_evidence: ["stock_accounting", "payment"],
  gst_evidence: ["gst"],
};

const DEFAULT_ITEM_FOR_CATEGORY: Partial<Record<EvidenceCategory, EvidenceInventoryItemId>> = {
  invoice: "commercial_document",
  ewb: "movement_evidence",
  lr_bilty: "movement_evidence",
  vehicle: "movement_evidence",
  unloading: "receipt_evidence",
  acknowledgement: "receipt_evidence",
  weighment: "receipt_evidence",
  qc: "receipt_evidence",
  stock_accounting: "accounting_payment_evidence",
  payment: "accounting_payment_evidence",
  gst: "gst_evidence",
};

const BLOCKED_NA_REASON = /\bnot[ -]?(implemented|imported|available)\b/i;

function presentText(value: OptionalText | undefined, field: string): string | null {
  if (!value || value.kind !== "present" || typeof value.value !== "string" || !value.value.trim()) {
    return null;
  }
  return field;
}

export function snapshotSupport(
  itemId: EvidenceInventoryItemId,
  snapshot: ImmutableGrin | undefined
): { ok: true; fields: string[] } | { ok: false; detail: string } {
  if (!snapshot) return { ok: false, detail: `${itemId} snapshot is not supplied` };
  if (!SNAPSHOT_ELIGIBLE_ITEMS.includes(itemId)) {
    return { ok: false, detail: `${itemId} cannot be satisfied from a GRIN snapshot` };
  }
  if (itemId === "supplier_identity") {
    const fields = [
      presentText(snapshot.supplier.name, "supplier.name"),
      snapshot.supplier.registration.kind === "registered" && snapshot.supplier.registration.gstin.trim()
        ? "supplier.registration.gstin"
        : null,
    ].filter((field): field is string => field != null);
    if (fields.length === 0) {
      return { ok: false, detail: "supplier_identity snapshot fields are absent or unknown" };
    }
    return { ok: true, fields };
  }
  if (itemId === "commercial_document") {
    const fields = [
      presentText(snapshot.commercial.supplierInvoiceNumber, "commercial.supplierInvoiceNumber"),
      presentText(snapshot.commercial.challanNumber, "commercial.challanNumber"),
    ].filter((field): field is string => field != null);
    if (fields.length === 0) {
      return { ok: false, detail: "commercial_document snapshot has no invoice or challan reference" };
    }
    return { ok: true, fields };
  }
  const receiptFields = [
    typeof snapshot.issuedNumber === "string" && snapshot.issuedNumber.trim() ? "issuedNumber" : null,
    typeof snapshot.reportedArrivalAt === "string" && snapshot.reportedArrivalAt.trim()
      ? "reportedArrivalAt"
      : null,
    presentText(snapshot.warehouse, "warehouse"),
    snapshot.lines.some((line) => line.physicallyReceived) ? "lines.physicallyReceived" : null,
  ].filter((field): field is string => field != null);
  if (receiptFields.length < 4) {
    return { ok: false, detail: "receipt_evidence snapshot is missing issued receipt facts" };
  }
  return { ok: true, fields: receiptFields };
}

export function originalSupportsItem(
  original: OriginalEvidence,
  itemId: EvidenceInventoryItemId
): { ok: true; facts: string[] } | { ok: false; detail: string } {
  const permitted = PERMITTED_ORIGINAL_CATEGORIES[itemId];
  if (!permitted.includes(original.category)) {
    return { ok: false, detail: `${original.evidenceId} category ${original.category} does not support ${itemId}` };
  }
  const labelled = original.labelledSupport;
  if (labelled) {
    if (!Array.isArray(labelled.inventoryItemIds) || !labelled.inventoryItemIds.includes(itemId)) {
      return { ok: false, detail: `${original.evidenceId} labelled support does not include ${itemId}` };
    }
    const facts = Array.isArray(labelled.facts)
      ? labelled.facts.filter((fact) => typeof fact === "string" && fact.trim().length > 0)
      : [];
    if (facts.length === 0) {
      return { ok: false, detail: `${original.evidenceId} labelled support facts are missing` };
    }
    return { ok: true, facts };
  }
  if (DEFAULT_ITEM_FOR_CATEGORY[original.category] !== itemId) {
    return { ok: false, detail: `${original.evidenceId} does not default-support ${itemId}` };
  }
  return { ok: true, facts: [`category:${original.category}`] };
}

export function notApplicableError(
  itemId: EvidenceInventoryItemId,
  policyCode: unknown,
  reason: unknown
): string | null {
  const allowed = NOT_APPLICABLE_POLICY_CODES[itemId];
  if (allowed.length === 0) {
    return `${itemId} cannot be marked not applicable under support policy ${EVIDENCE_SUPPORT_POLICY_VERSION}`;
  }
  if (typeof policyCode !== "string" || !allowed.includes(policyCode)) {
    return `${itemId} not-applicable code is not permitted by support policy`;
  }
  if (typeof reason !== "string" || !reason.trim()) {
    return `${itemId} not-applicable reason is empty`;
  }
  if (BLOCKED_NA_REASON.test(reason)) {
    return `${itemId} reason describes a missing source, not inapplicability`;
  }
  return null;
}
