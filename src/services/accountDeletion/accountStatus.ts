import type { AccountStatus } from "@/domain/accountDeletion";
import { DELETION_GRACE_MS } from "@/domain/identityLifecycle";
import type { UserProfile } from "@/domain/types";

export function resolveAccountStatus(profile: UserProfile): AccountStatus {
  if (profile.status) return profile.status;
  if (profile.deletedAt != null) return "deleted";
  return "active";
}

export function isActiveAccount(profile: UserProfile): boolean {
  return resolveAccountStatus(profile) === "active";
}

export function isPendingDeletionAccount(profile: UserProfile): boolean {
  return resolveAccountStatus(profile) === "pending_deletion";
}

export function isDeletedAccount(profile: UserProfile): boolean {
  return resolveAccountStatus(profile) === "deleted";
}

/** True when OTP / normal app use must not continue. */
export function isLoginBlockedAccount(profile: UserProfile): boolean {
  const s = resolveAccountStatus(profile);
  return s === "deleted" || s === "pending_deletion";
}

export function deletionScheduledFor(profile: UserProfile): number | null {
  if (profile.deletionScheduledFor != null && profile.deletionScheduledFor > 0) {
    return profile.deletionScheduledFor;
  }
  if (profile.deletionRequestedAt != null && profile.deletionRequestedAt > 0) {
    return profile.deletionRequestedAt + DELETION_GRACE_MS;
  }
  return null;
}

export function isDeletionGraceElapsed(profile: UserProfile): boolean {
  if (!isPendingDeletionAccount(profile)) return false;
  const scheduled = deletionScheduledFor(profile);
  if (scheduled == null) return true;
  return Date.now() >= scheduled;
}
