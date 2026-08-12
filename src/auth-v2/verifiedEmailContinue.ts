/**
 * Email Entry Continue — verified re-entry vs first-time verification.
 * User Continue must never no-op because a review-intent flag is set.
 */

import { sameEmailAddress } from "@/auth/onboardingWizard";

export type VerifiedEmailContinueAction =
  | "proceed_without_otp"
  | "send_verification"
  | "invalid";

export function resolveVerifiedEmailContinueAction(args: {
  draftEmail: string;
  verifiedEmail: string;
  emailAuthoritativelyVerified: boolean;
}): VerifiedEmailContinueAction {
  const draft = args.draftEmail.trim().toLowerCase();
  if (!draft || !draft.includes("@")) return "invalid";
  if (
    args.emailAuthoritativelyVerified &&
    sameEmailAddress(draft, args.verifiedEmail)
  ) {
    return "proceed_without_otp";
  }
  return "send_verification";
}

/**
 * Hydration/boot may suppress auto-advance during review.
 * A user tapping Continue is never suppressed by review intent.
 */
export function shouldHonorReviewIntentSuppression(args: {
  userInitiatedContinue: boolean;
  reviewIntentActive: boolean;
}): boolean {
  if (args.userInitiatedContinue) return false;
  return args.reviewIntentActive;
}
