/**
 * Review-targeted edit intent — distinct from normal onboarding progression.
 * Editing one Review section must not advance into subsequent wizard phases.
 */

export type ReviewEditTarget =
  | "identity"
  | "media"
  | "contacts"
  | "location"
  | "gstin"
  | "constitution";

export const REVIEW_EDIT_TARGETS: readonly ReviewEditTarget[] = [
  "identity",
  "media",
  "contacts",
  "location",
  "gstin",
  "constitution",
] as const;

export function parseReviewEditTarget(raw: unknown): ReviewEditTarget | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  return (REVIEW_EDIT_TARGETS as readonly string[]).includes(value)
    ? (value as ReviewEditTarget)
    : null;
}

export function isReviewEditIntent(intent: unknown): boolean {
  const value = Array.isArray(intent) ? intent[0] : intent;
  return value === "review";
}

/** Only PIN/location review-edit may invoke PIN lookup. */
export function reviewEditAllowsPinLookup(target: ReviewEditTarget): boolean {
  return target === "location";
}

export function reviewEditReturnsToHref(): "/(auth)/profile-review" {
  return "/(auth)/profile-review";
}

/** Review → editor must push so system Back has a previous route. */
export function reviewEditEnterHref(section: ReviewEditTarget): {
  pathname: "/(auth)/complete-profile";
  params: { section: ReviewEditTarget; intent: "review" };
} {
  return {
    pathname: "/(auth)/complete-profile",
    params: { section, intent: "review" },
  };
}

export type ReviewDraftSlice = {
  displayName: string;
  businessName: string;
  constitution: string;
  gstin: string;
  pinCode: string;
  confirmedLocality: string | null;
  confirmedDistrict: string | null;
  confirmedState: string | null;
  logoPreviewUri: string | null;
  phoneE164: string;
  email: string;
};

/** Apply a targeted patch without clearing unrelated Review fields. */
export function applyReviewEditPatch(
  base: ReviewDraftSlice,
  target: ReviewEditTarget,
  patch: Partial<ReviewDraftSlice>
): ReviewDraftSlice {
  switch (target) {
    case "identity":
      return {
        ...base,
        displayName: patch.displayName ?? base.displayName,
        businessName: patch.businessName ?? base.businessName,
      };
    case "media":
      return {
        ...base,
        logoPreviewUri:
          patch.logoPreviewUri !== undefined ? patch.logoPreviewUri : base.logoPreviewUri,
      };
    case "contacts":
      return {
        ...base,
        phoneE164: patch.phoneE164 ?? base.phoneE164,
        email: patch.email ?? base.email,
      };
    case "location":
      return {
        ...base,
        pinCode: patch.pinCode ?? base.pinCode,
        confirmedLocality:
          patch.confirmedLocality !== undefined
            ? patch.confirmedLocality
            : base.confirmedLocality,
        confirmedDistrict:
          patch.confirmedDistrict !== undefined
            ? patch.confirmedDistrict
            : base.confirmedDistrict,
        confirmedState:
          patch.confirmedState !== undefined ? patch.confirmedState : base.confirmedState,
      };
    case "gstin":
      return { ...base, gstin: patch.gstin ?? base.gstin };
    case "constitution":
      return { ...base, constitution: patch.constitution ?? base.constitution };
    default:
      return base;
  }
}

/**
 * Contact replacement must stay pending until fresh verification succeeds.
 * Typing alone never marks the contact verified.
 */
export function resolveContactVerificationState(args: {
  currentVerified: string;
  pendingInput: string;
  verificationSucceededFor: string | null;
}): {
  authoritative: string;
  pending: string | null;
  verified: boolean;
} {
  const current = args.currentVerified.trim();
  const pending = args.pendingInput.trim();
  if (!pending || pending === current) {
    return { authoritative: current, pending: null, verified: true };
  }
  if (
    args.verificationSucceededFor &&
    args.verificationSucceededFor.trim() === pending
  ) {
    return { authoritative: pending, pending: null, verified: true };
  }
  return { authoritative: current, pending, verified: false };
}

export function shouldAdvanceToLocationAfterDetailsSave(args: {
  reviewEditTarget: ReviewEditTarget | null;
}): boolean {
  // Review-targeted identity/constitution/gstin/media/contacts must NEVER advance.
  return args.reviewEditTarget == null;
}
