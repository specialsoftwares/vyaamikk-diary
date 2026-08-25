/**
 * Normal Back must never move the user behind an authoritative verification
 * checkpoint that has already completed.
 */

export type EmailAuthBackPolicy = "hidden_stay" | "profile_review";

export type AuthSystemBackAction =
  | "allow_os"
  | "stay"
  | "phone_unverified"
  | "email_from_email_otp"
  | "profile_review";

export function isAuthoritativeMobileVerified(input: {
  phoneChallengeProven: boolean;
  signedIn: boolean;
  profilePhoneE164: string | null | undefined;
}): boolean {
  if (input.phoneChallengeProven) return true;
  const phone = typeof input.profilePhoneE164 === "string" ? input.profilePhoneE164.trim() : "";
  return input.signedIn && phone.startsWith("+");
}

export function resolveEmailAuthBackPolicy(input: {
  mobileAuthoritativelyVerified: boolean;
  reviewingFromProfile: boolean;
}): EmailAuthBackPolicy {
  if (input.reviewingFromProfile && input.mobileAuthoritativelyVerified) {
    return "profile_review";
  }
  return "hidden_stay";
}

export function resolveAuthSystemBackAction(input: {
  step: string;
  mobileAuthoritativelyVerified: boolean;
  emailBackPolicy: EmailAuthBackPolicy;
  emailSendBlocked: boolean;
}): AuthSystemBackAction {
  if (input.step === "phone") return "allow_os";
  if (input.step === "confirm") return "phone_unverified";
  if (input.step === "otp") return "phone_unverified";
  if (input.step === "email_verify") {
    if (input.emailSendBlocked) return "stay";
    return "email_from_email_otp";
  }
  if (input.step === "email") {
    if (input.emailBackPolicy === "profile_review") return "profile_review";
    if (input.mobileAuthoritativelyVerified) return "stay";
    return "stay";
  }
  return "stay";
}
