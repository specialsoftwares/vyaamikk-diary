/**
 * Narrow default-off gate for ordinary-quota UpgradeSheet presentation.
 *
 * Independent of server `quotaEnforcementEnabled`. Must stay off unless the
 * build explicitly bundles EXPO_PUBLIC_QUOTA_UPSELL_ENABLED=1.
 * Metro only inlines static `process.env.EXPO_PUBLIC_*` dot access.
 */

let _testOverride: boolean | null = null;

export function isQuotaUpsellEnabled(): boolean {
  if (_testOverride != null) return _testOverride;
  return process.env.EXPO_PUBLIC_QUOTA_UPSELL_ENABLED === "1";
}

/** Test-only. Pass null to restore process env. */
export function __setQuotaUpsellEnabledForTests(value: boolean | null): void {
  _testOverride = value;
}
