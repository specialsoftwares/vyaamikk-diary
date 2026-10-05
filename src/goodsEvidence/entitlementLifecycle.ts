/**
 * Subscription-expiry access for GRIN cloud issuance and uploads.
 *
 * Injected clock (`nowMs`). No Cloud Scheduler. No production purge job.
 * Active entitled accounts are never age-purged here.
 *
 * After entitlement genuinely expires: stop new paid issuance/uploads;
 * 90 days read/download/export; then 30-day final notice; then
 * `expired_purge_eligible` in SOURCE only (coordinator must not wire a
 * live purge scheduler from this module).
 */

export const GRIN_EXPIRED_READ_EXPORT_MS = 90 * 24 * 60 * 60 * 1000;
export const GRIN_EXPIRED_FINAL_NOTICE_MS = 30 * 24 * 60 * 60 * 1000;

export type GrinAccessPhase =
  | "entitled_or_free"
  | "expired_read_export"
  | "expired_final_notice"
  | "expired_purge_eligible";

const GENUINE_EXPIRY_REASONS = new Set([
  "subscriptionExpired",
  "trialExpired",
  "onHoldAccessRevoked",
]);

function positiveMillis(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Instant the paid/trial entitlement actually ended.
 * `neverSubscribed` / missing status is free-tier, not expiry.
 */
export function genuineExpiryAtMs(status: Record<string, unknown> | undefined): number | null {
  if (status == null) return null;
  if (status.entitlementActive === true) return null;
  const reason = status.entitlementReason;
  if (reason === "neverSubscribed" || reason == null) {
    const periodEnd = positiveMillis(status.currentPeriodEnd);
    const trialEnd = positiveMillis(status.trialEndsAt);
    if (periodEnd == null && trialEnd == null) return null;
  }
  const periodEnd = positiveMillis(status.currentPeriodEnd);
  const trialEnd = positiveMillis(status.trialEndsAt);
  const candidates = [periodEnd, trialEnd].filter((n): n is number => n != null);
  if (candidates.length > 0) return Math.min(...candidates);
  if (typeof reason === "string" && GENUINE_EXPIRY_REASONS.has(reason)) {
    return positiveMillis(status.updatedAt);
  }
  return null;
}

export function grinAccessPhase(
  status: Record<string, unknown> | undefined,
  nowMs: number
): GrinAccessPhase {
  if (status?.entitlementActive === true) return "entitled_or_free";
  const expiredAt = genuineExpiryAtMs(status);
  if (expiredAt == null) return "entitled_or_free";
  if (nowMs < expiredAt) return "entitled_or_free";
  const elapsed = nowMs - expiredAt;
  if (elapsed < GRIN_EXPIRED_READ_EXPORT_MS) return "expired_read_export";
  if (elapsed < GRIN_EXPIRED_READ_EXPORT_MS + GRIN_EXPIRED_FINAL_NOTICE_MS) {
    return "expired_final_notice";
  }
  return "expired_purge_eligible";
}

/** First issuance and new cloud uploads. Replays of committed commands are not new issuance. */
export function mayIssueOrUploadGrinCloud(phase: GrinAccessPhase): boolean {
  return phase === "entitled_or_free";
}

/**
 * View / download / export until a subsequent purge job (not wired here).
 * Final-notice and purge-eligible still allow read in SOURCE.
 */
export function mayReadDownloadExportGrin(phase: GrinAccessPhase): boolean {
  void phase;
  return true;
}
