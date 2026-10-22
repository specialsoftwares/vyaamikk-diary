import type { UserProfile } from "@/domain/types";
import { hashMobileE164, normalizePhoneE164 } from "@/utils/mobileHash";

/**
 * Client deletion request. Policy version and deadlines are server-stamped.
 * The device clock is not the acceptance time.
 */
export function pendingDeletionPatch(
  profile: UserProfile,
  now = Date.now()
): Pick<
  UserProfile,
  "status" | "deletionCompletedAt" | "retiredUeid" | "mobileHash" | "updatedAt"
> {
  const phone = normalizePhoneE164(profile.phoneE164);
  return {
    status: "pending_deletion",
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
