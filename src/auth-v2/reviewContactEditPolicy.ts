/**
 * Signup Review contact-edit policy.
 *
 * Permanent identity invariant:
 * A phone/email is unavailable because it is authoritatively assigned to a
 * Vyaamikk UEID — not merely because it was entered, OTP-verified, or replaced
 * during onboarding.
 *
 * Signup Review permits up to two successfully completed mobile changes and
 * up to two successfully completed email changes before onboarding completion.
 * Counters are independent and increment only after eligible + verified + bound.
 */

export const REVIEW_CONTACT_EDIT_MAX = 2;

export const REVIEW_MOBILE_EDIT_LIMIT_MESSAGE =
  "You can change your mobile number twice during signup review.";

export const REVIEW_EMAIL_EDIT_LIMIT_MESSAGE =
  "You can change your email twice during signup review.";

export const CONTACT_AVAILABILITY_INVARIANT =
  "A phone number or email is unavailable because it is authoritatively assigned to a Vyaamikk UEID — not merely because it was previously entered, OTP-verified, or replaced during onboarding.";

export const REVIEW_EDIT_LIMIT_INVARIANT =
  "Signup Review permits up to two successfully completed mobile changes and up to two successfully completed email changes before onboarding completion.";

export type ReviewContactChannel = "mobile" | "email";

export type ContactAssignmentClass =
  | "unassigned"
  | "assigned_to_current"
  | "assigned_to_other";

export function isOnboardingReviewLifecycle(
  profileCompletedAt: number | null | undefined
): boolean {
  return profileCompletedAt == null || profileCompletedAt === 0;
}

export function normalizeReviewContactCount(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.floor(raw));
}

export function reviewContactEditRemaining(count: unknown): number {
  return Math.max(0, REVIEW_CONTACT_EDIT_MAX - normalizeReviewContactCount(count));
}

export function reviewContactEditAllowed(count: unknown): boolean {
  return reviewContactEditRemaining(count) > 0;
}

export function reviewContactEditLimitMessage(channel: ReviewContactChannel): string {
  return channel === "mobile"
    ? REVIEW_MOBILE_EDIT_LIMIT_MESSAGE
    : REVIEW_EMAIL_EDIT_LIMIT_MESSAGE;
}

export function assertReviewContactEditAllowed(args: {
  channel: ReviewContactChannel;
  count: unknown;
  profileCompletedAt: number | null | undefined;
}): { ok: true } | { ok: false; message: string } {
  if (!isOnboardingReviewLifecycle(args.profileCompletedAt)) {
    return { ok: true };
  }
  if (reviewContactEditAllowed(args.count)) return { ok: true };
  return { ok: false, message: reviewContactEditLimitMessage(args.channel) };
}

/**
 * Increment only after a new contact is entered, server-eligible, OTP-verified,
 * and authoritatively bound. Same-value / failed / cancelled attempts do not count.
 */
export function shouldCountSuccessfulReviewContactReplacement(args: {
  profileCompletedAt: number | null | undefined;
  previousNormalized: string;
  nextNormalized: string;
  bindSucceeded: boolean;
}): boolean {
  if (!args.bindSucceeded) return false;
  if (!isOnboardingReviewLifecycle(args.profileCompletedAt)) return false;
  const prev = args.previousNormalized.trim();
  const next = args.nextNormalized.trim();
  if (!next || !prev) return false;
  return prev !== next;
}

export function nextReviewContactEditCount(current: unknown): number {
  return normalizeReviewContactCount(current) + 1;
}

/** 21-day recovery quarantine applies after profile completion, not during signup Review. */
export function shouldQuarantineReleasedMobile(args: {
  profileCompletedAt: number | null | undefined;
}): boolean {
  return !isOnboardingReviewLifecycle(args.profileCompletedAt);
}

export function classifyContactAssignment(args: {
  ownerUid: string | null | undefined;
  currentUid: string;
}): ContactAssignmentClass {
  const owner = args.ownerUid?.trim() || "";
  if (!owner) return "unassigned";
  if (owner === args.currentUid) return "assigned_to_current";
  return "assigned_to_other";
}

export function contactsMatchNormalized(a: string, b: string): boolean {
  return a.trim() === b.trim();
}
