/**
 * Server copy of signup Review contact-edit policy.
 * Keep in lockstep with src/auth-v2/reviewContactEditPolicy.ts.
 */

export const REVIEW_CONTACT_EDIT_MAX = 2;

export const REVIEW_MOBILE_EDIT_LIMIT_MESSAGE =
  "You can change your mobile number twice during signup review.";

export const REVIEW_EMAIL_EDIT_LIMIT_MESSAGE =
  "You can change your email twice during signup review.";

export function isOnboardingReviewLifecycle(
  profileCompletedAt: number | null | undefined
): boolean {
  return profileCompletedAt == null || profileCompletedAt === 0;
}

export function normalizeReviewContactCount(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.floor(raw));
}

export function reviewContactEditAllowed(count: unknown): boolean {
  return REVIEW_CONTACT_EDIT_MAX - normalizeReviewContactCount(count) > 0;
}

export function reviewContactEditLimitMessage(channel: "mobile" | "email"): string {
  return channel === "mobile"
    ? REVIEW_MOBILE_EDIT_LIMIT_MESSAGE
    : REVIEW_EMAIL_EDIT_LIMIT_MESSAGE;
}

export function assertReviewContactEditAllowed(args: {
  channel: "mobile" | "email";
  count: unknown;
  profileCompletedAt: number | null | undefined;
}): { ok: true } | { ok: false; message: string } {
  if (!isOnboardingReviewLifecycle(args.profileCompletedAt)) {
    return { ok: true };
  }
  if (reviewContactEditAllowed(args.count)) return { ok: true };
  return { ok: false, message: reviewContactEditLimitMessage(args.channel) };
}

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

export function shouldQuarantineReleasedMobile(args: {
  profileCompletedAt: number | null | undefined;
}): boolean {
  return !isOnboardingReviewLifecycle(args.profileCompletedAt);
}

export function classifyContactAssignment(args: {
  ownerUid: string | null | undefined;
  currentUid: string;
}): "unassigned" | "assigned_to_current" | "assigned_to_other" {
  const owner = args.ownerUid?.trim() || "";
  if (!owner) return "unassigned";
  if (owner === args.currentUid) return "assigned_to_current";
  return "assigned_to_other";
}
