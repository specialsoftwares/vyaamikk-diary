/**
 * Legacy / incomplete profile remediation resolver.
 * Never silently destroy existing user data.
 */

import type { UserProfile } from "@/domain/types";
import { hasAuthoritativeVerifiedEmail } from "@/auth/identityRouteState";
import type { Href } from "expo-router";

export type ProfileRemediationOutcome =
  | "fullyCompliant"
  | "emailRemediationRequired"
  | "profileRemediationRequired"
  | "imageLogoRemediationRequired"
  | "pinConfirmationRequired"
  | "identitySnapshotRepairRequired"
  | "accountDataInconsistent";

export function resolveProfileRemediation(
  user: UserProfile | null
): ProfileRemediationOutcome {
  if (!user) return "accountDataInconsistent";
  if (!hasAuthoritativeVerifiedEmail(user)) return "emailRemediationRequired";

  // Legacy weak completion: profileCompletedAt without new mandatory fields.
  const hasV2 =
    user.onboardingProfileVersion === 2 ||
    (Boolean(user.pinCode) &&
      Boolean(user.pinDistrict) &&
      Boolean(user.pinState) &&
      Boolean(user.profileLogo?.localUri) &&
      Boolean(user.issuerIdentitySnapshotId) &&
      Boolean(user.accountKind));

  if (!user.profileCompletedAt) {
    if (!user.displayName?.trim()) return "profileRemediationRequired";
    return "profileRemediationRequired";
  }

  if (!hasV2) {
    if (!user.profileLogo?.localUri) return "imageLogoRemediationRequired";
    if (!user.pinCode || !user.pinDistrict || !user.pinState) {
      return "pinConfirmationRequired";
    }
    if (!user.issuerIdentitySnapshotId) return "identitySnapshotRepairRequired";
    if (!user.accountKind && !user.displayName?.trim()) {
      return "accountDataInconsistent";
    }
    // Completed under legacy rules — require remediation for missing v2 fields.
    return "profileRemediationRequired";
  }

  if (!user.issuerIdentitySnapshotId) return "identitySnapshotRepairRequired";
  if (!user.profileLogo?.localUri) return "imageLogoRemediationRequired";
  if (!user.pinCode || !user.pinDistrict || !user.pinState) {
    return "pinConfirmationRequired";
  }
  return "fullyCompliant";
}

export function hrefForProfileRemediation(
  outcome: ProfileRemediationOutcome
): Href | null {
  switch (outcome) {
    case "fullyCompliant":
      return null;
    case "emailRemediationRequired":
      return { pathname: "/(auth)/v2", params: { step: "email" } };
    case "imageLogoRemediationRequired":
    case "pinConfirmationRequired":
    case "identitySnapshotRepairRequired":
    case "profileRemediationRequired":
    case "accountDataInconsistent":
      return "/(auth)/complete-profile";
    default:
      return "/(auth)/complete-profile";
  }
}

/** True when boot must not flash dashboard before remediation resolves. */
export function requiresPreDashboardRemediation(user: UserProfile | null): boolean {
  const outcome = resolveProfileRemediation(user);
  return outcome !== "fullyCompliant";
}
