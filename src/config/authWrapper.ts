import type { Href } from "expo-router";

import type { UserProfile } from "@/domain/types";
import {
  clearAuthWrapperProgress,
  isAuthWrapperEmailPending,
  markAuthWrapperEmailComplete,
} from "@/auth-v2/authWrapperProgress";

/** Single Indigo auth entry — Auth Wrapper v2 is the only shipped sign-in UI. */
export const AUTH_ENTRY_HREF: Href = "/(auth)/v2";

/** @deprecated Legacy flag — Auth v2 is always enabled. Kept for env compatibility only. */
export function isAuthWrapperV2Enabled(): boolean {
  return true;
}

/** Signed-out entry route (Indigo Auth v2). */
export function getAuthEntryHref(): Href {
  return AUTH_ENTRY_HREF;
}

/**
 * Signed-in user started auth but has not finished the email step yet.
 * Existing users with `businessEmail` are treated as complete.
 */
export async function needsAuthWrapperEmailCompletion(
  user: UserProfile
): Promise<boolean> {
  if (user.businessEmail?.trim()) {
    await markAuthWrapperEmailComplete(user.uid);
    return false;
  }
  return isAuthWrapperEmailPending(user.uid);
}

export async function clearAuthWrapperStateForUser(uid: string): Promise<void> {
  await clearAuthWrapperProgress(uid);
}
