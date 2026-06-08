import type { UserProfile } from "@/domain/types";
import { computeDeletionScheduledFor } from "@/domain/identityLifecycle";
import { hashMobileE164, normalizePhoneE164 } from "@/utils/mobileHash";

/** Fields written when the user requests deletion (grace period — not final yet). */
export function pendingDeletionPatch(
  profile: UserProfile,
  now = Date.now()
): Pick<
  UserProfile,
  | "status"
  | "deletionRequestedAt"
  | "deletionScheduledFor"
  | "deletionCompletedAt"
  | "retiredUeid"
  | "mobileHash"
  | "updatedAt"
> {
  const phone = normalizePhoneE164(profile.phoneE164);
  return {
    status: "pending_deletion",
    deletionRequestedAt: now,
    deletionScheduledFor: computeDeletionScheduledFor(now),
    deletionCompletedAt: null,
    retiredUeid: false,
    mobileHash: profile.mobileHash ?? hashMobileE164(phone),
    updatedAt: now,
  };
}

export function cancelDeletionPatch(now = Date.now()): Pick<
  UserProfile,
  | "status"
  | "deletionRequestedAt"
  | "deletionScheduledFor"
  | "deletionCompletedAt"
  | "updatedAt"
> {
  return {
    status: "active",
    deletionRequestedAt: null,
    deletionScheduledFor: null,
    deletionCompletedAt: null,
    updatedAt: now,
  };
}
