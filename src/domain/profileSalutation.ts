/** Honorific stored on profile — optional, used in dashboard greeting + PDFs. */
export type ProfileSalutationId =
  | "none"
  | "mr"
  | "mrs"
  | "ms"
  | "dr"
  | "shri"
  | "smt";

export const PROFILE_SALUTATION_IDS: ProfileSalutationId[] = [
  "none",
  "mr",
  "mrs",
  "ms",
  "dr",
  "shri",
  "smt",
];

/** Salutations offered during onboarding (no "none"). */
export type ProfileSalutationChoiceId = Exclude<ProfileSalutationId, "none">;

export const PROFILE_SALUTATION_CHOICE_IDS: ProfileSalutationChoiceId[] =
  PROFILE_SALUTATION_IDS.filter((id): id is ProfileSalutationChoiceId => id !== "none");

export const DEFAULT_ONBOARDING_SALUTATION: ProfileSalutationChoiceId = "mr";

export function onboardingSalutationDefault(
  stored: ProfileSalutationId | null | undefined
): ProfileSalutationChoiceId {
  if (stored && stored !== "none") return stored;
  return DEFAULT_ONBOARDING_SALUTATION;
}

export function isProfileSalutationId(value: unknown): value is ProfileSalutationId {
  return (
    typeof value === "string" &&
    (PROFILE_SALUTATION_IDS as readonly string[]).includes(value)
  );
}

export function normaliseProfileSalutation(value: unknown): ProfileSalutationId | null {
  if (value == null || value === "") return null;
  return isProfileSalutationId(value) ? value : null;
}
