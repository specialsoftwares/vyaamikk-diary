/**
 * Default-off activation boundary for Settings / management purchase entry.
 *
 * Independent of EXPO_PUBLIC_QUOTA_UPSELL_ENABLED. Backend PLAY_BILLING_ENABLED
 * refusal is not a substitute for this client entry gate. Metro only inlines
 * static process.env.EXPO_PUBLIC_* dot access.
 */

let _testOverride: boolean | null = null;

export function isSubscriptionPurchaseEntryEnabled(): boolean {
  if (_testOverride != null) return _testOverride;
  return process.env.EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED === "1";
}

/** Test-only. Pass null to restore process env. */
export function __setSubscriptionPurchaseEntryEnabledForTests(value: boolean | null): void {
  _testOverride = value;
}
