/** High-risk identity actions blocked during recovery cooling-off. */
import type { UserProfile } from "@/domain/types";

export type HighRiskIdentityAction =
  | "change_email"
  | "change_mobile"
  | "request_account_deletion"
  | "complete_account_deletion"
  | "export_full_account"
  | "bulk_share_all";

export function isInRecoveryCoolingOff(
  user: UserProfile | null | undefined,
  now = Date.now()
): boolean {
  if (!user?.coolingOffUntil) return false;
  return user.coolingOffUntil > now;
}

export function assertNotInCoolingOff(
  user: UserProfile,
  _action: HighRiskIdentityAction,
  now = Date.now()
): void {
  if (isInRecoveryCoolingOff(user, now)) {
    const mins = Math.max(1, Math.ceil((user.coolingOffUntil! - now) / 60_000));
    throw new Error(
      `This action is locked during the 24-hour security cooling-off period (~${mins} min remaining).`
    );
  }
}

export function coolingOffRemainingMs(user: UserProfile, now = Date.now()): number {
  if (!user.coolingOffUntil) return 0;
  return Math.max(0, user.coolingOffUntil - now);
}
