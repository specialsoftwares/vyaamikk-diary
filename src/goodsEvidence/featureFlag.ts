/**
 * Default-off admission for the Goods Receipt & GST Evidence module.
 * Metro only inlines static process.env.EXPO_PUBLIC_* dot access.
 *
 * Production admission (`isGoodsEvidenceEnabled`) has no test override.
 * Store/standalone Play binaries stay off unless this Internal-GRIN build
 * sets EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT to exactly "1" *and*
 * EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED to exactly "1". Neither flag is backend
 * admission. No installer or Play-track API is read.
 * Runtime signal: `RuntimeSignals.isDev === false` (and `appOwnership` is not
 * `"expo"`) → `detectRuntimeKind` is `store-or-standalone`.
 *
 * Domain-test admission is a separate constructor flag on InMemoryGoodsLedger
 * (`simulated-domain-test`). It must not be reachable from this function.
 */

import { env } from "@/config/env";

/** True on Play-installed / release APK-AAB runtimes. */
export function isGoodsEvidenceBlockedByStoreRuntime(): boolean {
  if (process.env.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT === "1") {
    return false;
  }
  return env.runtimeKind === "store-or-standalone";
}

/**
 * Production admission only. Cannot be overridden by tests.
 * Domain fixtures must use InMemoryGoodsLedger simulated admission instead.
 */
export function isGoodsEvidenceEnabled(): boolean {
  if (isGoodsEvidenceBlockedByStoreRuntime()) return false;
  return process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED === "1";
}
