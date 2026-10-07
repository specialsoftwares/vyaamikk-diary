/**
 * Attachment category allowlist for screens/repository.
 * Same declared set as Team 2 `UPLOAD_ORIGINAL_CATEGORIES` / Wave-1 checkers.
 * Category is an assertion, not GSTR-2B, payment, or supplier-status proof.
 */

import {
  WAVE1_ORIGINAL_CATEGORIES,
  isEvidenceCategory,
  isWave1OriginalCategory,
  type Wave1OriginalCategory,
} from "@/goodsEvidence/evidence";

export const GRIN_ATTACH_CATEGORIES = WAVE1_ORIGINAL_CATEGORIES;
export type GrinAttachCategory = Wave1OriginalCategory;
export { isEvidenceCategory };
export const isGrinAttachCategory = isWave1OriginalCategory;
