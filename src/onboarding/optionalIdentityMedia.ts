/**
 * Optional profile image / logo completion invariant.
 *
 * Absent image is valid. A selected image must be durably saved (or removed)
 * before profile completion. Never treat "no image" as a save failure.
 */

export type IdentityMediaCompletionClass = "absent" | "durable" | "pending";

export function classifyIdentityMediaForCompletion(draft: {
  profileLogo?: { localUri?: string | null } | null;
  logoPersisted?: boolean;
  logoPreviewUri?: string | null;
}): IdentityMediaCompletionClass {
  const uri = draft.profileLogo?.localUri?.trim() ?? "";
  const preview = draft.logoPreviewUri?.trim() ?? "";
  if (!uri && !preview) return "absent";
  if (uri && draft.logoPersisted === true) return "durable";
  return "pending";
}

export const OPTIONAL_MEDIA_PENDING_MESSAGE =
  "Finish saving your profile image, or remove it to continue without one.";

/** @deprecated Never use for absent optional media. Kept to catch regressions. */
export const OPTIONAL_MEDIA_ABSENT_MUST_NOT_SAY =
  "Profile image must be saved before completion.";

export function optionalIdentityMediaCompletionError(
  classification: IdentityMediaCompletionClass
): string | null {
  if (classification === "absent" || classification === "durable") return null;
  return OPTIONAL_MEDIA_PENDING_MESSAGE;
}
