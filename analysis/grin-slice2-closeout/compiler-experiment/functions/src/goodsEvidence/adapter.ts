/**
 * Disposable experiment only. Mirrors a Functions adapter importing
 * repository-level src/goodsEvidence via relative path.
 */
import { canonicalJson } from "../../../src/goodsEvidence/canonical";

export function pingCanonical(): string {
  return canonicalJson({ a: 1 });
}
