import type { UserProfile } from "@/domain/types";
import { isEmailVerificationAvailable } from "./emailVerificationService";

/** True only when email may receive security-sensitive communication. */
export function isEmailTrustedForSecurityComms(user: UserProfile): boolean {
  const email = user.businessEmail?.trim();
  if (!email) return false;
  if (!isEmailVerificationAvailable()) return false;
  return user.emailStatus === "verified";
}
