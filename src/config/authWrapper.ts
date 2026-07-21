import type { Href } from "expo-router";

import type { UserProfile } from "@/domain/types";
import {
  clearAuthWrapperProgress,
  markAuthWrapperEmailComplete,
} from "@/auth-v2/authWrapperProgress";
import { hasAuthoritativeVerifiedEmail } from "@/auth/identityRouteState";

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
 * Signed-in user must complete server-authoritative email verification.
 * Presence of `businessEmail` alone is NOT sufficient.
 */
export async function needsAuthWrapperEmailCompletion(
  user: UserProfile
): Promise<boolean> {
  if (hasAuthoritativeVerifiedEmail(user)) {
    await markAuthWrapperEmailComplete(user.uid);
    return false;
  }
  return true;
}

export async function clearAuthWrapperStateForUser(uid: string): Promise<void> {
  await clearAuthWrapperProgress(uid);
}
