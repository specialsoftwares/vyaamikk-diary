/**
 * Attachment category allowlist for Team 4 screens/repository.
 * Matches GRIN_INTERFACE_CONTRACT E5: Wave 1 originals plus stock_accounting,
 * payment, gst, return_document. Category is a declared assertion, not proof.
 *
 * Team 2 EvidenceCategory already includes these values. Team 3 outbox still
 * validates Wave1OriginalCategory until the coordinator integrates the T3
 * proposal — extra categories are accepted here and passed through.
 */

import { WAVE1_ORIGINAL_CATEGORIES, type EvidenceCategory } from "@/goodsEvidence/evidence";

export const GRIN_ATTACH_CATEGORIES = [
  ...WAVE1_ORIGINAL_CATEGORIES,
  "stock_accounting",
  "payment",
  "gst",
  "return_document",
] as const satisfies readonly EvidenceCategory[];

export type GrinAttachCategory = (typeof GRIN_ATTACH_CATEGORIES)[number];

const ATTACH_SET = new Set<string>(GRIN_ATTACH_CATEGORIES);

export function isEvidenceCategory(value: unknown): value is EvidenceCategory {
  return typeof value === "string" && ATTACH_SET.has(value);
}

export function isGrinAttachCategory(value: unknown): value is GrinAttachCategory {
  return isEvidenceCategory(value);
}
