/**
 * Fail-closed monthly record cap — mirrors firestore.rules `monthlyRecordCap`.
 *
 * This is used by the Option-C create transaction to detect quota exhaustion
 * from authoritative status+usage reads. Rules remain the enforcement boundary.
 *
 * Only exact strings `starter` (100), `professional` and `business` (unlimited)
 * are recognized, and only while `entitlementActive === true`. Everything else
 * — free, missing, malformed (`proffesional`), unknown (`enterprise`), or
 * inactive entitlement — gets 25.
 */

export const UNLIMITED_MONTHLY_RECORD_CAP = -1;
export const FREE_MONTHLY_RECORD_CAP = 25;
export const STARTER_MONTHLY_RECORD_CAP = 100;

/**
 * Cap for a live `subscription/status` snapshot.
 * `statusData` is the raw Firestore document (not a UX-parsed entitlement).
 */
export function monthlyRecordCapFromStatusData(
  statusData: Record<string, unknown>
): number {
  const entitled = statusData.entitlementActive === true;
  const plan = entitled ? statusData.plan : "free";
  if (plan === "starter") return STARTER_MONTHLY_RECORD_CAP;
  if (plan === "professional" || plan === "business") {
    return UNLIMITED_MONTHLY_RECORD_CAP;
  }
  return FREE_MONTHLY_RECORD_CAP;
}

export function quotaEnforcementEnabledFromStatusData(
  statusData: Record<string, unknown> | undefined
): boolean {
  return statusData?.quotaEnforcementEnabled === true;
}
