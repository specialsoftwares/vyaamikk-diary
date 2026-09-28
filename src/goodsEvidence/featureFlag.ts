/**
 * Default-off admission for the Goods Receipt & GST Evidence module.
 * Metro only inlines static process.env.EXPO_PUBLIC_* dot access.
 * Absence, "0", "true", or any value other than "1" stays off.
 *
 * Store/standalone Play binaries stay off even if the public env is "1".
 * Runtime signal: `RuntimeSignals.isDev === false` (and `appOwnership` is not
 * `"expo"`) → `detectRuntimeKind` is `store-or-standalone`. That is the
 * production-off gate. Not part of the versionCode 22 release candidate.
 */

import { env } from "@/config/env";

let _testOverride: boolean | null = null;

/** True on Play-installed / release APK-AAB runtimes. */
export function isGoodsEvidenceBlockedByStoreRuntime(): boolean {
  return env.runtimeKind === "store-or-standalone";
}

export function isGoodsEvidenceEnabled(): boolean {
  if (_testOverride != null) return _testOverride;
  if (isGoodsEvidenceBlockedByStoreRuntime()) return false;
  return process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED === "1";
}

/** Test-only. Pass null to restore process env and runtime gate. */
export function __setGoodsEvidenceEnabledForTests(value: boolean | null): void {
  _testOverride = value;
}
