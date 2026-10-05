/**
 * Records-hub visibility for GRIN. Client flags only — not server admission.
 */
import { isGoodsEvidenceEnabled } from "@/goodsEvidence/featureFlag";

export function shouldShowGrinRecordsHubEntry(): boolean {
  return isGoodsEvidenceEnabled();
}
