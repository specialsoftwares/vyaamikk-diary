/**
 * GRIN → insights projection adapter (read-model only).
 *
 * Counts an issued GRIN once from confirmed issuance identity.
 * Does not treat returns, QC, amendments, evidence, or draft/queued local
 * states as a new issuance. Does not fabricate diary `material_received` rows.
 *
 * Legacy `recordMovementFromEntry` extractors remain authoritative for
 * historical basic goods-received diary entries.
 */

import type { GrinApplicationListItem } from "@/services/grin/repository/types";

export type GrinInsightMovementFact = {
  sourceKind: "grin_receipt";
  receiptId: string;
  /** Issued display number when server-assigned; null while pending. */
  issuedNumber: string | null;
  supplierName: string | null;
  /** Only confirmed/issued projections contribute to issuance-style counts. */
  countsAsIssuance: boolean;
};

export function grinListItemToInsightFact(
  item: GrinApplicationListItem
): GrinInsightMovementFact {
  const issued =
    item.localState === "issued" &&
    item.projection === "readable" &&
    item.displayNumber != null &&
    item.displayNumber.trim().length > 0;
  return {
    sourceKind: "grin_receipt",
    receiptId: item.receiptId,
    issuedNumber: item.displayNumber,
    supplierName: item.supplierName,
    countsAsIssuance: issued,
  };
}

export function countGrinIssuances(items: GrinApplicationListItem[]): number {
  return items.reduce((n, item) => n + (grinListItemToInsightFact(item).countsAsIssuance ? 1 : 0), 0);
}
