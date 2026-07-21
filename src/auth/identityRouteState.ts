/**
 * Authoritative post-login identity route state.
 * Pure decision — no I/O. Boot / auth screens must route from this only.
 */

import type { UserProfile } from "@/domain/types";
import { isLoginBlockedAccount } from "@/services/accountDeletion/accountStatus";

export type IdentityRouteState =
  | "unauthenticated"
  | "phoneAuthenticatedEmailMissing"
  | "emailPendingVerification"
  | "emailVerificationLocked"
  | "emailVerifiedOnboardingIncomplete"
  | "fullyReady"
  | "accountDisabled"
  | "recoveryPending"
  | "recoveryCoolingOff";

export interface IdentityRouteInput {
  signedIn: boolean;
  user: UserProfile | null;
  /** Epoch ms — injected for tests. */
  now?: number;
  /**
   * When true, profile onboarding gates (complete-profile / UEID / intro /
   * location) are still incomplete. Computed by the boot layer.
   */
  onboardingIncomplete?: boolean;
}

export function hasAuthoritativeVerifiedEmail(user: UserProfile | null | undefined): boolean {
  if (!user) return false;
  const email = (user.normalizedEmail ?? user.businessEmail ?? "").trim();
  if (!email || !email.includes("@")) return false;
  if (user.emailStatus !== "verified") return false;
  if (user.emailVerifiedAt == null || user.emailVerifiedAt <= 0) return false;
  return true;
}

export function resolveIdentityRouteState(input: IdentityRouteInput): IdentityRouteState {
  const now = input.now ?? Date.now();

  if (!input.signedIn || !input.user) {
    return "unauthenticated";
  }

  const user = input.user;

  if (isLoginBlockedAccount(user)) {
    return "accountDisabled";
  }

  if (user.recoveryPending === true) {
    return "recoveryPending";
  }

  if (!hasAuthoritativeVerifiedEmail(user)) {
    if (
      user.emailVerificationLockUntil != null &&
      user.emailVerificationLockUntil > now &&
      (user.emailStatus === "verification_pending" || Boolean(user.normalizedEmail || user.businessEmail))
    ) {
      return "emailVerificationLocked";
    }
    if (user.emailStatus === "verification_pending" && (user.normalizedEmail || user.businessEmail)) {
      return "emailPendingVerification";
    }
    return "phoneAuthenticatedEmailMissing";
  }

  if (
    user.coolingOffUntil != null &&
    user.coolingOffUntil > now
  ) {
    // Cooling-off users with verified email may use the app (ordinary paths)
    // but high-risk actions are blocked separately. Route state still notes it.
    if (input.onboardingIncomplete) {
      return "emailVerifiedOnboardingIncomplete";
    }
    return "recoveryCoolingOff";
  }

  if (input.onboardingIncomplete) {
    return "emailVerifiedOnboardingIncomplete";
  }

  return "fullyReady";
}

/** True when the authenticated user may enter the main app shell / dashboard. */
export function canAccessDashboard(state: IdentityRouteState): boolean {
  return state === "fullyReady" || state === "recoveryCoolingOff";
}

/** Href for the identity gate (not onboarding). */
export function hrefForIdentityRouteState(state: IdentityRouteState): string | null {
  switch (state) {
    case "unauthenticated":
      return "/(auth)/v2";
    case "accountDisabled":
      return "/(auth)/account-pending-deletion";
    case "phoneAuthenticatedEmailMissing":
    case "emailPendingVerification":
    case "emailVerificationLocked":
      return "/(auth)/v2?step=email";
    case "recoveryPending":
      return "/(auth)/account-recovery";
    case "emailVerifiedOnboardingIncomplete":
      return null; // boot onboarding resolver continues
    case "fullyReady":
    case "recoveryCoolingOff":
      return null;
    default:
      return "/(auth)/v2";
  }
}
