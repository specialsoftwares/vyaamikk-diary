import type { UserProfile } from "@/domain/types";

/** Fields written to the user profile on OTP confirm (all backends). */
export const LOGIN_TIMESTAMP_PATCH_KEYS = [
  "lastLoginAt",
  "previousLoginAt",
  "lastActiveAt",
  "updatedAt",
] as const;

/**
 * Advance login timestamps after a successful OTP sign-in.
 *
 * - `lastLoginAt` ← now (current session only; never updated on app open)
 * - `previousLoginAt` ← prior `lastLoginAt` (shown in Settings as "Last login")
 * - `lastActiveAt` ← now (usage heartbeat; separate label)
 */
export function applyOtpLoginTimestamps(
  profile: UserProfile,
  now: number = Date.now()
): UserProfile {
  const priorLogin = profile.lastLoginAt;
  return {
    ...profile,
    previousLoginAt: priorLogin ?? profile.previousLoginAt ?? null,
    lastLoginAt: now,
    lastActiveAt: now,
    updatedAt: now,
  };
}

export type LoginSubtitle =
  | { kind: "last_login"; ms: number }
  | { kind: "first_login" };

/**
 * Login line for Settings — never uses lastActiveAt or session load time.
 */
export function resolveLoginSubtitle(user: UserProfile | null): LoginSubtitle | null {
  if (!user) return null;
  if (user.previousLoginAt != null && user.previousLoginAt > 0) {
    return { kind: "last_login", ms: user.previousLoginAt };
  }
  if (user.lastLoginAt != null && user.lastLoginAt > 0) {
    return { kind: "first_login" };
  }
  return null;
}
