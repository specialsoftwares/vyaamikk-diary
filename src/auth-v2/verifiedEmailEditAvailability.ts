/** The client has ordinary email binding, but no phone step-up email-change flow. */
export const VERIFIED_EMAIL_CHANGE_SUPPORT_MESSAGE =
  "Changing a verified email is not available in this version. Contact support for help. Your current email stays linked.";

/** A missing first email may still be verified; an established factor is read-only. */
export function canUseOrdinaryEmailBinding(profile: { emailStatus?: string | null }): boolean {
  return profile.emailStatus !== "verified";
}
